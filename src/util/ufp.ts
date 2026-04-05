#!/usr/bin/env node
/* Copyright(C) 2019-2026, HJD (https://github.com/hjdhjd). All rights reserved.
 *
 * ufp.ts: UniFi Protect API command line utility.
 */
import type { Nullable, ProtectCameraConfig, ProtectChimeConfig, ProtectLightConfig, ProtectNvrBootstrap, ProtectSensorConfig, ProtectViewerConfig } from "../index.js";
import { ProtectApi, type ProtectEventPacket } from "../index.js";
import { existsSync, readFileSync } from "fs";
import { homedir } from "os";
import util from "util";

// Credentials configuration interface.
interface UfpConfig {

  controller: string;
  password: string;
  username: string;
}

// Parsed command line options.
interface ParsedOptions {

  args: string[];
  command: string;
  debug: boolean;
  filters: EventFilter[];
  help: boolean;
  maxEvents: number;
  outputFields: string[];
  outputFormat: OutputFormat;
  statsMode: boolean;
  timeout: number;
}

// Output format types.
type OutputFormat = "default" | "compact" | "json";

// Event statistics tracker.
interface EventStats {

  byAction: Record<string, number>;
  byModelKey: Record<string, number>;
  total: number;
}

// Filter operator types.
type FilterOperator = "!=" | "!~" | "<" | "<=" | "==" | ">" | ">=" | "~";

// Base interface for event filters. This is the extensible foundation for the filtering system.
interface EventFilter {

  // Returns true if the event matches this filter.
  matches(packet: ProtectEventPacket, context: FilterContext): boolean;

  // Human-readable description of the filter.
  describe(): string;
}

// Context passed to filters, providing access to bootstrap data and utilities.
interface FilterContext {

  // Resolve a device name to its ID. Returns the ID if found, null otherwise.
  resolveDeviceName(name: string): Nullable<string>;

  // Get device name by ID.
  getDeviceName(id: string): Nullable<string>;

  // Access to the bootstrap data.
  bootstrap: Nullable<ProtectNvrBootstrap>;
}

// Resolve a dot-path to a value within an event packet. Paths starting with "payload." or "header." resolve within those sub-objects...all other paths default to
// the header for backward compatibility.
function getValueAtPath(packet: ProtectEventPacket, path: string): unknown {

  const parts = path.split(".");
  let current: unknown = packet;

  if(parts[0] === "payload") {

    current = packet.payload;
    parts.shift();
  } else if(parts[0] === "header") {

    current = packet.header;
    parts.shift();
  } else {

    // Default to header for backward compatibility.
    current = packet.header;
  }

  for(const part of parts) {

    if((current === null) || (current === undefined)) {

      return undefined;
    }

    if(typeof current === "object") {

      current = (current as Record<string, unknown>)[part];
    } else {

      return undefined;
    }
  }

  return current;
}

// Property filter for matching header or payload properties.
class PropertyFilter implements EventFilter {

  private readonly negate: boolean;
  private readonly operator: FilterOperator;
  private readonly path: string;
  private readonly regex: Nullable<RegExp>;
  private readonly value: string;

  constructor(path: string, operator: FilterOperator, value: string) {

    this.path = path;
    this.operator = operator;
    this.value = value;
    this.negate = (operator === "!=") || (operator === "!~");

    // Check if value is a regex pattern (delimited by /).
    if(((operator === "~") || (operator === "!~")) && value.startsWith("/") && (value.lastIndexOf("/") > 0)) {

      const lastSlash = value.lastIndexOf("/");
      const pattern = value.substring(1, lastSlash);
      const flags = value.substring(lastSlash + 1);

      try {

        this.regex = new RegExp(pattern, flags);
      } catch {

        throw new Error("Invalid regular expression: " + value);
      }
    } else if((operator === "~") || (operator === "!~")) {

      // Treat as glob pattern - convert to regex.
      const regexPattern = value.replace(/[.+^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*").replace(/\?/g, ".");

      this.regex = new RegExp("^" + regexPattern + "$", "i");
    } else {

      this.regex = null;
    }

    // Validate that the filter value is numeric for comparison operators. The event value varies per packet so we can only validate the user's side at construction.
    if([ ">", "<", ">=", "<=" ].includes(operator) && Number.isNaN(Number(value))) {

      throw new Error("Numeric comparison operator \"" + operator + "\" requires a numeric value, got: " + value);
    }
  }

  public matches(packet: ProtectEventPacket, context: FilterContext): boolean {

    // Special handling for "device" filter - resolve name to ID.
    if(this.path === "device") {

      const resolvedId = context.resolveDeviceName(this.value);

      if(resolvedId) {

        const actualValue = packet.header.id;

        return this.negate ? actualValue.toLowerCase() !== resolvedId.toLowerCase() : actualValue.toLowerCase() === resolvedId.toLowerCase();
      }

      // If we can't resolve the name, try matching against the ID directly.
      const actualValue = packet.header.id;
      const matches = actualValue.toLowerCase() === this.value.toLowerCase();

      return this.negate ? !matches : matches;
    }

    // Get the value at the specified path.
    const actualValue = getValueAtPath(packet, this.path);

    if(actualValue === undefined) {

      return this.negate;
    }

    // eslint-disable-next-line @typescript-eslint/no-base-to-string
    return this.compareValues(String(actualValue));
  }

  private compareValues(actualValue: string): boolean {

    const normalizedActual = actualValue.toLowerCase();
    const normalizedExpected = this.value.toLowerCase();

    switch(this.operator) {

      case "==":

        return normalizedActual === normalizedExpected;

      case "!=":

        return normalizedActual !== normalizedExpected;

      case "~":

        return this.regex ? this.regex.test(actualValue) : normalizedActual.includes(normalizedExpected);

      case "!~":

        return this.regex ? !this.regex.test(actualValue) : !normalizedActual.includes(normalizedExpected);

      case ">":

        return Number(actualValue) > Number(this.value);

      case "<":

        return Number(actualValue) < Number(this.value);

      case ">=":

        return Number(actualValue) >= Number(this.value);

      case "<=":

        return Number(actualValue) <= Number(this.value);

      default:

        return false;
    }
  }

  public describe(): string {

    const opSymbol = this.operator;

    return this.path + " " + opSymbol + " " + this.value;
  }
}

// Model key shortcut filter (--cameras, --lights, etc.).
class ModelKeyFilter implements EventFilter {

  private readonly modelKey: string;
  private readonly negate: boolean;

  constructor(modelKey: string, negate = false) {

    this.modelKey = modelKey;
    this.negate = negate;
  }

  public matches(packet: ProtectEventPacket): boolean {

    const matches = packet.header.modelKey.toLowerCase() === this.modelKey.toLowerCase();

    return this.negate ? !matches : matches;
  }

  public describe(): string {

    return (this.negate ? "not " : "") + "modelKey=" + this.modelKey;
  }
}

// Composite filter for combining multiple filters with AND/OR logic.
class CompositeFilter implements EventFilter {

  private readonly filters: EventFilter[];
  private readonly operator: "and" | "or";

  constructor(filters: EventFilter[], operator: "and" | "or" = "and") {

    this.filters = filters;
    this.operator = operator;
  }

  public matches(packet: ProtectEventPacket, context: FilterContext): boolean {

    if(this.filters.length === 0) {

      return true;
    }

    if(this.operator === "and") {

      return this.filters.every(filter => filter.matches(packet, context));
    }

    return this.filters.some(filter => filter.matches(packet, context));
  }

  public describe(): string {

    const descriptions = this.filters.map(f => f.describe());

    return "(" + descriptions.join(" " + this.operator.toUpperCase() + " ") + ")";
  }
}

// Motion event filter - filters for events with motion detection.
class MotionFilter implements EventFilter {

  public matches(packet: ProtectEventPacket): boolean {

    const payload = packet.payload as Nullable<Record<string, unknown>>;

    if(!payload) {

      return false;
    }

    // Check various motion indicators in the payload.
    return Boolean(payload.isMotionDetected) || Boolean(payload.lastMotion) || (payload.type === "motion");
  }

  public describe(): string {

    return "motion events";
  }
}

// Ring event filter - filters for doorbell ring events.
class RingFilter implements EventFilter {

  public matches(packet: ProtectEventPacket): boolean {

    const payload = packet.payload as Nullable<Record<string, unknown>>;

    if(!payload) {

      return false;
    }

    return Boolean(payload.lastRing) || (payload.type === "ring");
  }

  public describe(): string {

    return "ring events";
  }
}

// Smart detection filter - filters for smart detection events (person, vehicle, package, etc.).
class SmartDetectionFilter implements EventFilter {

  private readonly detectionType: Nullable<string>;

  constructor(detectionType: Nullable<string> = null) {

    this.detectionType = detectionType;
  }

  public matches(packet: ProtectEventPacket): boolean {

    const payload = packet.payload as Nullable<Record<string, unknown>>;

    if(!payload) {

      return false;
    }

    const smartDetectTypes = payload.smartDetectTypes as string[] | undefined;

    if(!smartDetectTypes || !Array.isArray(smartDetectTypes)) {

      return false;
    }

    if(this.detectionType) {

      return smartDetectTypes.some(t => t.toLowerCase() === this.detectionType?.toLowerCase());
    }

    return smartDetectTypes.length > 0;
  }

  public describe(): string {

    return this.detectionType ? "smart detection: " + this.detectionType : "smart detection events";
  }
}

// Output formatter interface.
interface OutputFormatter {

  format(packet: ProtectEventPacket, context: FilterContext): string;
}

// Default output formatter with colors and full depth.
class DefaultFormatter implements OutputFormatter {

  public format(packet: ProtectEventPacket): string {

    return util.inspect(packet, { colors: true, depth: null, sorted: true });
  }
}

// JSON output formatter - one line per event, no colors.
class JsonFormatter implements OutputFormatter {

  public format(packet: ProtectEventPacket): string {

    return JSON.stringify(packet);
  }
}

// Compact output formatter - header only.
class CompactFormatter implements OutputFormatter {

  public format(packet: ProtectEventPacket, context: FilterContext): string {

    const header = packet.header;
    const deviceName = context.getDeviceName(header.id) ?? header.id;

    return "[" + header.modelKey + "] " + deviceName + " - " + header.action;
  }
}

// Fields output formatter - specific fields only.
class FieldsFormatter implements OutputFormatter {

  private readonly fields: string[];

  constructor(fields: string[]) {

    this.fields = fields;
  }

  public format(packet: ProtectEventPacket): string {

    const result: Record<string, unknown> = {};

    for(const field of this.fields) {

      const value = getValueAtPath(packet, field);

      if(value !== undefined) {

        result[field] = value;
      }
    }

    return JSON.stringify(result);
  }
}

// Create a new Protect API instance.
const ufp = new ProtectApi();

// Log utilities.
const log = {

  /* eslint-disable no-console */
  debug: (message: string, ...parameters: unknown[]): void => {

    if(debugEnabled) {

      console.error("[DEBUG] " + util.format(message, ...parameters));
    }
  },
  error: (message: string, ...parameters: unknown[]): void => { console.error(util.format(message, ...parameters)); },
  info: (message: string, ...parameters: unknown[]): void => { console.log(util.format(message, ...parameters)); },
  warn: (message: string, ...parameters: unknown[]): void => { console.log(util.format(message, ...parameters)); }
  /* eslint-enable no-console */
};

// Debug mode flag.
let debugEnabled = false;

// Parse command line arguments into structured options.
function parseArguments(argv: string[]): ParsedOptions {

  const options: ParsedOptions = {

    args: [],
    command: "",
    debug: false,
    filters: [],
    help: false,
    maxEvents: 0,
    outputFields: [],
    outputFormat: "default",
    statsMode: false,
    timeout: 0
  };

  const args = argv.slice(2);
  let i = 0;

  while(i < args.length) {

    const arg = args[i];

    // Global flags.
    if((arg === "--help") || (arg === "-h")) {

      options.help = true;
      i++;

      continue;
    }

    if((arg === "--debug") || (arg === "-d")) {

      options.debug = true;
      i++;

      continue;
    }

    // Output format flags.
    if(arg === "--json") {

      options.outputFormat = "json";
      i++;

      continue;
    }

    if(arg === "--compact") {

      options.outputFormat = "compact";
      i++;

      continue;
    }

    if(arg.startsWith("--fields=")) {

      options.outputFormat = "default";
      options.outputFields = arg.substring(9).split(",").map(f => f.trim());
      i++;

      continue;
    }

    // Event control flags.
    if(arg.startsWith("--timeout=")) {

      const value = Number(arg.substring(10));

      if(Number.isNaN(value) || (value <= 0)) {

        log.error("Invalid timeout value: %s.", arg.substring(10));
        process.exit(1);
      }

      options.timeout = value * 1000;
      i++;

      continue;
    }

    if(arg.startsWith("--count=")) {

      const value = Number(arg.substring(8));

      if(Number.isNaN(value) || (value <= 0) || !Number.isInteger(value)) {

        log.error("Invalid count value: %s.", arg.substring(8));
        process.exit(1);
      }

      options.maxEvents = value;
      i++;

      continue;
    }

    if(arg === "--stats") {

      options.statsMode = true;
      i++;

      continue;
    }

    // Model key shortcuts.
    if(arg === "--cameras") {

      options.filters.push(new ModelKeyFilter("camera"));
      i++;

      continue;
    }

    if(arg === "--lights") {

      options.filters.push(new ModelKeyFilter("light"));
      i++;

      continue;
    }

    if(arg === "--sensors") {

      options.filters.push(new ModelKeyFilter("sensor"));
      i++;

      continue;
    }

    if(arg === "--chimes") {

      options.filters.push(new ModelKeyFilter("chime"));
      i++;

      continue;
    }

    if(arg === "--viewers") {

      options.filters.push(new ModelKeyFilter("viewer"));
      i++;

      continue;
    }

    if(arg === "--nvr") {

      options.filters.push(new ModelKeyFilter("nvr"));
      i++;

      continue;
    }

    // Special event type filters.
    if(arg === "--motion") {

      options.filters.push(new MotionFilter());
      i++;

      continue;
    }

    if(arg === "--ring") {

      options.filters.push(new RingFilter());
      i++;

      continue;
    }

    if(arg === "--smart") {

      options.filters.push(new SmartDetectionFilter());
      i++;

      continue;
    }

    if(arg.startsWith("--smart=")) {

      options.filters.push(new SmartDetectionFilter(arg.substring(8)));
      i++;

      continue;
    }

    // Device filter shortcut.
    if(arg.startsWith("--device=")) {

      options.filters.push(new PropertyFilter("device", "==", arg.substring(9)));
      i++;

      continue;
    }

    // Property filters in the form property=value, property!=value, property~value, etc.
    const filterMatch = /^([a-zA-Z0-9_.]+)(==|!=|~|!~|>=|<=|>|<|=)(.+)$/.exec(arg);

    if(filterMatch) {

      const [ , path, op, value ] = filterMatch;
      const operator = (op === "=") ? "==" : op as FilterOperator;

      options.filters.push(new PropertyFilter(path, operator, value));
      i++;

      continue;
    }

    // First non-flag argument is the command.
    if(!options.command) {

      options.command = arg.toLowerCase();
      i++;

      continue;
    }

    // Remaining arguments are passed to the command.
    options.args.push(arg);
    i++;
  }

  return options;
}

// Create the filter context for resolving device names and accessing bootstrap data.
function createFilterContext(): FilterContext {

  const deviceNameMap = new Map<string, string>();
  const deviceIdMap = new Map<string, string>();

  // Build device name to ID mapping from bootstrap.
  if(ufp.bootstrap) {

    const deviceArrays = [
      ufp.bootstrap.cameras,
      ufp.bootstrap.chimes,
      ufp.bootstrap.lights,
      ufp.bootstrap.sensors,
      ufp.bootstrap.viewers
    ];

    for(const devices of deviceArrays) {

      for(const device of devices) {

        // We use || instead of ?? intentionally - we want to skip empty strings, not just null/undefined.
        // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
        const name = device.name || device.marketName || "";

        if(name) {

          deviceNameMap.set(name.toLowerCase(), device.id);
          deviceIdMap.set(device.id, name);
        }
      }
    }
  }

  return {

    bootstrap: ufp.bootstrap,

    getDeviceName: (id: string): Nullable<string> => deviceIdMap.get(id) ?? null,

    resolveDeviceName: (name: string): Nullable<string> => {

      // First check if it's already an ID.
      if(deviceIdMap.has(name)) {

        return name;
      }

      // Try to find by name (case-insensitive).
      return deviceNameMap.get(name.toLowerCase()) ?? null;
    }
  };
}

// Create the appropriate output formatter based on options.
function createFormatter(options: ParsedOptions): OutputFormatter {

  if(options.outputFields.length > 0) {

    return new FieldsFormatter(options.outputFields);
  }

  switch(options.outputFormat) {

    case "json":

      return new JsonFormatter();

    case "compact":

      return new CompactFormatter();

    default:

      return new DefaultFormatter();
  }
}

// Command handler type. Handlers may be sync or async depending on whether they need to await API calls.
type CommandHandler = (options: ParsedOptions) => Promise<void> | void;

// Bootstrap command - output the controller bootstrap data.
function handleBootstrap(options: ParsedOptions): void {

  if(options.help) {

    log.error("Usage: ufp bootstrap");
    log.error("");
    log.error("Output the complete bootstrap data from the Protect controller.");
    log.error("");
    log.error("Options:");
    log.error("  --json     Output as JSON (no colors)");

    process.exit(0);
  }

  const output = (options.outputFormat === "json") ? JSON.stringify(ufp.bootstrap) : util.inspect(ufp.bootstrap, { colors: true, depth: null, sorted: true });

  process.stdout.write(output + "\n", () => process.exit(0));
}

// Events command - listen for and display realtime events.
function handleEvents(options: ParsedOptions): void {

  if(options.help) {

    log.error("Usage: ufp events [filters...] [options]");
    log.error("");
    log.error("Listen for realtime events from the Protect controller.");
    log.error("");
    log.error("Filter Syntax:");
    log.error("  property=value      Match property equals value (case-insensitive)");
    log.error("  property!=value     Match property not equals value");
    log.error("  property~pattern    Match property contains/matches pattern");
    log.error("  property!~pattern   Match property does not contain/match pattern");
    log.error("  property>/</>=/<=/value  Numeric comparisons");
    log.error("");
    log.error("  Patterns can be:");
    log.error("    - Simple text (contains match)");
    log.error("    - Glob patterns with * and ? wildcards");
    log.error("    - Regex patterns delimited by / (e.g., /^update$/i)");
    log.error("");
    log.error("  Property paths:");
    log.error("    - Header properties: action, id, modelKey, or header.action");
    log.error("    - Payload properties: payload.isMotionDetected, payload.lastMotion.start");
    log.error("");
    log.error("Device Shortcuts:");
    log.error("  --device=NAME       Filter by device name (resolved to ID)");
    log.error("  --cameras           Filter for camera events only");
    log.error("  --lights            Filter for light events only");
    log.error("  --sensors           Filter for sensor events only");
    log.error("  --chimes            Filter for chime events only");
    log.error("  --viewers           Filter for viewer events only");
    log.error("  --nvr               Filter for NVR events only");
    log.error("");
    log.error("Event Type Shortcuts:");
    log.error("  --motion            Filter for motion detection events");
    log.error("  --ring              Filter for doorbell ring events");
    log.error("  --smart             Filter for any smart detection events");
    log.error("  --smart=TYPE        Filter for specific smart detection (person, vehicle, package, animal, etc.)");
    log.error("");
    log.error("Output Options:");
    log.error("  --json              Output as JSON (one event per line, no colors)");
    log.error("  --compact           Output compact format (header summary only)");
    log.error("  --fields=a,b,c      Output specific fields only as JSON");
    log.error("");
    log.error("Control Options:");
    log.error("  --timeout=SECONDS   Exit after specified seconds");
    log.error("  --count=N           Exit after N events");
    log.error("  --stats             Show event statistics instead of raw events");
    log.error("");
    log.error("Examples:");
    log.error("  ufp events                                    # All events");
    log.error("  ufp events --cameras                          # Camera events only");
    log.error("  ufp events --device=\"Front Door\"              # Events for specific device");
    log.error("  ufp events modelKey=camera action=update      # Multiple filters (AND)");
    log.error("  ufp events --motion --cameras                 # Motion events from cameras");
    log.error("  ufp events action~\"/^(add|update)$/\"          # Regex filter");
    log.error("  ufp events --json --count=10                  # 10 events as JSON");

    process.exit(0);
  }

  // Legacy support: if we have exactly 2 positional args, treat as property=value filter.
  if((options.args.length === 2) && (options.filters.length === 0)) {

    options.filters.push(new PropertyFilter(options.args[0], "==", options.args[1]));
  }

  const context = createFilterContext();
  const formatter = createFormatter(options);
  const compositeFilter = new CompositeFilter(options.filters, "and");
  const stats: EventStats = { byAction: {}, byModelKey: {}, total: 0 };

  let eventCount = 0;
  let timeoutHandle: Nullable<NodeJS.Timeout> = null;

  // Graceful shutdown handler.
  const shutdown = (): void => {

    if(options.statsMode) {

      log.info("");
      log.info("Event Statistics:");
      log.info("  Total events: %d", stats.total);
      log.info("");
      log.info("  By Model Key:");

      for(const [ key, count ] of Object.entries(stats.byModelKey).sort((a, b) => b[1] - a[1])) {

        log.info("    %s: %d", key, count);
      }

      log.info("");
      log.info("  By Action:");

      for(const [ key, count ] of Object.entries(stats.byAction).sort((a, b) => b[1] - a[1])) {

        log.info("    %s: %d", key, count);
      }
    }

    if(timeoutHandle) {

      clearTimeout(timeoutHandle);
    }

    process.exit(0);
  };

  // Set up signal handlers for graceful shutdown.
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);

  // Set up timeout if specified.
  if(options.timeout > 0) {

    timeoutHandle = setTimeout(shutdown, options.timeout);
  }

  // Listen for events.
  ufp.on("message", (packet: ProtectEventPacket) => {

    // Apply filters.
    if(!compositeFilter.matches(packet, context)) {

      return;
    }

    eventCount++;

    if(options.statsMode) {

      // Update statistics.
      stats.total++;
      stats.byModelKey[packet.header.modelKey] = (stats.byModelKey[packet.header.modelKey] ?? 0) + 1;
      stats.byAction[packet.header.action] = (stats.byAction[packet.header.action] ?? 0) + 1;
    } else {

      // Output the event.
      log.info(formatter.format(packet, context));
    }

    // Check event count limit.
    if((options.maxEvents > 0) && (eventCount >= options.maxEvents)) {

      shutdown();
    }
  });

  log.debug("Listening for events with %d filters.", options.filters.length);

  if(options.filters.length > 0) {

    log.debug("Filters: %s", compositeFilter.describe());
  }
}

// IDR command - set IDR intervals for all cameras.
async function handleIdr(options: ParsedOptions): Promise<void> {

  if(options.help) {

    log.error("Usage: ufp idr INTERVAL");
    log.error("");
    log.error("Set the IDR interval for all non-third-party cameras.");
    log.error("");
    log.error("Arguments:");
    log.error("  INTERVAL    IDR interval value (1-5)");

    process.exit(0);
  }

  if(options.args.length !== 1) {

    log.error("Usage: ufp idr INTERVAL (1-5)");

    process.exit(1);
  }

  const idrValue = Number(options.args[0]);

  if(Number.isNaN(idrValue) || !Number.isInteger(idrValue) || (idrValue < 1) || (idrValue > 5)) {

    log.error("IDR interval must be an integer between 1 and 5.");

    process.exit(1);
  }

  for(const device of ufp.bootstrap?.cameras.filter(camera => !camera.isThirdPartyCamera) ?? []) {

    // eslint-disable-next-line no-await-in-loop
    await ufp.updateDevice(device, { channels: device.channels.map(x => Object.assign(x, { idrInterval: idrValue })) });

    log.info("%s: IDR set to %d.", ufp.getDeviceName(device), idrValue);
  }

  process.exit(0);
}

// Device types that can be restarted. We exclude ProtectNvrConfig because it lacks the isRebooting and state properties that the restart logic depends on.
type ProtectDeviceTypes = ProtectCameraConfig | ProtectChimeConfig | ProtectLightConfig | ProtectSensorConfig | ProtectViewerConfig;

// Known device classes and their corresponding bootstrap property names.
const deviceClasses = [ "cameras", "chimes", "lights", "sensors", "viewers" ] as const;

// Restart command - restart the console, device classes, or individual devices.
async function handleRestart(options: ParsedOptions): Promise<void> {

  if(options.help) {

    log.error("Usage: ufp restart TARGET");
    log.error("");
    log.error("Restart the console, all devices, a device class, or a specific device.");
    log.error("");
    log.error("Targets:");
    log.error("  console              Reboot the UniFi OS console");
    log.error("  devices              Restart all connected Protect devices");
    log.error("  cameras              Restart all connected cameras");
    log.error("  chimes               Restart all connected chimes");
    log.error("  lights               Restart all connected lights");
    log.error("  sensors              Restart all connected sensors");
    log.error("  viewers              Restart all connected viewers");
    log.error("  DEVICE_NAME_OR_ID    Restart a specific device by name or ID");

    process.exit(0);
  }

  if(options.args.length !== 1) {

    log.error("Usage: ufp restart TARGET");
    log.error("Run 'ufp restart --help' for more information.");

    process.exit(1);
  }

  if(!ufp.bootstrap) {

    log.error("Unable to retrieve the controller bootstrap.");

    process.exit(1);
  }

  const target = options.args[0];

  // Reboot the UniFi OS console.
  if(target === "console") {

    const response = await ufp.retrieve("https://" + ufp.bootstrap.nvr.host + "/api/system/reboot", { method: "POST" });

    if(!ufp.responseOk(response?.statusCode)) {

      log.error("Unable to reboot the console.");

      process.exit(1);
    }

    log.info("Console is rebooting.");

    process.exit(0);
  }

  // Collect devices from the requested device classes, or match by name/ID if the target isn't a known class.
  const classes = (target === "devices") ? [...deviceClasses] : deviceClasses.includes(target as typeof deviceClasses[number]) ? [target] : [];
  let devices: ProtectDeviceTypes[] = [];

  if(classes.length > 0) {

    // Collect all devices from the requested classes.
    for(const deviceClass of classes) {

      devices.push(...(ufp.bootstrap[deviceClass as keyof typeof ufp.bootstrap] as ProtectDeviceTypes[]));
    }
  } else {

    // Match devices by name or ID across all classes.
    for(const deviceClass of deviceClasses) {

      for(const device of (ufp.bootstrap[deviceClass as keyof typeof ufp.bootstrap] as ProtectDeviceTypes[])) {

        if((device.id === target) || (device.name?.toLowerCase() === target.toLowerCase())) {

          devices.push(device);
        }
      }
    }

    if(devices.length === 0) {

      log.error("No device found matching: %s", target);
      listDevices();

      process.exit(1);
    }
  }

  // Filter to devices that are connected and not already rebooting.
  devices = devices.filter(device => {

    if(device.isRebooting) {

      log.warn("%s: already rebooting.", ufp.getDeviceName(device));

      return false;
    }

    if(device.state !== "CONNECTED") {

      log.warn("%s: not connected.", ufp.getDeviceName(device));

      return false;
    }

    return true;
  });

  if(devices.length === 0) {

    log.info("No connected devices found to restart.");

    process.exit(0);
  }

  for(const device of devices) {

    // eslint-disable-next-line no-await-in-loop
    const response = await ufp.retrieve(ufp.getApiEndpoint(device.modelKey) + "/" + device.id + "/reboot", { body: JSON.stringify({}), method: "POST" });

    if(!ufp.responseOk(response?.statusCode)) {

      log.warn("%s: unable to restart.", ufp.getDeviceName(device));

      continue;
    }

    log.info("%s: restarted.", ufp.getDeviceName(device));
  }

  process.exit(0);
}

// Stream command - stream video from a camera.
async function handleStream(options: ParsedOptions): Promise<void> {

  if(options.help) {

    log.error("Usage: ufp stream CAMERA_NAME [CHANNEL_NAME]");
    log.error("");
    log.error("Stream video from a camera.");
    log.error("");
    log.error("Arguments:");
    log.error("  CAMERA_NAME    Name of the camera to stream from");
    log.error("  CHANNEL_NAME   Optional channel name (defaults to first channel)");

    process.exit(0);
  }

  if((options.args.length < 1) || (options.args.length > 2)) {

    log.error("Usage: ufp stream CAMERA_NAME [CHANNEL_NAME]");

    process.exit(1);
  }

  const cameraName = options.args[0];
  const camera = ufp.bootstrap?.cameras.find(cam => cam.name?.toLowerCase() === cameraName.toLowerCase());

  if(!camera) {

    log.error("Camera not found: %s", cameraName);
    listDevices();

    process.exit(1);
  }

  let channel: number | undefined = 0;

  if(options.args.length === 2) {

    const channelName = options.args[1];

    channel = camera.channels.find(ch => ch.name.toLowerCase() === channelName.toLowerCase())?.id;

    if(channel === undefined) {

      log.error("Channel not found: %s", channelName);
      log.error("Available channels: %s", camera.channels.map(ch => ch.name).join(", "));

      process.exit(1);
    }
  }

  const ls = ufp.createLivestream();

  await ls.start(camera.id, channel, { chunkSize: 16384, useStream: true });
  ls.stream?.pipe(process.stdout);
}

// Devices command - list all devices.
function handleDevices(options: ParsedOptions): void {

  if(options.help) {

    log.error("Usage: ufp devices [TYPE]");
    log.error("");
    log.error("List all devices or devices of a specific type.");
    log.error("");
    log.error("Arguments:");
    log.error("  TYPE    Optional device type (cameras, chimes, lights, sensors, viewers)");

    process.exit(0);
  }

  const deviceType = options.args[0]?.toLowerCase();

  if(deviceType && ![ "cameras", "chimes", "lights", "sensors", "viewers" ].includes(deviceType)) {

    log.error("Unknown device type: %s", deviceType);
    log.error("Valid types: cameras, chimes, lights, sensors, viewers");

    process.exit(1);
  }

  if(options.outputFormat === "json") {

    const devices: Record<string, unknown[]> = {};

    for(const deviceClass of deviceClasses) {

      if(!deviceType || (deviceType === deviceClass)) {

        devices[deviceClass] = (ufp.bootstrap?.[deviceClass] ?? []) as unknown[];
      }
    }

    log.info(JSON.stringify(devices));
  } else {

    listDevices(deviceType);
  }

  process.exit(0);
}

// Command registry.
const commands: Partial<Record<string, CommandHandler>> = {

  bootstrap: handleBootstrap,
  devices: handleDevices,
  events: handleEvents,
  idr: handleIdr,
  restart: handleRestart,
  stream: handleStream
};

// List devices helper function.
function listDevices(filterType?: string): void {

  if(!ufp.bootstrap) {

    return;
  }

  const deviceTypes: { devices: { id: string; marketName?: string; name?: string }[]; label: string; type: string }[] = [
    { devices: ufp.bootstrap.cameras, label: "Cameras", type: "cameras" },
    { devices: ufp.bootstrap.chimes, label: "Chimes", type: "chimes" },
    { devices: ufp.bootstrap.lights, label: "Lights", type: "lights" },
    { devices: ufp.bootstrap.sensors, label: "Sensors", type: "sensors" },
    { devices: ufp.bootstrap.viewers, label: "Viewers", type: "viewers" }
  ];

  for(const { devices, label, type } of deviceTypes) {

    if(filterType && (type !== filterType)) {

      continue;
    }

    if(devices.length === 0) {

      continue;
    }

    log.error("%s:", label);

    for(const device of devices) {

      log.error("  %s => %s", device.name ?? device.marketName, device.id);
    }
  }
}

// Show usage information.
function usage(): never {

  log.error("Usage: ufp [--debug] [--help] COMMAND [options]");
  log.error("");
  log.error("Commands:");
  log.error("  bootstrap    Output the controller bootstrap data");
  log.error("  devices      List all devices");
  log.error("  events       Listen for realtime events");
  log.error("  restart      Restart the console, devices, or a specific device");
  log.error("  stream       Stream video from a camera");
  log.error("");
  log.error("Global Options:");
  log.error("  --debug, -d  Enable debug output");
  log.error("  --help, -h   Show help for a command");
  log.error("");
  log.error("Run 'ufp COMMAND --help' for more information on a command.");
  log.error("");

  listDevices();

  process.exit(1);
}

// Load configuration.
function loadConfig(): UfpConfig {

  const configFile = [ "ufp.json", homedir() + "/.ufp.json" ].find(path => existsSync(path));

  if(!configFile) {

    log.error("No credentials found in ./ufp.json or ~/.ufp.json.");
    log.error("Credentials must be in JSON form with properties: controller, username, password");

    process.exit(1);
  }

  let config: UfpConfig;

  try {

    config = JSON.parse(readFileSync(configFile, "utf8")) as UfpConfig;
  } catch(error) {

    log.error("Failed to parse configuration file: %s", configFile);
    log.error("Ensure the file contains valid JSON.");

    process.exit(1);
  }

  if(!config.controller || !config.username || !config.password) {

    log.error("Configuration file is missing required properties.");
    log.error("Required: controller, username, password");

    process.exit(1);
  }

  return config;
}

// Main execution.
async function main(): Promise<void> {

  const options = parseArguments(process.argv);

  debugEnabled = options.debug;

  // Show general help if requested without a command.
  if(options.help && !options.command) {

    usage();
  }

  // Require a command.
  if(!options.command) {

    usage();
  }

  // Check if the command exists.
  const handler = commands[options.command];

  if(!handler) {

    log.error("Unknown command: %s", options.command);
    usage();
  }

  // Load configuration and connect.
  const config = loadConfig();

  log.debug("Connecting to %s", config.controller);

  if(!(await ufp.login(config.controller, config.username, config.password))) {

    log.error("Invalid login credentials.");

    process.exit(1);
  }

  log.debug("Logged in successfully.");

  if(!(await ufp.getBootstrap())) {

    log.error("Unable to bootstrap the Protect controller.");

    process.exit(1);
  }

  log.debug("Bootstrap complete. Found %d cameras.", ufp.bootstrap?.cameras.length ?? 0);

  // Silently exit on pipe errors but still process other errors.
  process.stdout.on("error", (err) => {

    if((err as NodeJS.ErrnoException).code === "EPIPE") {

      process.exit(0);
    } else {

      throw err;
    }
  });

  // Execute the command.
  await handler(options);
}

// Run main.
main().catch((error: unknown) => {

  log.error("Fatal error: %s", error);

  process.exit(1);
});
