/* Copyright(C) 2022, HJD (https://github.com/hjdhjd). All rights reserved.
 *
 * protect-api-livestream.ts: Our UniFi Protect livestream API implementation.
 */
import { EventEmitter } from "events";
import { ProtectApi } from "./protect-api";
import { ProtectLogging } from "./protect-logging";
import WebSocket from "ws";

/*
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
 * FTYP - File type box. This contains codec and file information for the stream that follows it.
 *        It must be at the beginning of any stream, and preceded by the FTYP box.
 * MDAT - Media data box. This contains a segment of the actual audio and video data in the MP4 stream.
 *        It is always paired with an MOOF box, which contains the metadata describing this payload in an MDAT box.
 * MOOF - Movie fragment box. This defines the metadata for a specific segment of audio and video.
 *        It is always paired with an MDAT box, which contains the actual data.
 * MOOV - Movie metadata box. This contains all the metadata information about the stream that follows.
 *        It must be at the beginning of any stream, and preceded by the FTYP box.
 *
 * Every fMP4 stream begins with the FTYP and MOOV boxes for the entire stream. It defines the file type,
 * what the movie metadata is, and other characteristics. Think of it as the header for the entire stream.
 *
 * After the header, every fMP4 stream has a series of segments (sometimes called fragments, hence the term fMP4),
 * that consist of a pair of moof / mdat boxes that includes all the audio and video for that segment. You end up with something
 * that looks like:
 *
 *  |ftyp|moov|moof|mdat|moof|mdat...
 *
 * The UniFi Protect livestream API provides a straightforward interface to generate bespoke fMP4 streams that
 * can be tailored depending on your needs. This API allows you to create those streams, and retrieve all the relevant boxes/atoms
 * you need to manipulate them for your application.
 */

// A complete description of the UniFi Protect livestream API websocket API.
enum ProtectLiveFrame {

  KEYFRAME = 247,
  FTYP = 248,
  BEGINSEGMENT = 249,
  MOOV = 250,
  MOOF = 251,
  VIDEO = 252,
  AUDIO = 253,
  MDAT = 254,
  ENDSEGMENT = 255
}

// UniFi Protect livestream API implementation.
export class ProtectLivestream extends EventEmitter {

  private _ftyp: Buffer | null;
  private _moov: Buffer | null;
  private api: ProtectApi;
  private errorHandler: ((error: Error) => void) | null;
  private log: ProtectLogging;
  private name: () => string;
  private segmentHandler: ((packet: Buffer) => void) | null;
  private ws: WebSocket | null;

  // Create a new instance.
  constructor(api: ProtectApi, log = api.log) {

    // Initialize the event emitter.
    super();

    this._ftyp = null;
    this._moov = null;
    this.api = api;
    this.errorHandler = null;
    this.log = log;
    this.name = api.getNvrName.bind(api);
    this.segmentHandler = null;
    this.ws = null;
  }

  // Start the UniFi Protect livestream.
  public async start(cameraId: string, channel: number, segmentLength = 100, requestId = cameraId + "-" + channel.toString()): Promise<boolean> {

    // Stop any existing stream.
    this.stop();

    // Clear out the movie metadata atom.
    this._ftyp = null;
    this._moov = null;

    // Launch the livestream.
    return await this.launchLivestream(cameraId, channel, segmentLength, requestId);
  }

  // Stop the UniFi Protect livestream.
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
  private async launchLivestream(cameraId: string, channel: number, segmentLength: number, requestId: string): Promise<boolean> {

    // To ensure there are minimal performance implications to the Protect NVR, enforce a 100ms floor for
    // segment length. Protect happens to default to a 100ms segment length as well, so we do too.
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
    // progressive:              Enable progressive livestreaming.
    // rebaseTimestampsToZero:   Rebase the timestamps of each segment to zero. Otherwise, timestamps will reflect the controller's default.
    // requestId:                Name for this particular request. It's optional in practice, and can be any string.
    // type:                     Container format type. The valid values are fmp4 and UBV (UniFi Video proprietary format).
    const params = new URLSearchParams({
      allowPartialGOP: "",
      camera: cameraId,
      channel: channel.toString(),
      extendedVideoMetadata: "",
      fragmentDurationMillis: segmentLength.toString(),
      progressive: "",
      rebaseTimestampsToZero: "false",
      requestId: requestId,
      type: "fmp4"
    });

    // Generate our websocket endpoint URL.
    const url = this.api.wsUrl() + "/livestream?" + params.toString();

    this.log.debug("%s: Opening livestream websocket URL: %s", this.name(), url);

    // Get the websocket.
    const wsUrl = await this.api.getWsEndpoint(url);

    // We ran into a problem getting the websocket URL. We're done.
    if(!wsUrl) {

      this.log.error("%s: Unable to retrieve the livestream websocket API endpoint from the UniFi Protect controller.", this.name());
      return false;
    }

    try {

      // Open the livestream websocket.
      this.ws = new WebSocket(wsUrl, { rejectUnauthorized: false });

      if(!this.ws) {

        this.ws = null;
        this.log.error("%s: Unable to connect to the livestream websocket API endpoint.", this.name());

        return false;
      }

      // Catch any errors and inform the user, if needed.
      this.ws?.once("error", this.errorHandler = (error): void => {

        // Ignore timeout errors, but notify the user about anything else.
        if((error as NodeJS.ErrnoException).code !== "ETIMEDOUT") {

          this.log.error("%s: Error while communicating with the livestream websocket API: %s", this.name(), error);
        }

        this.stop();
      });

      // Process packets coming to our websocket.
      this.processLivestream();

    } catch(error) {

      this.log.error("%s: Error while connecting to the livestream websocket API: %s", this.name(), error);
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

      // If we have anything left from the last packet we processed, prepend it to this packet.
      if(packetRemaining.length > 0) {

        packet = Buffer.concat([packetRemaining, packet]);
        packetRemaining = Buffer.alloc(0);
      }

      let offset = 0;

      for(;;) {

        // If we have less than 4 bytes remaining, it's an incomplete packet and we don't have enough
        // information to decode it since we need the packet header to decode. We save it to prepend
        // to the next packet that comes across.
        if((packet.length - offset) < 4) {

          packetRemaining = packet.slice(offset);
          break;
        }

        // Grab the encoded packet header.
        const offsetWithHeader = offset + 4;
        const header = packet.slice(offset, offsetWithHeader);

        // Ensure we have a valid header before we do anything.
        if(!(header[0] in ProtectLiveFrame)) {

          this.log.error("%s: Invalid header found while decoding the livestream: %s", this.name(), header[0]);
          break;
        }

        // Get the length of the actual fMP4 segment we are decoding. Since all this is done over a websocket,
        // portions of an fMP4 segment can span packets and need to be encoded. Protect encodes the length
        // of the entire fMP4 segment in the first three bytes of the header like so...
        const segmentLength = (((header[1] << 8) | header[2]) << 8) | header[3];

        // Once we know our length, if we don't have the complete packet, we save it and punt until we see
        // more data come across.
        if(packet.length < (offset + segmentLength + 4)) {

          packetRemaining = packet.slice(offset);
          break;
        }

        // Grab the data portion of the packet.
        const data = packet.slice(offsetWithHeader, offsetWithHeader + segmentLength);
        let completeSegment = null;

        // Figure out which data type we've got based on our header, and process it.
        switch(header[0]) {

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

          // FTYP data. Build the FTYP box and emit our events.
          case ProtectLiveFrame.FTYP:

            // Write the ftyp header. The first four bytes represent the length of this atom, the next four designate the atom type.
            this._ftyp = Buffer.alloc(8);
            this._ftyp.writeUInt32BE(data.length + 8);
            this._ftyp.write("ftyp", 4);

            // Create the complete atom.
            this._ftyp = Buffer.concat([ this._ftyp, data ]);

            this.emit("ftyp", this.ftyp);
            this.emit("message", this.ftyp);

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

          // We've got a keyframe. Add it to our current segment.
          case ProtectLiveFrame.KEYFRAME:

            currentSegment.keyframe = data;
            break;

          // MDAT box. Add it to the MDAT portion of our segment.
          case ProtectLiveFrame.MDAT:

            currentSegment.mdat = Buffer.concat([ currentSegment.mdat, data ]);
            break;

          // MOOF box. Add it to the MOOF portion of our segment.
          case ProtectLiveFrame.MOOF:

            currentSegment.moof = Buffer.concat([ currentSegment.moof, data ]);
            break;

          // MOOV box. Add it to the MOOV portion of our segment and emit our events.
          case ProtectLiveFrame.MOOV:

            this._moov = data;
            this.emit("moov", this.moov);
            this.emit("message", this.moov);
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

  // Retrieve the FTYP box, if we've seen it.
  public get ftyp(): Buffer | null {

    return this._ftyp;
  }

  // Retrieve the MOOV box, if we've seen it.
  public get moov(): Buffer | null {

    return this._moov;
  }
}
