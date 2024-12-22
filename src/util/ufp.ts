#!/usr/bin/env node
/* Copyright(C) 2019-2024, HJD (https://github.com/hjdhjd). All rights reserved.
 *
 * ufp.ts: UniFi Protect API command line utility.
 */
import { ProtectApi, ProtectEventPacket } from "../index.js";
import { existsSync, readFileSync } from "fs";
import { homedir } from "os";
import util from "util";

// Create a new Protect API instance.
const ufp = new ProtectApi();

// Log utilities.
const log = {

  /* eslint-disable no-console */
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  debug: (message: string, ...parameters: unknown[]): void => { /* No debug logging by default. */ },
  error: (message: string, ...parameters: unknown[]): void => console.error(util.format(message, ...parameters)),
  info: (message: string, ...parameters: unknown[]): void => console.log(util.format(message, ...parameters)),
  warn: (message: string, ...parameters: unknown[]): void => console.log(util.format(message, ...parameters))
  /* eslint-enable no-console */
};

// Read our credentials.
let config;

try {

  // We look for credentials in the local directory as well as in the user's home directory.
  const configFile = [ "ufp.json", homedir() + "/.ufp.json" ].find(path => existsSync(path));

  if(!configFile) {

    throw new Error;
  }

  // Credentials must be in JSON form with properties for the controller, username, and password.
  config = JSON.parse(readFileSync(configFile, "utf8"));

  if(!config.controller || !config.username || !config.password) {

    throw new Error;
  }
} catch(e) {

  // Inform the user we don't know what to connect to.
  log.error("No credentials found in ./ufp.json or ~/.ufp.json. Credentials must be in JSON form with properties for controller, username, and password defined.");
  usage();
}

// Login to the Protect controller.
if(!(await ufp.login(config.controller, config.username, config.password))) {

  log.error("Invalid login credentials.");
  process.exit(0);
};

// Bootstrap the controller.
if(!(await ufp.getBootstrap())) {

  log.error("Unable to bootstrap the Protect controller.");
  process.exit(0);
}

// Command line processing.
switch(process.argv.length) {

  case 0:
  case 1:
  case 2:

    usage();

    break;

  default:

    switch(process.argv[2]?.toLowerCase()) {

      // Output the bootstrap.
      case "bootstrap":

        // Output the bootstrap JSON and we're done.
        process.stdout.write(util.inspect(ufp.bootstrap, { colors: true, depth: null, sorted: true }) + "\n", () => process.exit(0));

        break;

      // Output realtime events.
      case "events":

        ufp.on("message", (packet: ProtectEventPacket) => {

          if(process.argv.length === 5) {

            if((packet.header as Record<string, string>)[process.argv[3]]?.toLowerCase() !== process.argv[4]?.toLowerCase()) {

              return;
            }
          }

          log.info(util.inspect(packet, { colors: true, depth: null, sorted: true }));
        });

        break;

      // Restart devices.
      case "restart":

        if(process.argv[3] !== "cameras") {

          usage();
        }

        // Restart every camera.
        for(const camera of ufp.bootstrap?.cameras.filter(x => !x.isRebooting && x.state === "CONNECTED") ?? []) {

          //eslint-disable-next-line no-await-in-loop
          const response = await ufp.retrieve(ufp.getApiEndpoint(camera.modelKey) + "/" + camera.id + "/reboot", { body: JSON.stringify({}), method: "POST" });

          if(!response?.ok) {

            log.error("%s: unable to reboot: %s", ufp.getDeviceName(camera), response);

            break;
          }

          log.info("%s: restarted.", ufp.getDeviceName(camera));
        }

        process.exit(0);

        break;

      // Unknown command.
      default:

        usage();

        break;
    };

    break;
}

// Usage information.
function usage(): void {

  log.error("Usage: %s bootstrap", process.argv[1]);
  log.error("Usage: %s events [action | id | modelKey | other_event_header_property] [value] (all parameters are case-sensitive)", process.argv[1]);
  log.error("Usage: %s restart cameras", process.argv[1]);
  log.error("");

  // If we're bootstrapped, we also want to inform users what the various device identifiers are to make filtering events easier.
  if(ufp.bootstrap) {

    if(ufp.bootstrap.cameras.length) {

      log.error("Cameras:");
      ufp.bootstrap.cameras.map(x => log.error("  %s => %s", x.name ?? x.marketName, x.id));
    }

    if(ufp.bootstrap.chimes.length) {

      log.error("Chimes:");
      ufp.bootstrap.chimes.map(x => log.error("  %s => %s", x.name ?? x.marketName, x.id));
    }

    if(ufp.bootstrap.lights.length) {

      log.error("Lights:");
      ufp.bootstrap.lights.map(x => log.error("  %s => %s", x.name ?? x.marketName, x.id));
    }

    if(ufp.bootstrap.sensors.length) {

      log.error("Sensors:");
      ufp.bootstrap.sensors.map(x => log.error("  %s => %s", x.name ?? x.marketName, x.id));
    }

    if(ufp.bootstrap.viewers.length) {

      log.error("Viewers:");
      ufp.bootstrap.viewers.map(x => log.error("  %s => %s", x.name ?? x.marketName, x.id));
    }
  }

  process.exit(1);
}
