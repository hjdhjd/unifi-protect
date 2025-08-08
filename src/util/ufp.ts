#!/usr/bin/env node
/* Copyright(C) 2019-2025, HJD (https://github.com/hjdhjd). All rights reserved.
 *
 * ufp.ts: UniFi Protect API command line utility.
 */
import { ProtectApi, type ProtectEventPacket } from "../index.js";
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

// Silently exit on pipe errors but still process other errors.
process.stdout.on("error", (err) => {

  if(err.code === "EPIPE") {

    process.exit(0);
  } else {

    throw err;
  }
});

let camera;
let channel: number | undefined = 0;
let ls;

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

      // Set channel IDR intervals.
      case "idr":

        // We can only specify a valid number here.
        if(Number.isNaN(Number(process.argv[3])) || !Number.isInteger(Number(process.argv[3])) || (Number(process.argv[3]) < 1) || (Number(process.argv[3]) > 5)) {

          usage();
        }

        // Restart every camera.
        for(const device of ufp.bootstrap?.cameras.filter(camera => !camera.isThirdPartyCamera) ?? []) {

          // Update the Protect controller with the new channel map and IDR interval.
          //eslint-disable-next-line no-await-in-loop
          await ufp.updateDevice(device, { channels: device.channels.map(x => Object.assign(x, { idrInterval: Number(process.argv[3]) })) });

          log.info("%s: IDR set.", ufp.getDeviceName(device));
        }

        process.exit(0);

        break;

      // Restart devices.
      case "restart":

        if(process.argv[3] !== "cameras") {

          usage();
        }

        // Restart every camera.
        for(const device of ufp.bootstrap?.cameras.filter(camera => !camera.isRebooting && camera.state === "CONNECTED") ?? []) {

          //eslint-disable-next-line no-await-in-loop
          const response = await ufp.retrieve(ufp.getApiEndpoint(device.modelKey) + "/" + device.id + "/reboot", { body: JSON.stringify({}), method: "POST" });

          if(!ufp.responseOk(response?.statusCode)) {

            log.error("%s: unable to reboot: %s", ufp.getDeviceName(device), response);

            break;
          }

          log.info("%s: restarted.", ufp.getDeviceName(device));
        }

        process.exit(0);

        break;

      case "stream":

        if(![ 4, 5 ].includes(process.argv.length)) {

          usage();

          break;
        }

        camera = ufp.bootstrap?.cameras.find(camera => camera.name?.toLowerCase() === process.argv[3].toLowerCase());

        if(!camera) {

          usage();

          break;
        }

        if(process.argv.length === 5) {

          channel = camera.channels.find(channel => channel.name?.toLowerCase() === process.argv[4].toLowerCase())?.id;

          if(channel === undefined) {

            usage();

            break;
          }
        }

        ls = ufp.createLivestream();

        await ls.start(camera.id, channel, { useStream: true });
        ls.stream?.pipe(process.stdout);

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
  log.error("Usage: %s stream [camera name]", process.argv[1]);
  log.error("");

  // If we're bootstrapped, we also want to inform users what the various device identifiers are to make filtering events easier.
  if(ufp.bootstrap) {

    if(ufp.bootstrap.cameras.length) {

      log.error("Cameras:");
      ufp.bootstrap.cameras.map(device => log.error("  %s => %s", device.name ?? device.marketName, device.id));
    }

    if(ufp.bootstrap.chimes.length) {

      log.error("Chimes:");
      ufp.bootstrap.chimes.map(device => log.error("  %s => %s", device.name ?? device.marketName, device.id));
    }

    if(ufp.bootstrap.lights.length) {

      log.error("Lights:");
      ufp.bootstrap.lights.map(device => log.error("  %s => %s", device.name ?? device.marketName, device.id));
    }

    if(ufp.bootstrap.sensors.length) {

      log.error("Sensors:");
      ufp.bootstrap.sensors.map(device => log.error("  %s => %s", device.name ?? device.marketName, device.id));
    }

    if(ufp.bootstrap.viewers.length) {

      log.error("Viewers:");
      ufp.bootstrap.viewers.map(device => log.error("  %s => %s", device.name ?? device.marketName, device.id));
    }
  }

  process.exit(1);
}
