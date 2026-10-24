/* Copyright(C) 2017-2026, HJD (https://github.com/hjdhjd). All rights reserved.
 *
 * eslint.config.mjs: Linting defaults for the unifi-protect library.
 */
import hbPluginUtils from "homebridge-plugin-utils/eslint";

export default hbPluginUtils({

  allowDefaultProject: ["eslint.config.mjs"],
  js: ["eslint.config.mjs"],
  ts: ["src/**/*.ts"]
});
