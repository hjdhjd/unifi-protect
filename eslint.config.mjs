/* Copyright(C) 2017-2026, HJD (https://github.com/hjdhjd). All rights reserved.
 *
 * eslint.config.mjs: Linting defaults for Homebridge plugins.
 */
import hbPluginUtils from "homebridge-plugin-utils/build/eslint-rules.mjs";

export default hbPluginUtils({

  allowDefaultProject: ["eslint.config.mjs"],
  js: ["eslint.config.mjs"],
  ts: [ "src/**.ts", "src/util/**.ts" ]
});
