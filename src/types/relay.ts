/* Copyright(C) 2019-2026, HJD (https://github.com/hjdhjd). All rights reserved.
 *
 * relay.ts: The UniFi Protect relay configuration types - the device record, its per-output latching switches, and the input-to-output trigger mappings.
 */
import type { Nullable, ProtectKnownJsonValue } from "./common.ts";
import type { ProtectDeviceBaseInterface, ProtectWirelessConnectionSettingsInterface, ProtectWirelessConnectionStateInterface } from "./base.ts";

/**
 * The UniFi Protect relay configuration types: the LoRa relay's device record, its per-output latching-switch shapes, and the input shapes that map an external trigger
 * to an action on one of the relay's outputs.
 *
 * @module ProtectTypesRelay
 */

/**
 * A semi-complete description of the UniFi Protect relay JSON. A relay is a long-range (LoRa) device that exposes one or more latching outputs the controller toggles
 * individually, plus inputs that each map an external trigger to an action on one of those outputs; it carries the standard device record (inherited from
 * {@link ProtectDeviceBaseInterface}) plus its per-output state, LoRa link state, and radio settings. It reports `host: null` and omits `isConnected`, which is why the
 * shared base widens both - see the note on those members in the base interface.
 */
export interface ProtectRelayConfigInterface extends ProtectDeviceBaseInterface {

  // Nullable here because the relay reports `connectionType: null` on the wire, whereas the sibling LoRa devices (fob, sensor) always report a string and narrow it.
  connectionType: Nullable<string>;
  inputs: ProtectRelayInputConfigInterface[];
  ledSettings: { isEnabled: boolean };
  modelKey: "relay";
  outputs: ProtectRelayOutputConfigInterface[];
  wirelessConnectionSettings: ProtectWirelessConnectionSettingsInterface;
  wirelessConnectionState: ProtectWirelessConnectionStateInterface;

  [key: string]: ProtectKnownJsonValue;
}

/**
 * A description of a single relay input. An input maps an external trigger to an action on one of the relay's outputs; every field but the numeric `id` is reported
 * nullable on the wire.
 */
export interface ProtectRelayInputConfigInterface {

  actionOutputId: Nullable<number>;
  actionTrigger: Nullable<string>;
  actionType: Nullable<string>;
  id: number;
  name: Nullable<string>;
  state: Nullable<string>;

  [key: string]: ProtectKnownJsonValue;
}

/**
 * A description of a single relay output. Each output is a latching switch the controller flips via the dedicated activate endpoint (see `Relay.toggleOutput`); its
 * `state` is reported in the record and broadcast in realtime on change. The numeric `id` and the `"off" | "on"` `state` are always present; the remaining fields are
 * nullable on the wire.
 */
export interface ProtectRelayOutputConfigInterface {

  delay: Nullable<number>;
  id: number;
  name: Nullable<string>;
  pulseDuration: Nullable<number>;
  rebootState: Nullable<string>;
  state: "off" | "on";
  type: Nullable<string>;

  [key: string]: ProtectKnownJsonValue;
}

/** @see {@link ProtectRelayConfigInterface} */
export type ProtectRelayConfig = ProtectRelayConfigInterface;
