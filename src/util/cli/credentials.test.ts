/* Copyright(C) 2019-2026, HJD (https://github.com/hjdhjd). All rights reserved.
 *
 * credentials.test.ts: Unit tests for ufp.json discovery (cwd before home), controller normalization, and validation failures.
 */
import { describe, test } from "node:test";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { CliError } from "./shared.ts";
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
});
