/* Copyright(C) 2022-2026, HJD (https://github.com/hjdhjd). All rights reserved.
 *
 * protect-api-livestream.ts: Our UniFi Protect livestream API implementation.
 */

/**
 * Access a direct MP4 livestream for a UniFi Protect camera.
 *
 * The UniFi Protect livestream API is largely undocumented and has been reverse engineered mostly through trial and error, as well as observing the Protect
 * controller in action. It builds on the works of others in the community - particularly https://github.com/XciD - who have experimented and successfully
 * gotten parts of this API decoded. As always, this work stands on the contributions of others and the work that's come before it, and I want to acknowledge
 * those that paved the way.
 *
 * Let's start by defining some terms. In the MP4 world, an MP4 file (or stream) is composed of multiple atoms or segments. Think of these as packet types
 * that contain specific pieces of information that are needed to put together a valid MP4 file. For our purposes, we're primarily interested in four types of
 * MP4 boxes:
 *
 * - **FTYP** - File type box. Contains codec and file information. It must be at the very beginning of any stream.
 * - **MOOV** - Movie metadata box. Contains all the metadata about the stream that follows. It must be preceded by the FTYP box. The Protect livestream API
 *   combines the FTYP and MOOV boxes, conveniently giving us a complete initialization segment.
 * - **MOOF** - Movie fragment box. Defines the metadata for a specific segment of audio and video. Always paired with an MDAT box containing the actual data.
 * - **MDAT** - Media data box. Contains a segment of the actual audio and video data. Always paired with an MOOF box containing the metadata.
 *
 * Every fMP4 stream begins with an initialization segment comprised of the FTYP and MOOV boxes. It defines the file type, what the movie metadata is, and
 * other characteristics. Think of it as the header for the entire stream.
 *
 * After the header, every fMP4 stream has a series of segments (sometimes called fragments, hence the term fMP4), that consist of a pair of MOOF/MDAT boxes
 * that includes all the audio and video for that segment. You end up with something that looks like:
 *
 * ```
 *  |ftyp|moov|moof|mdat|moof|mdat...
 * ```
 *
 * The UniFi Protect livestream API provides a straightforward interface to generate bespoke fMP4 streams that can be tailored depending on your needs. This
 * implementation of the API allows you to access those streams and retrieve all the relevant boxes/atoms you need to manipulate them for your application.
 *
 * @module ProtectLivestream
 */
import { type ErrorEvent, type MessageEvent, WebSocket } from "undici";
import events, { EventEmitter } from "node:events";
import type { Nullable } from "./protect-types.js";
import { PROTECT_LIVESTREAM_HEARTBEAT_TIMEOUT } from "./settings.js";
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

// Pre-computed set of valid livestream frame types for O(1) validation on the hot path.
const VALID_LIVE_FRAMES: ReadonlySet<number> = new Set(Object.values(ProtectLiveFrame).filter((v): v is number => typeof v === "number"));

// Reusable empty buffer to avoid allocating a new zero-length buffer each time partial packet data is consumed.
const EMPTY_BUFFER: Buffer = Buffer.alloc(0);

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
 * 4. Listen for `message` events emitted by {@link ProtectLivestream} which provides Buffers containing the raw fMP4 segment data as it's produced by Protect. You can
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
  private api: ProtectApi;
  private heartbeat: Nullable<NodeJS.Timeout>;
  private initSegmentPromise?: Promise<Buffer>;
  private lastMessage: number;
  private log: ProtectLogging;
  private sessionAbort: Nullable<AbortController>;
  private ws: Nullable<WebSocket>;

  // Create a new instance.
  constructor(api: ProtectApi, log: ProtectLogging) {

    // Initialize the event emitter.
    super();

    this._codec = null;
    this._initSegment = null;
    this._stream = null;
    this.api = api;
    this.heartbeat = null;
    this.lastMessage = 0;
    this.log = log;
    this.sessionAbort = null;
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
   * @event timestamps  - Emitted with decode timestamp arrays when emitTimestamps is enabled in options.
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

    // Create a fresh abort controller for this session. Every resource tied to the session's lifetime receives this signal...when stop() aborts it, all listeners,
    // promises, and event registrations are cleaned up automatically.
    this.sessionAbort = new AbortController();

    // Clear out the initialization segment and any cached promise from a prior session.
    this._initSegment = null;
    this.initSegmentPromise = undefined;

    // Launch the livestream.
    return this.launchLivestream(cameraId, channel, options as LivestreamOptions);
  }

  /**
   * Stop an fMP4 livestream session from the Protect controller.
   */
  public stop(): void {

    // Abort the session signal. This automatically removes all WebSocket event listeners registered with the signal and rejects any pending getInitSegment() promise.
    this.sessionAbort?.abort();
    this.sessionAbort = null;

    // Close the websocket.
    this.ws?.close();

    // Clear the heartbeat timer.
    if(this.heartbeat) {

      clearInterval(this.heartbeat);
      this.heartbeat = null;
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

    const logError = (message: string, ...parameters: unknown[]): void => { this.log.error(options.requestId + ": " + message, ...parameters); };

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

      // Open the livestream WebSocket using the shared WebSocket agent for TLS session reuse and connection efficiency. We read the agent from the API at connection time
      // rather than caching it, so we always use the current agent even if reset() has cycled it. WebSocket upgrades can only happen over HTTP/1.1, so we use a dedicated
      // agent rather than the main HTTP/2 pool.
      this.ws = new WebSocket(wsUrl, { dispatcher: this.api.wsDispatcher ?? undefined });

      // The user's requested that we use a stream interface instead of an event interface to push complete fMP4 segments.
      if(options.useStream) {

        this._stream = new Readable({

          read:(): void => { /* Intentionally a no-op, since we're going to push complete fMP4 segments as soon as they're available. */ }
        });
      }

      // All WebSocket listeners use the session's abort signal so they are automatically removed when stop() aborts the session.
      const { signal } = this.sessionAbort ?? new AbortController();

      // Start our heartbeat once we've opened the connection.
      this.ws.addEventListener("open", () => {

        this.lastMessage = Date.now();

        // Heartbeat the controller. We need this because if we don't heartbeat the controller, it can sometimes just decide not to give us a livestream to work with, or
        // lockup due to regressions in the controller firmware. This ensures we can never hang waiting on data from the API, especially in a livestream scenario.
        this.heartbeat = setInterval(() => {

          if((Date.now() - this.lastMessage) > PROTECT_LIVESTREAM_HEARTBEAT_TIMEOUT) {

            logError("the livestream API is not responding.");

            if((this.ws?.readyState === WebSocket.CLOSING) || (this.ws?.readyState === WebSocket.OPEN)) {

              this.ws.close();
            }
          }
        }, PROTECT_LIVESTREAM_HEARTBEAT_TIMEOUT);

        // Process packets coming to our websocket.
        this.processLivestream();
      }, { signal });

      // Catch any errors and inform the user, if needed.
      this.ws.addEventListener("error", (event: ErrorEvent): void => {

        const error = event.error as NodeJS.ErrnoException;

        // Ignore timeout errors, but notify the user about anything else.
        if(!(error instanceof TypeError) && (error.code !== "ETIMEDOUT")) {

          logError("error while communicating with the livestream websocket API: %s", error);
          logError(util.inspect(error, { colors: true, depth: null, sorted: true }));
        }

        this.stop();
      }, { signal });

      this.ws.addEventListener("close", () => {

        this.stop();

        this.emit("close");
      }, { signal });

    } catch(error) {

      logError("error while connecting to the livestream websocket API: %s", error);
      this.stop();

      return false;
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

    // Track the segment under construction. We collect chunks in arrays and perform a single Buffer.concat at segment end to avoid repeated allocations and copies
    // during accumulation.
    let currentSegment = {

      audio: [] as Buffer[],
      mdat: [] as Buffer[],
      moof: [] as Buffer[],
      video: [] as Buffer[]
    };

    // Keep any tail bytes that didn't form a full packet yet.
    let packetRemaining: Buffer = EMPTY_BUFFER;

    // Process data coming in from the websocket. The handler is async because Blob data requires an await to convert to an ArrayBuffer. The session's abort signal
    // ensures this listener is removed when stop() is called.
    const { signal } = this.sessionAbort ?? new AbortController();

    // eslint-disable-next-line @typescript-eslint/no-misused-promises
    this.ws.addEventListener("message", async (event: MessageEvent): Promise<void> => {

      // Update our heartbeat.
      this.lastMessage = Date.now();

      // Normalize event.data into a Buffer so we can process it.
      let buffer: Buffer | undefined;

      try {

        if(event.data instanceof Blob) {

          buffer = Buffer.from(await event.data.arrayBuffer());
        } else if(event.data instanceof ArrayBuffer) {

          buffer = Buffer.from(event.data);
        } else if(typeof event.data === "string") {

          buffer = Buffer.from(event.data);
        } else {

          this.log.error("Unsupported WebSocket message type: %s.", typeof event.data);
          this.ws?.close();

          return;
        }
      } catch(error) {

        this.log.error("Error processing livestream WebSocket message: %s.", error);
        this.ws?.close();
      }

      if(!buffer) {

        return;
      }

      // Prepend any leftover partial packet.
      let packet = buffer;

      // If we have anything left from the last packet we processed, prepend it to this packet.
      if(packetRemaining.length > 0) {

        packet = Buffer.concat([ packetRemaining, packet ]);
        packetRemaining = EMPTY_BUFFER;
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
        if(!VALID_LIVE_FRAMES.has(header)) {

          this.log.error("Invalid header found while decoding the livestream: %s", header);

          break;
        }

        // Protect encodes the length of the entire fMP4 segment in the three bytes following the header byte, as a big-endian 24-bit unsigned integer.
        const length = packet.readUIntBE(offset + 1, 3);

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

            currentSegment.audio.push(data);

            break;

          // End of segment. Concatenate all accumulated chunks for each box type and build the complete segment.
          case ProtectLiveFrame.ENDSEGMENT: {

            const moof = Buffer.concat(currentSegment.moof);
            const mdat = Buffer.concat(currentSegment.mdat);
            const video = Buffer.concat(currentSegment.video);
            const audio = Buffer.concat(currentSegment.audio);

            completeSegment = Buffer.concat([ moof, mdat, video, audio ]);

            if(this._stream) {

              this._stream.push(completeSegment);
            } else {

              this.emit("segment", completeSegment);
              this.emit("message", completeSegment);
              this.emit("moof", moof);
              this.emit("mdat", mdat);
            }

            break;
          }

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

              audio: [],
              mdat: [],
              moof: [],
              video: []
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

            for(let tsOffset = 0; tsOffset < data.length; tsOffset += 8) {

              timestamps.push(Number(data.readBigUInt64BE(tsOffset)));
            }

            this.emit("timestamps", timestamps);

            break;

          // MDAT box. Add it to the MDAT portion of our segment.
          case ProtectLiveFrame.MDAT:

            currentSegment.mdat.push(data);

            break;

          // MOOF box. Add it to the MOOF portion of our segment.
          case ProtectLiveFrame.MOOF:

            currentSegment.moof.push(data);

            break;

          // We've got video data. Add it to our current segment.
          case ProtectLiveFrame.VIDEO:

            currentSegment.video.push(data);

            break;

          // We'll never get here since we check our header information above.
          default:

            break;
        }

        // Advance the offset past this entire packet (header + payload).
        offset = dataEnd;
      }
    }, { signal });
  }

  /**
   * Retrieve the initialization segment that must be at the start of every fMP4 stream.
   *
   * @remarks If the stream is stopped before the initialization segment is received, the returned promise rejects with an AbortError. Callers should handle this
   *   rejection or wrap the call with a timeout.
   *
   * @returns Returns a promise that resolves once the initialization segment has been seen, or returning it immediately if it already has been.
   */
  public async getInitSegment(): Promise<Buffer> {

    // Return our segment once we've seen it.
    if(this.initSegment) {

      return this.initSegment;
    }

    // Cache a promise that resolves when the initsegment event is emitted, or rejects with an AbortError when the session is aborted via stop().
    return this.initSegmentPromise ??= this.awaitInitSegment();
  }

  // Wait for the initialization segment event, gated by the session's abort signal. The init segment is guaranteed to be non-null when the event fires because the
  // event handler in processLivestream sets _initSegment before emitting.
  private async awaitInitSegment(): Promise<Buffer> {

    // If there's no active session, reject immediately. Calling getInitSegment() on a stopped stream has no session to produce the event and no abort signal to
    // settle the promise.
    if(!this.sessionAbort) {

      throw new Error("No active livestream session.");
    }

    const [initSegment] = await events.once(this, "initsegment", { signal: this.sessionAbort.signal }) as [Buffer];

    return initSegment;
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
   * @returns Returns a string containing the codec information, if it exists, or `null` otherwise.
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
