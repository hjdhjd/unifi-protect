/* Copyright(C) 2022-2025, HJD (https://github.com/hjdhjd). All rights reserved.
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
import { Agent, type ErrorEvent, type MessageEvent, WebSocket } from "undici";
import events, { EventEmitter } from "node:events";
import type { Nullable } from "./protect-types.js";
import { PROTECT_API_TIMEOUT } from "./settings.js";
import type { ProtectApi } from "./protect-api.js";
import type { ProtectLogging } from "./protect-logging.js";
import { Readable } from "node:stream";
import util from "node:util";

// A complete description of the UniFi Protect livestream API websocket API.
enum ProtectLiveFrame {

  TIMESTAMP = 247,
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
 * Options for configuring a livestream session.
 *
 * @property chunkSize        - Optionally specify the maximum payload size of each websocket packet. Larger sizes mean lower fragmentation. Defaults to 4096.
 * @property emitTimestamps   - Optionally emit the decode timestamps of frames as timestamp events. This is the same information that appears in `tfdt` boxes.
 * @property lens             - Optionally specify alternate cameras on a Protect device, such as a package camera.
 * @property segmentLength    - Optionally specify the segment length, in milliseconds, of each fMP4 segment. Defaults to 100ms.
 * @property requestId        - Optionally specify a request ID to the Protect controller. This is primarily used for logging purposes.
 * @property useStream        - If `true`, a Node.js Readable stream interface will be created for consuming raw fMP4 segments instead of using EventEmitter events.
 *                              Defaults to false.
 */
export interface LivestreamOptions {

  chunkSize: number;
  emitTimestamps: boolean;
  lens: number;
  requestId: string;
  segmentLength: number;
  useStream: boolean;
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
 *
 * @event close       - Emitted when the livestream WebSocket connection has been closed. This event fires after cleanup is complete and the connection is fully
 *                      terminated.
 * @event codec       - Emitted when codec information is received from the controller. The codec string is passed as an argument in the format "codec,container"
 *                      (e.g., "hev1.1.6.L150,mp4a.40.2"). Only emitted when not using stream mode.
 * @event initsegment - Emitted when an fMP4 initialization segment (FTYP and MOOV boxes) is received. The complete initialization segment Buffer is passed as an
 *                      argument. Only emitted when not using stream mode.
 * @event mdat        - Emitted when an MDAT box (media data) has been received as part of a segment. The MDAT Buffer is passed as an argument. Only emitted when not
 *                      using stream mode.
 * @event message     - Emitted when any complete fMP4 segment is received, whether initialization or regular segment. The complete segment Buffer is passed as an
 *                      argument. Only emitted when not using stream mode.
 * @event moof        - Emitted when a MOOF box (movie fragment metadata) has been received as part of a segment. The MOOF Buffer is passed as an argument. Only emitted
 *                      when not using stream mode.
 * @event segment     - Emitted when a non-initialization fMP4 segment (MOOF/MDAT pair) is fully assembled. The complete segment Buffer is passed as an argument. Only
 *                      emitted when not using stream mode.
 * @event timestamps  - Emitted when decode timestamp information is received from the controller. An array of numbers containing the decode timestamps of frames in the
 *                      next segment is passed as an argument, mirroring the tfdt box contents.
 */
export class ProtectLivestream extends EventEmitter {

  private _initSegment: Nullable<Buffer>;
  private _codec: Nullable<string>;
  private _stream: Nullable<Readable>;
  private agent: Nullable<Agent>;
  private api: ProtectApi;
  private errorHandler: Nullable<(event: ErrorEvent) => void>;
  private heartbeat: Nullable<NodeJS.Timeout>;
  private initSegmentPromise?: Promise<Buffer>;
  private lastMessage: number;
  private log: ProtectLogging;
  private messageHandler: Nullable<(event: MessageEvent) => void>;
  private ws: Nullable<WebSocket>;

  // Create a new instance.
  constructor(api: ProtectApi, log: ProtectLogging) {

    // Initialize the event emitter.
    super();

    this._codec = null;
    this._initSegment = null;
    this._stream = null;
    this.agent = null;
    this.api = api;
    this.errorHandler = null;
    this.heartbeat = null;
    this.lastMessage = 0;
    this.log = log;
    this.messageHandler = null;
    this.ws = null;
  }

  /**
   * Start an fMP4 livestream session from the Protect controller.
   *
   * @param cameraId         - Protect camera device ID property from the camera's {@link ProtectTypes.ProtectCameraConfigInterface | ProtectCameraConfig}.
   * @param channel          - Camera channel to use, indexing the channels array in the camera's {@link ProtectTypes.ProtectCameraConfigInterface | ProtectCameraConfig}.
   * @param options          - Optional parameters to further customize the livestream session.
   *
   * @returns Returns `true` if the livestream has successfully started, `false` otherwise.
   *
   * @event close       - Emitted when the livestream connection terminates for any reason, including manual stops or errors.
   * @event codec       - Emitted with the codec information string when received from the controller (stream mode disabled only).
   * @event initsegment - Emitted with the initialization segment Buffer containing FTYP and MOOV boxes (stream mode disabled only).
   * @event message     - Emitted with each complete fMP4 segment Buffer, both initialization and regular segments (stream mode disabled only).
   * @event segment     - Emitted with each complete non-initialization segment Buffer containing MOOF/MDAT pairs (stream mode disabled only).
   * @event timestamps  - Emitted with decode timestamp arrays when extendedVideoMetadata is enabled in options.
   *
   * @remarks Once a livestream session has started, the following events can be listened for (unless you've specified `useStream` in `options`, in which case only the
   *          `close` event is available):
   *
   * | Event         | Description                                                                                                                                  |
   * |---------------|----------------------------------------------------------------------------------------------------------------------------------------------|
   * | `close`       | Livestream has been closed.                                                                                                                  |
   * | `codec`       | The codec and container format in use in the livestream. The codec information will be passed as an argument to any listeners.               |
   * | `initsegment` | An fMP4 initialization segment has been received. The segment will be passed as an argument to any listeners.                                |
   * | `message`     | An fMP4 segment has been received. No distinction is made between segment types. The segment will be passed as an argument to any listeners. |
   * | `segment`     | A non-initialization fMP4 segment has been received. The segment will be passed as an argument to any listeners.                             |
   * | `timestamps`  | An array of numbers containing the decode timestamps of the frames in the next segment. It mirrors what is provided in the `tfdt` box.       |
   */
  public async start(cameraId: string, channel: number, options: Partial<LivestreamOptions> = {}): Promise<boolean> {

    options.chunkSize ??= 4096;
    options.emitTimestamps ??= false;
    options.lens ??= 0;
    options.requestId ??= cameraId + "-" + channel.toString();
    options.segmentLength ??= 100;
    options.useStream ??= false;

    // Stop any existing stream.
    this.stop();

    // Clear out the initialization segment.
    this._initSegment = null;

    // Launch the livestream.
    return this.launchLivestream(cameraId, channel, options as LivestreamOptions);
  }

  /**
   * Stop an fMP4 livestream session from the Protect controller.
   */
  public stop(): void {

    // Close the websocket.
    this.ws?.close();

    if(this.messageHandler) {

      this.ws?.removeEventListener("message", this.messageHandler);
      this.messageHandler = null;
    }

    if(this.errorHandler) {

      this.ws?.removeEventListener("error", this.errorHandler);
      this.errorHandler = null;
    }

    // If we've created a stream, end it gracefully.
    if(this._stream) {

      this._stream.push(null);
      this._stream = null;
    }

    // Flag that we are no longer running.
    this.ws = null;
  }

  /**
   * Configure the websocket to populate the prebuffer.
   *
   * @event close - Emitted when the WebSocket connection closes or encounters an error requiring termination.
   *
   * @internal
   */
  private async launchLivestream(cameraId: string, channel: number, options: LivestreamOptions): Promise<boolean> {

    const logError = (message: string, ...parameters: unknown[]): void => this.log.error(options.requestId + ": " + message, ...parameters);

    // To ensure there are minimal performance implications to the Protect NVR, enforce a 100ms floor for segment length. Protect happens to default to a 100ms segment
    // length as well, so we do too.
    if(options.segmentLength < 100) {

      options.segmentLength = 100;
    }

    // Parameters that can be set for the livestream. We allow the modification of a useful subset of these, though not all of them, in order to simplify the API
    // experience and ensure things always work.
    //
    // allowPartialGOP:          Allow partial groups of pictures. Protect will start a fragment even if it doesn’t begin on a keyframe. This reduces end-to-end latency
    //                           at the cost of potentially cutting a GOP in half (i.e. you may see inter-frame artifacts at the very start of some segments).
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
      chunkSize: options.chunkSize.toString(),
      ...(options.emitTimestamps ? { extendedVideoMetadata: "" } : {}),
      fragmentDurationMillis: options.segmentLength.toString(),
      lens: options.lens.toString(),
      progressive: "",
      rebaseTimestampsToZero: "true",
      requestId: options.requestId,
      type: "fmp4",
      useWallClock: "false"
    });

    // Get the websocket endpoint URL from Protect.
    const wsUrl = await this.api.getWsEndpoint("livestream", params);

    // We ran into a problem getting the websocket URL. We're done.
    if(!wsUrl) {

      logError("unable to retrieve the livestream websocket API endpoint from the UniFi Protect controller.");

      return false;
    }

    try {

      // Configure our agent to ensure we don't enable keepalive or HTTP pipelining so we can quickly tear down the connection when needed.
      this.agent = new Agent({

        connect: {

          keepAlive: false,
          rejectUnauthorized: false
        },
        pipelining: 0
      });

      // Open the livestream WebSocket. We create a new dispatcher here because WebSocket upgrades can only happen over HTTP/1.1 and we've asked for HTTP/2 whenever
      // possible in our global pool.
      this.ws = new WebSocket(wsUrl, { dispatcher: this.agent });

      // The user's requested that we use a stream interface instead of an event interface to push complete fMP4 segments.
      if(options.useStream) {

        this._stream = new Readable({

          // This is intentionally a no-op, since we're going to push complete fMP4 segments as soon as they're available.
          read:(): void => {}
        });
      }

      // Start our heartbeat once we've opened the connection.
      this.ws.addEventListener("open", () => {

        this.lastMessage = Date.now();

        // Heartbeat the controller. We need this because if we don't heartbeat the controller, it can sometimes just decide not to give us a livestream to work with, or
        // lockup due to regressions in the controller firmware. This ensures we can never hang waiting on data from the API, especially in a livestream scenario.
        this.heartbeat = setInterval(() => {

          // Clear out our heartbeat if our websocket no longer exists.
          if(!this.ws) {

            // Clear out our heartbeat since we're closing.
            if(this.heartbeat) {

              clearInterval(this.heartbeat);
              this.heartbeat = null;
            }

            return;
          }

          if((Date.now() - this.lastMessage) > PROTECT_API_TIMEOUT) {

            logError("the livestream API is not responding.");

            if((this.ws.readyState === WebSocket.CLOSING) || (this.ws.readyState === WebSocket.OPEN)) {

              this.ws.close();
            }
          }
        }, PROTECT_API_TIMEOUT);

        // Process packets coming to our websocket.
        this.processLivestream();
      }, { once: true });

      // Catch any errors and inform the user, if needed.
      this.ws.addEventListener("error", this.errorHandler = (event: ErrorEvent): void => {

        const error = event.error as NodeJS.ErrnoException;

        // Ignore timeout errors, but notify the user about anything else.
        if(!(error instanceof TypeError) && (error.code !== "ETIMEDOUT")) {

          logError("error while communicating with the livestream websocket API: %s", error);
          logError(util.inspect(error, { colors: true, depth: null, sorted: true }));
        }

        this.stop();
      }, { once: true });

      this.ws.addEventListener("close", async () => {

        // Clear out our heartbeat since we're closing.
        if(this.heartbeat) {

          clearInterval(this.heartbeat);
          this.heartbeat = null;
        }

        this.stop();

        await this.agent?.destroy();
        this.agent = null;

        this.emit("close");
      }, { once: true });

    } catch(error) {

      logError("error while connecting to the livestream websocket API: %s", error);
      this.stop();
    }

    return true;
  }

  /**
   * Process fMP4 packets as they arrive over the websocket.
   *
   * @event codec       - Emitted when we have received a codec packet.
   * @event initsegment - Emitted when we have received the initialization segment.
   * @event mdat        - Emitted at segment end with the accumulated MDAT box data.
   * @event message     - Emitted with complete segments (both initialization and regular).
   * @event moof        - Emitted at segment end with the accumulated MOOF box data.
   * @event segment     - Emitted when we have received a complete non-initialization segment.
   * @event timestamps  - Emitted when we have received the decode timestamp arrays (when we have extendedVideoMetadata enabled).
   *
   * @internal
   */
  private processLivestream(): void {

    // Check to ensure our websocket is live.
    if(!this.ws) {

      return;
    }

    // Track the segment under construction.
    let currentSegment = {

      audio: Buffer.alloc(0),
      mdat: Buffer.alloc(0),
      moof: Buffer.alloc(0),
      video: Buffer.alloc(0)
    };

    // Keep any tail bytes that didn't form a full packet yet.
    let packetRemaining = Buffer.alloc(0);

    // Process data coming in from the websocket.
    this.ws.addEventListener("message", this.messageHandler = async (event: MessageEvent): Promise<void> => {

      // Update our heartbeat.
      this.lastMessage = Date.now();

      // We need to normalize event.data into an ArrayBuffer so we can process it.
      let ab: ArrayBuffer | undefined;

      try {

        if(event.data instanceof Blob) {

          ab = await event.data.arrayBuffer();
        } else if(event.data instanceof ArrayBuffer) {

          ab = event.data;
        } else if(typeof event.data === "string") {

          ab = new TextEncoder().encode(event.data).buffer;
        } else {

          this.log.error("Unsupported WebSocket message type: %s", typeof event.data);
          this.ws?.close();

          return;
        }
      } catch(error) {

        this.log.error("Error processing livestream WebSocket message: ", error);
        this.ws?.close();
      }

      if(!ab) {

        return;
      }

      // Prepend any leftover partial packet.
      let packet = Buffer.from(ab);

      // If we have anything left from the last packet we processed, prepend it to this packet.
      if(packetRemaining.length > 0) {

        packet = Buffer.concat([ packetRemaining, packet ]);
        packetRemaining = Buffer.alloc(0);
      }

      let offset = 0;

      for(;;) {

        // If we have less than 4 bytes remaining, it's an incomplete packet and we don't have enough information to decode it without the packet header. We save it to
        // prepend to the next packet that comes across.
        if((packet.length - offset) < 4) {

          packetRemaining = packet.subarray(offset);

          break;
        }

        // Read the one-byte packet header.
        const header = packet.readUInt8(offset);

        // Validate our header before we do anything else.
        if(!Object.values(ProtectLiveFrame).includes(header as ProtectLiveFrame)) {

          this.log.error("Invalid header found while decoding the livestream: %s", header);

          break;
        }

        // Protect encodes the length of the entire fMP4 segment in the first three bytes (big-endian) of the header.
        const length = ((packet.readUInt8(offset + 1) << 8) | packet.readUInt8(offset + 2)) << 8 | packet.readUInt8(offset + 3);

        // Once we know our length, if we don't have the complete packet, we save it and punt until we see more data come across.
        if(packet.length < offset + 4 + length) {

          packetRemaining = packet.subarray(offset);

          break;
        }

        // We have a full segment. Let's slice it out, process it, and advance our offset.
        let completeSegment = null;

        const dataStart = offset + 4;
        const dataEnd = dataStart + length;
        const data = packet.subarray(dataStart, dataEnd);
        const timestamps: number[] = [];

        // Figure out which data type we've got based on our header, and process it.
        switch(header as ProtectLiveFrame) {

          // We've got audio data. Add it to our current segment.
          case ProtectLiveFrame.AUDIO:

            currentSegment.audio = Buffer.concat([ currentSegment.audio, data ]);

            break;

          // End of segment. Build the entire segment, and emit our events.
          case ProtectLiveFrame.ENDSEGMENT:

            completeSegment = Buffer.concat([ currentSegment.moof, currentSegment.mdat, currentSegment.video, currentSegment.audio ]);

            if(this._stream) {

              this._stream.push(completeSegment);
            } else {

              this.emit("segment", completeSegment);
              this.emit("message", completeSegment);
              this.emit("moof", currentSegment.moof);
              this.emit("mdat", currentSegment.mdat);
            }

            break;

          // Codec information.
          case ProtectLiveFrame.CODECINFORMATION:

            this._codec = data.toString();

            if(!this._stream) {

              this.emit("codec", this.codec);
            }

            // Inform the user about what codec is used in the livestream.
            this.log.debug("Livestream codec information: %s", data);

            break;

          // Beginning of segment. Create an empty segment to get started.
          case ProtectLiveFrame.BEGINSEGMENT:

            currentSegment = {

              audio: Buffer.alloc(0),
              mdat: Buffer.alloc(0),
              moof: Buffer.alloc(0),
              video: Buffer.alloc(0)
            };

            break;

          // Initialization segment. This is always an FTYP and MOOV box pair. Save it and emit our events.
          case ProtectLiveFrame.INITSEGMENT:

            this._initSegment = data;

            if(this._stream) {

              this._stream.push(this._initSegment);
            } else {

              this.emit("initsegment", this._initSegment);
              this.emit("message", this._initSegment);
            }

            break;

          // We've got a timestamp packet. Protect sends over decode timestamps identical to what's in the tfdt box in the segment.
          case ProtectLiveFrame.TIMESTAMP:

            for(let offset = 0; offset < data.length; offset += 8) {

              timestamps.push(Number(data.readBigUInt64BE(offset)));
            }

            this.emit("timestamps", timestamps);

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

        // Advance the offset past this entire packet (header + payload).
        offset = dataEnd;
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

    // Cache a promise that resolves when the initsegment event is emitted. We need to wait until the initialization segment is seen and then return it.
    return this.initSegmentPromise ??= events.once(this, "initsegment").then(() => this.initSegment as Buffer);
  }

  /**
   * The initialization segment that must be at the start of every fMP4 stream.
   *
   * @returns Returns the initialization segment if it exists, or `null` otherwise.
   */
  public get initSegment(): Nullable<Buffer> {

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

  /**
   * Retrieve a Node.js Readable stream if `useStream` was set to true (defaults to false) when starting the livestream.
   * Otherwise, returns `null`.
   */
  public get stream(): Nullable<Readable> {

    return this._stream;
  }
}
