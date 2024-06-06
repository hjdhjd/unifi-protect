/* Copyright(C) 2022-2024, HJD (https://github.com/hjdhjd). All rights reserved.
 *
 * protect-api-livestream.ts: Our UniFi Protect livestream API implementation.
 */

/* eslint-disable @stylistic/max-len */
/**
 * Access a direct MP4 livestream for a UniFi Protect camera.
 *
 * The UniFi Protect livestream API is largely undocumented and has been reverse engineered mostly through
 * trial and error, as well as observing the Protect controller in action. It builds on the works of others in the
 * community - particularly https://github.com/XciD - who have experimented and successfully gotten parts of this API decoded.
 * As always, this work stands on the contributions of others and the work that's come before it, and I want to acknowledge those
 * that paved the way.
 *
 * Let's start by defining some terms. In the MP4 world, an MP4 file (or stream) is composed of multiple atoms or segments.
 * Think of these as packet types that contain specific pieces of information that are needed to put together a valid MP4 file.
 * For our purposes, we're primarily interested in four types of MP4 boxes:
 *
 * | Box   | Description                                                                                                                                   |
 * |-------|-----------------------------------------------------------------------------------------------------------------------------------------------|
 * | FTYP  | File type box. This contains codec and file information for the stream that follows it. It must be at the beginning of any stream, and preceded by the FTYP box.      |
 * | MDAT  | Media data box. This contains a segment of the actual audio and video data in the MP4 stream. It is always paired with an MOOF box, which contains the metadata describing this payload in an MDAT box.        |
 * | MOOF  | Movie fragment box. This defines the metadata for a specific segment of audio and video. It is always paired with an MDAT box, which contains the actual data.        |
 * | MOOV  | Movie metadata box. This contains all the metadata information about the stream that follows. It must be at the beginning of any stream, and preceded by the FTYP box. The Protect livestream API actually combines the FTYP and MOOV boxes, conveniently giving us a complete initialization segment.        |
 *
 * Every fMP4 stream begins with an initialization segment comprised of the FTYP and MOOV boxes. It defines the file type,
 * what the movie metadata is, and other characteristics. Think of it as the header for the entire stream.
 *
 * After the header, every fMP4 stream has a series of segments (sometimes called fragments, hence the term fMP4),
 * that consist of a pair of moof / mdat boxes that includes all the audio and video for that segment. You end up with something
 * that looks like:
 *
 * ```
 *  |ftyp|moov|moof|mdat|moof|mdat...
 * ```
 *
 * The UniFi Protect livestream API provides a straightforward interface to generate bespoke fMP4 streams that
 * can be tailored depending on your needs. This implementation of the API allows you to access those streams, retrieve all the relevant boxes/atoms you need to
 * manipulate them for your application.
 *
 * @module ProtectLivestream
 */
/* eslint-enable @stylistic/max-len */
import events, { EventEmitter } from "node:events";
import { PROTECT_API_TIMEOUT } from "./settings.js";
import { ProtectApi } from "./protect-api.js";
import { ProtectLogging } from "./protect-logging.js";
import WebSocket from "ws";

// A complete description of the UniFi Protect livestream API websocket API.
enum ProtectLiveFrame {

  KEYFRAME = 247,
  CODECINFORMATION = 248,
  BEGINSEGMENT = 249,
  INITSEGMENT = 250,
  MOOF = 251,
  VIDEO = 252,
  AUDIO = 253,
  MDAT = 254,
  ENDSEGMENT = 255
}

/**
 * This class provides a complete event-driven API to access the UniFi Protect Livestream API endpoint.
 *
 * 1. Create an instance of the {@link ProtectApi | UniFi Protect API} to connect to the Protect controller.
 *
 * 2. Create an instance of {@link ProtectLivestream | Protect Livestream} using the API instance above either directly, or through calling
 * {@link ProtectApi.createLivestream | createLivestream} method on an instance of {@link ProtectApi} (preferred).
 *
 * 3. Start a livestream using {@link start}, stop it with {@link stop}, and listen for events.
 *
 * 3. Listen for `message` events emitted by {@link ProtectLivestream} which provides Buffers containing the raw fMP4 segment data as it's produced by Protect. You can
 *    alternatively listen individually for the initialization segment or regular fMP4 segments if you'd like to distinguish between the two types of segments.
 *
 * Those are the basics that gets us up and running.
 */
export class ProtectLivestream extends EventEmitter {

  private _initSegment: Buffer | null;
  private _codec: string | null;
  private api: ProtectApi;
  private errorHandler: ((error: Error) => void) | null;
  private heartbeat: NodeJS.Timeout | null;
  private lastMessage: number;
  private log: ProtectLogging;
  private segmentHandler: ((packet: Buffer) => void) | null;
  private ws: WebSocket | null;

  // Create a new instance.
  constructor(api: ProtectApi, log: ProtectLogging) {

    // Initialize the event emitter.
    super();

    this._initSegment = null;
    this._codec = null;
    this.api = api;
    this.errorHandler = null;
    this.lastMessage = 0;
    this.log = log;
    this.segmentHandler = null;
    this.heartbeat = null;
    this.ws = null;
  }

  /**
   * Start an fMP4 livestream session from the Protect controller.
   *
   * @param cameraId         - Protect camera device ID property from the camera's {@link ProtectTypes.ProtectCameraConfigInterface | ProtectCameraConfig}.
   * @param channel          - Camera channel to use, indexing the channels array in the camera's {@link ProtectTypes.ProtectCameraConfigInterface | ProtectCameraConfig}.
   * @param lens             - Optionally specify alternate cameras on a Protect device, such as a package camera.
   * @param segmentLength    - Optionally specify the segment length, in milliseconds, of each fMP4 segment. Defaults to 100ms.
   * @param requestId        - Optionally specify a request ID to the Protect controller. This is primarily used for logging purposes.
   *
   * @returns Returns `true` if the livestream has successfully started, `false` otherwise.
   *
   * @remarks Once a livestream session has started, the following events can be listened for:
   *
   * | Event         | Description                                                                                                                                  |
   * |---------------|----------------------------------------------------------------------------------------------------------------------------------------------|
   * | `close`       | Livestream has been closed.                                                                                                                  |
   * | `codec`       | The codec and container format in use in the livestream. The codec information will be passed as an argument to any listeners.               |
   * | `initsegment` | An fMP4 initialization segment has been received. The segment will be passed as an argument to any listeners.                                |
   * | `message`     | An fMP4 segment has been received. No distinction is made between segment types. The segment will be passed as an argument to any listeners. |
   * | `segment`     | A non-initialization fMP4 segment has been received. The segment will be passed as an argument to any listeners.                             |
   */
  public async start(cameraId: string, channel: number, lens = 0, segmentLength = 100, requestId = cameraId + "-" + channel.toString()): Promise<boolean> {

    // Stop any existing stream.
    this.stop();

    // Clear out the initialization segment.
    this._initSegment = null;

    // Launch the livestream.
    return await this.launchLivestream(cameraId, channel, lens, segmentLength, requestId);
  }

  /**
   * Stop an fMP4 livestream session from the Protect controller.
   */
  public stop(): void {

    // Close the websocket.
    if((this.ws?.readyState === WebSocket.CLOSING) || (this.ws?.readyState === WebSocket.OPEN)) {

      this.ws?.terminate();
    }

    // Clean up our segment processing handler.
    if(this.errorHandler) {

      this.ws?.removeListener("error", this.errorHandler);
      this.errorHandler = null;
    }

    if(this.segmentHandler) {

      this.ws?.removeListener("message", this.segmentHandler);
      this.segmentHandler = null;
    }

    // Flag that we are no longer running.
    this.ws = null;
  }

  // Configure the websocket to populate the prebuffer.
  private async launchLivestream(cameraId: string, channel: number, lens: number, segmentLength: number, requestId: string): Promise<boolean> {

    const logError = (message: string, ...parameters: unknown[]): void => this.log.error(requestId + ": " + message, ...parameters);

    // To ensure there are minimal performance implications to the Protect NVR, enforce a 100ms floor for segment length. Protect happens to default to a 100ms segment
    // length as well, so we do too.
    if(segmentLength < 100) {

      segmentLength = 100;
    }

    // Parameters that can be set for the livestream. We allow the modification of a useful subset of these,
    // though not all of them, in order to simplify the API experience and ensure things always work.
    //
    // allowPartialGOP:          Allow partial groups of pictures. This is necessary for a valid fMP4 stream that can be used in realtime.
    // camera:                   The camera ID of the camera you are trying to livestream.
    // channel:                  The camera channel to use for this livestream.
    // extendedVideoMetadata:    Provide extended metadata in the MOOV box when possible.
    // fragmentDurationMillis:   Length of each fMP4 segment or fragment, in milliseconds.
    // lens:                     Which camera lens to use on the camera. Necessary for multi-lens cameras (e.g. package cameras).
    // progressive:              Enable progressive livestreaming.
    // rebaseTimestampsToZero:   Rebase the timestamps of each livestream session to zero. Otherwise, timestamps will reflect the controller's default.
    // requestId:                Name for this particular request. It's optional in practice, and can be any string.
    // type:                     Container format type. The valid values are fmp4 and UBV (UniFi Video proprietary format).
    const params = new URLSearchParams({

      allowPartialGOP: "",
      camera: cameraId,
      channel: channel.toString(),
      extendedVideoMetadata: "", // Try excluding?
      fragmentDurationMillis: segmentLength.toString(),
      lens: lens.toString(),
      progressive: "",
      rebaseTimestampsToZero: "true",
      requestId: requestId,
      type: "fmp4"
    });

    // Get the websocket endpoint URL from Protect.
    const wsUrl = await this.api.getWsEndpoint("livestream", params);

    // We ran into a problem getting the websocket URL. We're done.
    if(!wsUrl) {

      logError("unable to retrieve the livestream websocket API endpoint from the UniFi Protect controller.");

      return false;
    }

    try {

      // Open the livestream websocket.
      this.ws = new WebSocket(wsUrl, { rejectUnauthorized: false });

      if(!this.ws) {

        this.ws = null;
        logError("unable to connect to the livestream websocket API endpoint.");

        return false;
      }

      // Setup our heartbeat timer.
      let heartbeat: NodeJS.Timeout | null = null;

      // Start our heartbeat once we've opened the connection.
      this.ws?.once("open", () => {

        this.lastMessage = Date.now();

        // Heartbeat the controller. We need this because if we don't heartbeat the controller, it can sometimes just decide not to give us a livestream to work with, or
        // lockup due to regressions in the controller firmware. This ensures we can never hang waiting on data from the API, especially in a livestream scenario.
        heartbeat = setInterval(() => {

          if((Date.now() - this.lastMessage) > PROTECT_API_TIMEOUT) {

            logError("the livestream API is not responding.");

            if((this.ws?.readyState === WebSocket.CLOSING) || (this.ws?.readyState === WebSocket.OPEN)) {

              this.ws?.close();
            }
          }
        }, PROTECT_API_TIMEOUT);
      });

      // Catch any errors and inform the user, if needed.
      this.ws?.once("error", this.errorHandler = (error: Error): void => {

        // Ignore timeout errors, but notify the user about anything else.
        if((error as NodeJS.ErrnoException).code !== "ETIMEDOUT") {

          logError("error while communicating with the livestream websocket API: %s", error);
        }

        this.stop();
      });

      this.ws?.once("close", (code: number) => {

        // Clear out our heartbeat since we're closing.
        if(heartbeat) {

          clearInterval(heartbeat);
        }

        switch(code) {

          // Websocket has been closed normally. We fire off a close event to inform our listeners and we're done.
          case 1005:

            this.stop();
            this.emit("close");

            break;

          // The websocket has been forcibly closed by us. Ignore it.
          case 1006:

            break;

          default:

            logError("unknown livestream API websocket error. Error code: %s.", code);

            break;
        }

      });

      // Process packets coming to our websocket.
      this.processLivestream();

    } catch(error) {

      logError("error while connecting to the livestream websocket API: %s", error);
      this.stop();
    }

    return true;
  }

  // Process fMP4 packets as they arrive over the websocket.
  private processLivestream(): void {

    // Check to ensure our websocket is live.
    if(!this.ws) {

      return;
    }

    let currentSegment = {

      audio: Buffer.alloc(0),
      keyframe: Buffer.alloc(0),
      mdat: Buffer.alloc(0),
      moof: Buffer.alloc(0),
      video: Buffer.alloc(0)
    };

    let packetRemaining = Buffer.alloc(0);

    // Process data coming in from the websocket.
    this.ws.on("message", this.segmentHandler = (packet: Buffer): void => {

      // Update our heartbeat.
      this.lastMessage = Date.now();

      // If we have anything left from the last packet we processed, prepend it to this packet.
      if(packetRemaining.length > 0) {

        packet = Buffer.concat([packetRemaining, packet]);
        packetRemaining = Buffer.alloc(0);
      }

      let offset = 0;

      for(;;) {

        // If we have less than 4 bytes remaining, it's an incomplete packet and we don't have enough information to decode it without the packet header. We save it to
        // prepend to the next packet that comes across.
        if((packet.length - offset) < 4) {

          packetRemaining = packet.slice(offset);

          break;
        }

        // Grab the encoded packet header.
        const offsetWithHeader = offset + 4;
        const header = packet.slice(offset, offsetWithHeader);

        // Ensure we have a valid header before we do anything.
        if(!Object.values(ProtectLiveFrame).includes(header[0] as ProtectLiveFrame)) {

          this.log.error("Invalid header found while decoding the livestream: %s", header[0]);

          break;
        }

        // Get the length of the actual fMP4 segment we are decoding. Since all this is done over a websocket, portions of an fMP4 segment can span packets and need to be
        // encoded. Protect encodes the length of the entire fMP4 segment in the first three bytes of the header like so...
        const segmentLength = (((header[1] << 8) | header[2]) << 8) | header[3];

        // Once we know our length, if we don't have the complete packet, we save it and punt until we see more data come across.
        if(packet.length < (offset + segmentLength + 4)) {

          packetRemaining = packet.slice(offset);

          break;
        }

        // Grab the data portion of the packet.
        const data = packet.slice(offsetWithHeader, offsetWithHeader + segmentLength);
        let completeSegment = null;

        // Figure out which data type we've got based on our header, and process it.
        switch(header[0] as ProtectLiveFrame) {

          // We've got audio data. Add it to our current segment.
          case ProtectLiveFrame.AUDIO:

            currentSegment.audio = Buffer.concat([currentSegment.audio, data]);

            break;

          // End of segment. Build the entire segment, and emit our events.
          case ProtectLiveFrame.ENDSEGMENT:

            completeSegment = Buffer.concat([ currentSegment.moof, currentSegment.mdat, currentSegment.video, currentSegment.audio ]);

            this.emit("segment", completeSegment);
            this.emit("message", completeSegment);

            break;

          // Codec information.
          case ProtectLiveFrame.CODECINFORMATION:

            this._codec = data.toString();

            this.emit("codec", this.codec);

            // Inform the user about what codec is used in the livestream.
            this.log.debug("Livestream codec information: %s", data);

            break;

          // Beginning of segment. Create an empty segment to get started.
          case ProtectLiveFrame.BEGINSEGMENT:

            currentSegment = {

              audio: Buffer.alloc(0),
              keyframe: Buffer.alloc(0),
              mdat: Buffer.alloc(0),
              moof: Buffer.alloc(0),
              video: Buffer.alloc(0)
            };

            break;

          // Initialization segment. This is always an FTYP and MOOV box pair. Save it and emit our events.
          case ProtectLiveFrame.INITSEGMENT:

            this._initSegment = data;
            this.emit("initsegment", this.initSegment);
            this.emit("message", this.initSegment);

            break;

          // We've got a keyframe. Add it to our current segment.
          case ProtectLiveFrame.KEYFRAME:

            currentSegment.keyframe = data;
            this.emit("keyframe", data);

            break;

          // MDAT box. Add it to the MDAT portion of our segment.
          case ProtectLiveFrame.MDAT:

            currentSegment.mdat = Buffer.concat([ currentSegment.mdat, data ]);

            break;

          // MOOF box. Add it to the MOOF portion of our segment.
          case ProtectLiveFrame.MOOF:

            currentSegment.moof = Buffer.concat([ currentSegment.moof, data ]);

            break;

          // We've got video data. Add it to our current segment.
          case ProtectLiveFrame.VIDEO:

            currentSegment.video = Buffer.concat([ currentSegment.video, data ]);

            break;

          // We'll never get here since we check our header information above.
          default:

            break;
        }

        // Move the offset to the next segment.
        offset = offsetWithHeader + segmentLength;
      }
    });
  }

  /**
   * Retrieve the initialization segment that must be at the start of every fMP4 stream.
   *
   * @returns Returns a promise that resolves once the initialization segment has been seen, or returning it immediately if it already has been.
   */
  public async getInitSegment(): Promise<Buffer> {

    // Return our segment once we've seen it.
    if(this.initSegment) {

      return this.initSegment;
    }

    // Wait until the initialization segment is seen and then try again.
    await events.once(this, "initsegment");

    return this.getInitSegment();
  }

  /**
   * The initialization segment that must be at the start of every fMP4 stream.
   *
   * @returns Returns the initialization segment if it exists, or `null` otherwise.
   */
  public get initSegment(): Buffer | null {

    return this._initSegment;
  }

  /**
   * The codecs in use for this livestream session.
   *
   * @returns Returns a string containing the codec information,if it exists, or `null` otherwise.
   *
   * @remarks Codec information is provided as `codec,container` where codec is either `avc` (H.264) or `hev` (H.265). The container format is always `mp4`.
   *
   * @example `hev1.1.6.L150,mp4a.40.2`
   */
  public get codec(): string {

    return this._codec ?? "";
  }
}
