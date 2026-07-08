/* Copyright(C) 2019-2026, HJD (https://github.com/hjdhjd). All rights reserved.
 *
 * credentials.ts: Discovery, validation, and normalization of the ufp.json credentials the CLI connects with.
 */
import { CliError } from "./shared.ts";
import { homedir } from "node:os";
import path from "node:path";
import { readFile } from "node:fs/promises";

/**
 * The normalized credentials the CLI connects with. `host` is the bare address {@link ProtectClient.connect} expects (no scheme, port preserved) - we accept the
 * documented `controller` form in the file (which may carry an `https://` scheme) and normalize it here, so the connect path never has to think about schemes.
 *
 * @category CLI
 */
export interface UfpCredentials {

  host: string;
  password: string;
  username: string;
}

/**
 * Options for {@link loadCredentials}. The defaults read the real working directory and home directory; tests override them to point at a temporary fixture without
 * touching the developer's real `~/.ufp.json`.
 *
 * @category CLI
 */
export interface LoadCredentialsOptions {

  cwd?: string;
  home?: string;
}

// The credentials file's on-disk shape. `controller` is the documented field name (a hostname, ip, or full URL); we translate it to the normalized `host` on load.
interface CredentialsFile {

  controller: string;
  password: string;
  username: string;
}

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
function requireField(record: Record<string, unknown>, key: keyof CredentialsFile, source: string): string {

  const value = record[key];

  if((typeof value !== "string") || (value.length === 0)) {

    throw new CliError("The ufp.json configuration at " + source + " is missing the required \"" + key + "\" field.");
  }

  return value;
}

/**
 * Locate, parse, validate, and normalize the CLI credentials. The discovery order is `./ufp.json` in the working directory first, then `~/.ufp.json` in the
 * home directory. The first file that exists wins; a malformed or incomplete file is a hard error (we do not silently fall through to the next location, because a
 * present-but-broken file is a mistake the operator wants told about, not masked).
 *
 * @param opts - Optional working-directory and home-directory overrides (defaults to the real ones).
 *
 * @returns The normalized credentials.
 *
 * @throws {@link CliError} when no configuration is found, or when the one found is unreadable, malformed, or missing a field.
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

  return {

    host: normalizeHost(requireField(record, "controller", source)),
    password: requireField(record, "password", source),
    username: requireField(record, "username", source)
  };
}
