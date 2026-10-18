/* Copyright(C) 2017-2026, HJD (https://github.com/hjdhjd). All rights reserved.
 *
 * eslint.config.mjs: Linting defaults for the unifi-protect library.
 */
import hbPluginUtils from "homebridge-plugin-utils/eslint";

export default hbPluginUtils({

  allowDefaultProject: ["eslint.config.mjs"],

  // Test, fixture, and helper files are co-located with production code under src/. The shared preset already carries the test-tier relaxation for the
  // node:test definition idiom, and this block turns off the rules the suites still trip, for the reasons below:
  //
  // - Tests routinely keep a defensive optional chain after an assertion or guard has already narrowed the value - the linter then flags that chain as
  //   "unnecessary" even though it keeps the test from throwing a TypeError if the assertion is ever loosened.
  //
  // - Test helpers compose mocks with `mock.fn()` and other return values whose types are intentionally permissive; requiring explicit return-type annotations
  //   on every inline test arrow function adds noise without catching real bugs.
  //
  // We turn off only the rules called out above for test infrastructure, so the rest of the strict preset still applies.
  extraConfigs: [{

    files: [ "**/*.test.ts", "**/*.fixtures.ts", "**/*.helpers.ts" ],
    rules: {

      "@typescript-eslint/explicit-function-return-type": "off",
      "@typescript-eslint/no-unnecessary-condition": "off"
    }
  }],
  js: ["eslint.config.mjs"],
  ts: ["src/**/*.ts"]
});
