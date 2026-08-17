/* Copyright(C) 2019-2026, HJD (https://github.com/hjdhjd). All rights reserved.
 *
 * credentials.test.ts: Unit tests for ufp.json discovery (cwd before home), controller normalization, and validation failures.
 */
import { PassThrough, Writable } from "node:stream";
import { describe, test } from "node:test";
import { mkdir, mkdtemp, rm, stat, writeFile } from "node:fs/promises";
import { CliError } from "./shared.ts";
import type { InteractivePrompt } from "./credentials.ts";
import { ProtectAbortedError } from "../../index.ts";
import assert from "node:assert/strict";
import { loadCredentials } from "./credentials.ts";
import path from "node:path";
import { tmpdir } from "node:os";

// Run a test body with a fresh, isolated working directory and home directory, cleaning both afterward so the developer's real ~/.ufp.json is never touched.
async function withDirs(body: (cwd: string, home: string) => Promise<void>): Promise<void> {

  const cwd = await mkdtemp(path.join(tmpdir(), "ufp-cli-cwd-"));
  const home = await mkdtemp(path.join(tmpdir(), "ufp-cli-home-"));

  try {

    await body(cwd, home);
  } finally {

    await rm(cwd, { force: true, recursive: true });
    await rm(home, { force: true, recursive: true });
  }
}

describe("loadCredentials", () => {

  test("loads ./ufp.json and normalizes a scheme+port controller to host[:port]", async () => {

    await withDirs(async (cwd, home) => {

      await writeFile(path.join(cwd, "ufp.json"), JSON.stringify({ controller: "https://10.0.0.5:7443", password: "p", username: "u" }));

      assert.deepEqual(await loadCredentials({ cwd, home }), { host: "10.0.0.5:7443", password: "p", username: "u" });
    });
  });

  test("accepts a bare-host controller unchanged", async () => {

    await withDirs(async (cwd, home) => {

      await writeFile(path.join(cwd, "ufp.json"), JSON.stringify({ controller: "controller.local", password: "p", username: "u" }));

      assert.equal((await loadCredentials({ cwd, home })).host, "controller.local");
    });
  });

  test("prefers ./ufp.json over ~/.ufp.json", async () => {

    await withDirs(async (cwd, home) => {

      await writeFile(path.join(cwd, "ufp.json"), JSON.stringify({ controller: "cwd-host", password: "p", username: "u" }));
      await writeFile(path.join(home, ".ufp.json"), JSON.stringify({ controller: "home-host", password: "p", username: "u" }));

      assert.equal((await loadCredentials({ cwd, home })).host, "cwd-host");
    });
  });

  test("falls back to ~/.ufp.json when ./ufp.json is absent", async () => {

    await withDirs(async (cwd, home) => {

      await writeFile(path.join(home, ".ufp.json"), JSON.stringify({ controller: "home-host", password: "p", username: "u" }));

      assert.equal((await loadCredentials({ cwd, home })).host, "home-host");
    });
  });

  test("throws when no configuration is found", async () => {

    await withDirs(async (cwd, home) => {

      await assert.rejects(loadCredentials({ cwd, home }), CliError);
    });
  });

  test("throws on malformed JSON", async () => {

    await withDirs(async (cwd, home) => {

      await writeFile(path.join(cwd, "ufp.json"), "{ not json");

      await assert.rejects(loadCredentials({ cwd, home }), CliError);
    });
  });

  test("throws when a required field is missing", async () => {

    await withDirs(async (cwd, home) => {

      await writeFile(path.join(cwd, "ufp.json"), JSON.stringify({ controller: "host", username: "u" }));

      await assert.rejects(loadCredentials({ cwd, home }), CliError);
    });
  });

  test("throws when a scheme-bearing controller is not a parseable URL", async () => {

    await withDirs(async (cwd, home) => {

      // "http://[" carries a scheme, so normalization takes the URL-parse path - but it is not a valid URL, so the typed CliError surfaces rather than a raw URL throw.
      await writeFile(path.join(cwd, "ufp.json"), JSON.stringify({ controller: "http://[", password: "p", username: "u" }));

      await assert.rejects(loadCredentials({ cwd, home }), CliError);
    });
  });

  test("throws when the configuration path is present but unreadable (a non-ENOENT read failure)", async () => {

    await withDirs(async (cwd, home) => {

      // A directory named ufp.json makes readFile fail with EISDIR rather than ENOENT. A present-but-unreadable file is a hard error the operator is told about, never
      // silently skipped the way a genuinely-absent file is.
      await mkdir(path.join(cwd, "ufp.json"));

      await assert.rejects(loadCredentials({ cwd, home }), CliError);
    });
  });

  test("throws when the configuration is valid JSON but not an object", async () => {

    await withDirs(async (cwd, home) => {

      await writeFile(path.join(cwd, "ufp.json"), "123");

      await assert.rejects(loadCredentials({ cwd, home }), CliError);
    });
  });

  test("the strict-TLS opt-in is carried as the file states it, and left absent when the file is silent", async () => {

    await withDirs(async (cwd, home) => {

      const identity = { password: "p", username: "u" };

      await writeFile(path.join(cwd, "ufp.json"), JSON.stringify({ controller: "10.0.0.1", ...identity, verifyTls: true }));

      assert.deepEqual(await loadCredentials({ cwd, home }), { host: "10.0.0.1", ...identity, verifyTls: true });

      // A stated false is carried as stated rather than folded into silence: the two ask the library for the same thing, and only one of them asks on purpose.
      await writeFile(path.join(cwd, "ufp.json"), JSON.stringify({ controller: "10.0.0.1", ...identity, verifyTls: false }));

      assert.deepEqual(await loadCredentials({ cwd, home }), { host: "10.0.0.1", ...identity, verifyTls: false });

      // Silence leaves the key off the result entirely rather than carrying an undefined one, which is what lets the connect path's conditional spread mean "not asked
      // for" rather than "asked for nothing".
      await writeFile(path.join(cwd, "ufp.json"), JSON.stringify({ controller: "10.0.0.1", ...identity }));

      assert.deepEqual(Object.keys(await loadCredentials({ cwd, home })).sort(), [ "host", "password", "username" ]);
    });
  });

  test("a non-boolean strict-TLS value is refused rather than coerced", async () => {

    await withDirs(async (cwd, home) => {

      // The string "false" is the case that earns the check: coercing it would read as an opt-in and change how the connection is trusted, so the file is corrected
      // rather than interpreted.
      await writeFile(path.join(cwd, "ufp.json"), JSON.stringify({ controller: "10.0.0.1", password: "p", username: "u", verifyTls: "false" }));

      await assert.rejects(loadCredentials({ cwd, home }),
        (error: unknown) => (error instanceof CliError) && error.message.includes("\"verifyTls\"") && error.message.includes("boolean"));
    });
  });
});

/* Drive an interactive prompt from a script of answers.
 *
 * The output stream answers the next scripted line whenever a question is put to it, which a prompt announces by ending in ": " with no newline. Answering on demand
 * rather than writing the whole script up front is what a person at a terminal does, and it is also what keeps readline from being handed input before it has asked
 * for it - lines that arrive early are simply dropped.
 *
 * A script that runs out leaves the prompt waiting, which is deliberate: a test that asks more questions than it scripted answers for should stall and be noticed
 * rather than silently loop on empty answers.
 */
function scriptedPrompt(answers: readonly string[], opts: { onPrompt?: () => void; signal?: AbortSignal } = {}): {

  input: PassThrough;
  interactive: InteractivePrompt;
  text: () => string;
} {

  const input = new PassThrough();
  const chunks: string[] = [];

  let index = 0;

  const output = new Writable({

    write(chunk: Buffer, encoding: BufferEncoding, callback: (error?: Error | null) => void): void {

      const rendered = chunk.toString();

      chunks.push(rendered);

      if(rendered.endsWith(": ")) {

        const answer = answers[index];

        index += 1;
        opts.onPrompt?.();

        if(answer !== undefined) {

          setImmediate(() => void input.write(answer + "\n"));
        }
      }

      callback();
    }
  });

  return { input, interactive: { input, output, ...((opts.signal !== undefined) && { signal: opts.signal }) }, text: (): string => chunks.join("") };
}

describe("loadCredentials interactive prompt", () => {

  test("asks for the details and normalizes them exactly as the file path would", async () => {

    await withDirs(async (cwd, home) => {

      const { interactive } = scriptedPrompt([ "https://10.0.0.5:7443", "admin", "hunter2", "n" ]);
      const prompted = await loadCredentials({ cwd, home, interactive });

      assert.deepEqual(prompted, { host: "10.0.0.5:7443", password: "hunter2", username: "admin" });

      // The same controller text written into a file must produce the same credentials: one normalization pipeline serves both entry paths, so a prompt can never
      // accept something the file path would have rejected or normalize it differently.
      await writeFile(path.join(cwd, "ufp.json"), JSON.stringify({ controller: "https://10.0.0.5:7443", password: "hunter2", username: "admin" }));

      assert.deepEqual(prompted, await loadCredentials({ cwd, home }));
    });
  });

  test("the password question is visible while its answer is not", async () => {

    await withDirs(async (cwd, home) => {

      const { interactive, text } = scriptedPrompt([ "10.0.0.5", "admin", "hunter2", "n" ]);

      await loadCredentials({ cwd, home, interactive });

      // The mute is scoped to the answer: the question still has to reach the screen, or the operator would be typing at a blank line.
      assert.match(text(), /Password: /);
      assert.ok(!text().includes("hunter2"), "the password never reaches the output");
      assert.match(text(), /Username: /);
    });
  });

  test("accepting the offer saves an owner-only file the next run can read", async () => {

    await withDirs(async (cwd, home) => {

      const { interactive, text } = scriptedPrompt([ "10.0.0.5", "admin", "hunter2", "y" ]);
      const prompted = await loadCredentials({ cwd, home, interactive });
      const file = path.join(home, ".ufp.json");

      assert.equal((await stat(file)).mode & 0o777, 0o600, "the file holds a password in clear text, so nobody else on the machine can read it");
      assert.match(text(), /Save these credentials to /);

      // The saved file is what a later run finds, which is the whole point of offering to write it.
      assert.deepEqual(await loadCredentials({ cwd, home }), prompted);
    });
  });

  test("declining the offer still connects and writes nothing", async () => {

    await withDirs(async (cwd, home) => {

      const { interactive } = scriptedPrompt([ "10.0.0.5", "admin", "hunter2", "n" ]);

      assert.deepEqual(await loadCredentials({ cwd, home, interactive }), { host: "10.0.0.5", password: "hunter2", username: "admin" });

      // Declining has to mean declining: a run that saved anyway would put a file on disk the operator explicitly said no to.
      await assert.rejects(stat(path.join(home, ".ufp.json")), (error: unknown) => (error as NodeJS.ErrnoException).code === "ENOENT");
    });
  });

  test("an empty answer is asked for again", async () => {

    await withDirs(async (cwd, home) => {

      const { interactive, text } = scriptedPrompt([ "", "10.0.0.5", "admin", "hunter2", "n" ]);

      assert.equal((await loadCredentials({ cwd, home, interactive })).host, "10.0.0.5");
      assert.match(text(), /A controller address is required\./);
    });
  });

  test("an address the pipeline rejects is asked for again in the prompt's own words", async () => {

    await withDirs(async (cwd, home) => {

      // "http://[" carries a scheme, so normalization takes the URL-parse path and throws - the same rejection the file path produces, reached through the same
      // function, and recovered from here rather than ending the run.
      const { interactive, text } = scriptedPrompt([ "http://[", "10.0.0.5", "admin", "hunter2", "n" ]);

      assert.equal((await loadCredentials({ cwd, home, interactive })).host, "10.0.0.5");
      assert.match(text(), /That controller address could not be read\./);

      // The pipeline's own message talks about a configuration file, which is the wrong thing to say to someone who is typing an answer.
      assert.ok(!text().includes("is not a valid URL"), "the file-oriented message never reaches an interactive operator");
    });
  });

  test("cancelling the prompt rejects with the library's typed abort", async () => {

    await withDirs(async (cwd, home) => {

      const cancel = new AbortController();

      // No scripted answers: the first question is put, the run is cancelled, and nothing is ever typed.
      const { interactive } = scriptedPrompt([], { onPrompt: () => cancel.abort(), signal: cancel.signal });

      await assert.rejects(loadCredentials({ cwd, home, interactive }), ProtectAbortedError);
    });
  });

  test("a signal already aborted never asks anything", async () => {

    await withDirs(async (cwd, home) => {

      const { interactive } = scriptedPrompt([ "10.0.0.5", "admin", "hunter2", "n" ], { signal: AbortSignal.abort() });

      await assert.rejects(loadCredentials({ cwd, home, interactive }), ProtectAbortedError);
    });
  });

  test("the prompt leaves no listeners on the streams it was given", async () => {

    await withDirs(async (cwd, home) => {

      const { input, interactive } = scriptedPrompt([ "10.0.0.5", "admin", "hunter2", "n" ]);

      await loadCredentials({ cwd, home, interactive });

      // The interface is created for one run and closed on the way out. The channel registry it attaches to is the process's, so a leaked listener would outlive the
      // command and read input meant for whatever ran next.
      for(const event of [ "data", "end", "error", "keypress", "readable" ]) {

        assert.equal(input.listenerCount(event), 0, "no residual " + event + " listener");
      }
    });
  });

  test("a cancelled prompt also leaves no listeners behind", async () => {

    await withDirs(async (cwd, home) => {

      const cancel = new AbortController();
      const { input, interactive } = scriptedPrompt([], { onPrompt: () => cancel.abort(), signal: cancel.signal });

      await assert.rejects(loadCredentials({ cwd, home, interactive }), ProtectAbortedError);

      for(const event of [ "data", "end", "error", "keypress", "readable" ]) {

        assert.equal(input.listenerCount(event), 0, "no residual " + event + " listener after a cancellation");
      }
    });
  });

  test("a present-but-broken configuration is never replaced by a prompt", async () => {

    await withDirs(async (cwd, home) => {

      // Only an absent file is a question. A file that exists and is wrong is something to fix, and typing around it would hide the mistake.
      await writeFile(path.join(cwd, "ufp.json"), JSON.stringify({ controller: "10.0.0.1", username: "u" }));

      const { interactive, text } = scriptedPrompt([ "10.0.0.5", "admin", "hunter2", "n" ]);

      await assert.rejects(loadCredentials({ cwd, home, interactive }), CliError);
      assert.equal(text(), "", "nothing was asked");
    });
  });
});
