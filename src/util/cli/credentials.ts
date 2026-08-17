/* Copyright(C) 2019-2026, HJD (https://github.com/hjdhjd). All rights reserved.
 *
 * credentials.ts: Discovery, validation, and normalization of the ufp.json credentials the CLI connects with.
 */
import { readFile, writeFile } from "node:fs/promises";
import { CliError } from "./shared.ts";
import { ProtectAbortedError } from "../../index.ts";
import { Writable } from "node:stream";
import { createInterface } from "node:readline/promises";
import { homedir } from "node:os";
import path from "node:path";

/**
 * The normalized credentials the CLI connects with. `host` is the bare address {@link ProtectClient.connect} expects (no scheme, port preserved) - we accept the
 * documented `controller` form in the file (which may carry an `https://` scheme) and normalize it here, so the connect path never has to think about schemes.
 * `verifyTls` is the file's strict-TLS opt-in, carried through to the connect options under the name the library gives it and left off entirely when the file is
 * silent, so the library's own default decides.
 *
 * @category CLI
 */
export interface UfpCredentials {

  host: string;
  password: string;
  username: string;
  verifyTls?: boolean;
}

/**
 * The streams an interactive credential prompt reads from and writes to, plus the signal that cancels it. `isTTY` travels with each stream because whether a prompt is
 * appropriate at all is decided from it - by the caller, not here.
 *
 * @category CLI
 */
export interface InteractivePrompt {

  input: NodeJS.ReadableStream & { isTTY?: boolean };
  output: NodeJS.WritableStream & { isTTY?: boolean };
  signal?: AbortSignal;
}

/**
 * Options for {@link loadCredentials}. The defaults read the real working directory and home directory; tests override them to point at a temporary fixture without
 * touching the developer's real `~/.ufp.json`.
 *
 * `interactive` is the whole mode switch: supplied, a first run with no configuration file asks for credentials instead of failing; absent, discovery behaves exactly
 * as it always does and an absent file is an error. It is one object rather than loose fields so present-or-absent is the only state there is, and the decision of
 * whether prompting is appropriate stays with the caller that knows about terminals - this loader is deterministic and never consults ambient state of its own.
 *
 * @category CLI
 */
export interface LoadCredentialsOptions {

  cwd?: string;
  home?: string;
  interactive?: InteractivePrompt;
}

// The credentials file's on-disk shape. `controller` is the documented field name (a hostname, ip, or full URL); we translate it to the normalized `host` on load.
// `verifyTls` is optional, and has its own reader below because it is the one field that is not a string.
interface CredentialsFile {

  controller: string;
  password: string;
  username: string;
  verifyTls?: boolean;
}

// The file's string-valued fields, which are the ones requireField answers for. Derived from the shape rather than restated, so a field joins the set by its own type,
// and the boolean field - which has its own reader - cannot be asked for here.
type CredentialsStringField = { [K in keyof CredentialsFile]-?: NonNullable<CredentialsFile[K]> extends string ? K : never }[keyof CredentialsFile];

// Normalize the configured controller address to the bare host[:port] the connect path wants. A value carrying a scheme is parsed as a URL and reduced to its host
// (scheme and path dropped, port kept); a bare value has any trailing path stripped. This is what lets ufp.json carry either "https://10.0.0.1" or "10.0.0.1" and behave
// identically.
function normalizeHost(controller: string): string {

  const trimmed = controller.trim();

  if(/^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed)) {

    try {

      return new URL(trimmed).host;
    } catch(error) {

      throw new CliError("The controller address in the ufp.json configuration is not a valid URL.", { cause: error });
    }
  }

  return trimmed.replace(/\/.*$/, "");
}

// Read a candidate file, returning its text or null when the file simply is not there (the expected "try the next location" case). Any other read failure is a real
// problem - a permission error, a directory where a file was expected - and surfaces as a CliError rather than being silently skipped.
async function readIfPresent(file: string): Promise<string | null> {

  try {

    return await readFile(file, "utf8");
  } catch(error) {

    if((error as NodeJS.ErrnoException).code === "ENOENT") {

      return null;
    }

    throw new CliError("Unable to read the ufp.json configuration at " + file + ".", { cause: error });
  }
}

// Pull a required, non-empty string field out of the parsed file, or fail with a message that names both the field and where the file came from. Centralized so every
// required field is validated identically.
function requireField(record: Record<string, unknown>, key: CredentialsStringField, source: string): string {

  const value = record[key];

  if((typeof value !== "string") || (value.length === 0)) {

    throw new CliError("The ufp.json configuration at " + source + " is missing the required \"" + key + "\" field.");
  }

  return value;
}

// Read the strict-TLS opt-in. A value that is present must be a boolean rather than anything that could be coerced into one: coercion would read the string "false" as
// an opt-in, which is the one misreading that silently changes how the connection is trusted.
function readVerifyTls(record: Record<string, unknown>, source: string): boolean | undefined {

  const value = record["verifyTls"];

  if(value === undefined) {

    return undefined;
  }

  if(typeof value !== "boolean") {

    throw new CliError("The ufp.json configuration at " + source + " must express its \"verifyTls\" field as a boolean.");
  }

  return value;
}

// Put one line in front of the person answering. Separate from what readline echoes, because the echo is what gets suppressed for a password and these lines never are.
type WriteLine = (line: string) => void;

// Put one question and read its answer. `masked` suppresses the echo of the answer, never of the question.
type AskQuestion = (prompt: string, masked: boolean) => Promise<string>;

// What one prompted field needs: the question, the line for an empty answer, the line for an answer the shared validation pipeline rejected, whether the answer is
// echoed, and how to normalize it. The recovery lines are the prompt's own voice: the pipeline's messages name a configuration file, which is the wrong thing to say
// to someone who is typing an answer rather than editing a file.
interface FieldPrompt {

  masked?: boolean;
  normalize?: (value: string) => string;
  prompt: string;
  rejected: string;
  required: string;
}

// Ask one field until the answer is usable, recovering in place rather than failing the run. Recovery is prompt behavior, not a second validation pipeline: the answer
// is normalized by the very same functions the file path uses, and only the wording of a retry belongs to the prompt.
async function askField(ask: AskQuestion, write: WriteLine, field: FieldPrompt): Promise<string> {

  for(;;) {

    // Sequential by nature - the next question is only worth asking once this one has been answered, so there is nothing here to run concurrently.
    // eslint-disable-next-line no-await-in-loop
    const answer = (await ask(field.prompt, field.masked ?? false)).trim();

    if(answer.length === 0) {

      write(field.required + "\n");

      continue;
    }

    if(field.normalize === undefined) {

      return answer;
    }

    try {

      return field.normalize(answer);
    } catch {

      write(field.rejected + "\n");
    }
  }
}

// Offer to keep the entered credentials, so the next run finds a file instead of asking again. The offer names the exact path it writes, and declining is a complete
// answer - the run continues either way with what was entered.
async function offerToSave(ask: AskQuestion, write: WriteLine, file: string, credentials: UfpCredentials): Promise<void> {

  const answer = (await ask("Save these credentials to " + file + "? [y/N]: ", false)).trim().toLowerCase();

  if((answer !== "y") && (answer !== "yes")) {

    write("Continuing without saving.\n");

    return;
  }

  // The normalized host is written rather than the text as typed: it is the value that was validated, and reading it back through discovery leaves it unchanged.
  // Owner-only permissions, because the file holds a password in clear text.
  await writeFile(file, JSON.stringify({ controller: credentials.host, password: credentials.password, username: credentials.username }, null, 2) + "\n",
    { encoding: "utf8", mode: 0o600 });

  write("Saved " + file + ".\n");
}

// Collect credentials interactively. The readline interface is built for this one run and closed on every exit path - a completed entry, a declined save, a
// cancellation, or an unexpected throw - so neither the interface nor a listener outlives the prompt.
async function promptForCredentials(interactive: InteractivePrompt, home: string): Promise<UfpCredentials> {

  const { input, output } = interactive;

  // A password is asked for with its echo suppressed. Readline echoes to whatever stream it was handed, so it is handed a gate rather than the real output, and the
  // gate closes only while the one answer that must not appear on screen is being typed.
  let masked = false;

  const gate = new Writable({

    write(chunk: Buffer, encoding: BufferEncoding, callback: (error?: Error | null) => void): void {

      if(!masked) {

        output.write(chunk);
      }

      callback();
    }
  });

  const rl = createInterface({ input, output: gate });
  const write: WriteLine = (line) => void output.write(line);

  // One abort for the whole prompt. The caller's Ctrl-C signal feeds it, and so does readline's own SIGINT: on a raw terminal readline intercepts Ctrl-C before any
  // process-level handler sees it, so without this hook the prompt would keep waiting after the user had already asked to leave.
  const cancelled = new AbortController();
  const cancel = (): void => cancelled.abort();

  rl.on("SIGINT", cancel);
  interactive.signal?.addEventListener("abort", cancel, { once: true });

  if(interactive.signal?.aborted === true) {

    cancel();
  }

  // Ask one question. A masked question writes its own prompt straight to the output before the gate closes and hands readline an empty query, because a gate closed
  // around the whole exchange would hide the question along with the answer. A rejection while the abort has fired is a cancellation and becomes the library's typed
  // abort, so the entry point's usual exit handling applies; anything else is a real failure and surfaces as itself.
  const ask: AskQuestion = async (prompt, wantsMask) => {

    if(wantsMask) {

      write(prompt);
    }

    masked = wantsMask;

    try {

      return await rl.question(wantsMask ? "" : prompt, { signal: cancelled.signal });
    } catch(error) {

      if(cancelled.signal.aborted) {

        throw new ProtectAbortedError("The interactive credential prompt was cancelled.", { cause: error });
      }

      throw error;
    } finally {

      masked = false;

      // The newline the operator's own Enter produced went into the closed gate with the rest of the echo, so the cursor is moved on explicitly.
      if(wantsMask) {

        write("\n");
      }
    }
  };

  try {

    write("No ufp.json configuration was found. Enter the controller details to continue.\n");

    const host = await askField(ask, write, {

      normalize: normalizeHost,
      prompt: "Controller address (hostname, IP address, or URL): ",
      rejected: "That controller address could not be read. Enter a hostname, an IP address, or a full URL.",
      required: "A controller address is required."
    });

    const username = await askField(ask, write, {

      prompt: "Username: ",
      rejected: "That username could not be read.",
      required: "A username is required."
    });

    const password = await askField(ask, write, {

      masked: true,
      prompt: "Password: ",
      rejected: "That password could not be read.",
      required: "A password is required."
    });

    const credentials: UfpCredentials = { host, password, username };

    await offerToSave(ask, write, path.join(home, ".ufp.json"), credentials);

    return credentials;
  } finally {

    rl.off("SIGINT", cancel);
    interactive.signal?.removeEventListener("abort", cancel);
    rl.close();
  }
}

/**
 * Locate, parse, validate, and normalize the CLI credentials. The discovery order is `./ufp.json` in the working directory first, then `~/.ufp.json` in the
 * home directory. The first file that exists wins; a malformed or incomplete file is a hard error (we do not silently fall through to the next location, because a
 * present-but-broken file is a mistake the operator wants told about, not masked).
 *
 * When no file is found and the caller supplied `interactive`, the details are asked for instead: the same normalization and validation the file path uses is applied
 * to what is typed, and the answers are offered a home in `~/.ufp.json` so the next run finds a file. A broken file is never a prompt - only an absent one is, because
 * a present file that is wrong is something to fix rather than to type around.
 *
 * @param opts - Optional working-directory and home-directory overrides (defaults to the real ones), and the interactive prompt to fall back on.
 *
 * @returns The normalized credentials.
 *
 * @throws {@link CliError} when no configuration is found and no prompt was offered, or when the one found is unreadable, malformed, or missing a field.
 * @throws {@link ProtectAbortedError} when an interactive prompt is cancelled.
 *
 * @category CLI
 */
export async function loadCredentials(opts: LoadCredentialsOptions = {}): Promise<UfpCredentials> {

  const cwd = opts.cwd ?? process.cwd();
  const home = opts.home ?? homedir();
  const candidates = [ path.join(cwd, "ufp.json"), path.join(home, ".ufp.json") ];

  let raw: string | null = null;
  let source = "";

  for(const file of candidates) {

    // Sequential by intent: we probe the locations in priority order and stop at the first that exists, so reading them concurrently would be both wasteful and wrong.
    // eslint-disable-next-line no-await-in-loop
    raw = await readIfPresent(file);

    if(raw !== null) {

      source = file;

      break;
    }
  }

  if(raw === null) {

    // A first run in a terminal asks rather than fails. Everywhere else - a script, a pipe, a CI job - an absent configuration stays exactly the error it has always
    // been, because there is nobody there to answer.
    if(opts.interactive !== undefined) {

      return await promptForCredentials(opts.interactive, home);
    }

    throw new CliError("No ufp.json configuration was found. Create ./ufp.json or ~/.ufp.json with \"controller\", \"username\", and \"password\" fields.");
  }

  let parsed: unknown;

  try {

    parsed = JSON.parse(raw);
  } catch(error) {

    throw new CliError("The ufp.json configuration at " + source + " is not valid JSON.", { cause: error });
  }

  if((typeof parsed !== "object") || (parsed === null)) {

    throw new CliError("The ufp.json configuration at " + source + " must be a JSON object.");
  }

  const record = parsed as Record<string, unknown>;
  const verifyTls = readVerifyTls(record, source);

  return {

    host: normalizeHost(requireField(record, "controller", source)),
    password: requireField(record, "password", source),
    username: requireField(record, "username", source),
    ...((verifyTls !== undefined) && { verifyTls })
  };
}
