[**unifi-protect**](README.md)

***

[Home](README.md) / ProtectLivestream

# ProtectLivestream

Access a direct MP4 livestream for a UniFi Protect camera.

The UniFi Protect livestream API is largely undocumented and has been reverse engineered mostly through
trial and error, as well as observing the Protect controller in action. It builds on the works of others in the
community - particularly https://github.com/XciD - who have experimented and successfully gotten parts of this API decoded.
As always, this work stands on the contributions of others and the work that's come before it, and I want to acknowledge those
that paved the way.

Let's start by defining some terms. In the MP4 world, an MP4 file (or stream) is composed of multiple atoms or segments.
Think of these as packet types that contain specific pieces of information that are needed to put together a valid MP4 file.
For our purposes, we're primarily interested in four types of MP4 boxes:

| Box   | Description                                                                                                                                   |
|-------|-----------------------------------------------------------------------------------------------------------------------------------------------|
| FTYP  | File type box. This contains codec and file information for the stream that follows it. It must be at the beginning of any stream, and preceded by the FTYP box.      |
| MDAT  | Media data box. This contains a segment of the actual audio and video data in the MP4 stream. It is always paired with an MOOF box, which contains the metadata describing this payload in an MDAT box.        |
| MOOF  | Movie fragment box. This defines the metadata for a specific segment of audio and video. It is always paired with an MDAT box, which contains the actual data.        |
| MOOV  | Movie metadata box. This contains all the metadata information about the stream that follows. It must be at the beginning of any stream, and preceded by the FTYP box. The Protect livestream API actually combines the FTYP and MOOV boxes, conveniently giving us a complete initialization segment.        |

Every fMP4 stream begins with an initialization segment comprised of the FTYP and MOOV boxes. It defines the file type,
what the movie metadata is, and other characteristics. Think of it as the header for the entire stream.

After the header, every fMP4 stream has a series of segments (sometimes called fragments, hence the term fMP4),
that consist of a pair of moof / mdat boxes that includes all the audio and video for that segment. You end up with something
that looks like:

```
 |ftyp|moov|moof|mdat|moof|mdat...
```

The UniFi Protect livestream API provides a straightforward interface to generate bespoke fMP4 streams that
can be tailored depending on your needs. This implementation of the API allows you to access those streams, retrieve all the relevant boxes/atoms you need to
manipulate them for your application.

## Classes

### ProtectLivestream

This class provides a complete event-driven API to access the UniFi Protect Livestream API endpoint.

1. Create an instance of the [UniFi Protect API](ProtectApi.md#protectapi) to connect to the Protect controller.

2. Create an instance of [Protect Livestream](#protectlivestream) using the API instance above either directly, or through calling
[createLivestream](ProtectApi.md#createlivestream) method on an instance of [ProtectApi](ProtectApi.md#protectapi) (preferred).

3. Start a livestream using [start](#start), stop it with [stop](#stop), and listen for events.

3. Listen for `message` events emitted by [ProtectLivestream](#protectlivestream) which provides Buffers containing the raw fMP4 segment data as it's produced by Protect. You can
   alternatively listen individually for the initialization segment or regular fMP4 segments if you'd like to distinguish between the two types of segments.

Those are the basics that gets us up and running.

#### Extends

- `EventEmitter`

#### Constructors

##### Constructor

```ts
new ProtectLivestream(api, log): ProtectLivestream;
```

###### Parameters

| Parameter | Type |
| ------ | ------ |
| `api` | [`ProtectApi`](ProtectApi.md#protectapi) |
| `log` | [`ProtectLogging`](ProtectLogging.md#protectlogging) |

###### Returns

[`ProtectLivestream`](#protectlivestream)

###### Overrides

```ts
EventEmitter.constructor
```

#### Accessors

##### codec

###### Get Signature

```ts
get codec(): string;
```

The codecs in use for this livestream session.

###### Remarks

Codec information is provided as `codec,container` where codec is either `avc` (H.264) or `hev` (H.265). The container format is always `mp4`.

###### Example

```ts
`hev1.1.6.L150,mp4a.40.2`
```

###### Returns

`string`

Returns a string containing the codec information,if it exists, or `null` otherwise.

##### initSegment

###### Get Signature

```ts
get initSegment(): Nullable<Buffer<ArrayBufferLike>>;
```

The initialization segment that must be at the start of every fMP4 stream.

###### Returns

`Nullable`\<`Buffer`\<`ArrayBufferLike`\>\>

Returns the initialization segment if it exists, or `null` otherwise.

##### stream

###### Get Signature

```ts
get stream(): Nullable<Readable>;
```

Retrieve a Node.js Readable stream if `useStream` was set to true (defaults to false) when starting the livestream.
Otherwise, returns `null`.

###### Returns

`Nullable`\<`Readable`\>

#### Methods

##### getInitSegment()

```ts
getInitSegment(): Promise<Buffer<ArrayBufferLike>>;
```

Retrieve the initialization segment that must be at the start of every fMP4 stream.

###### Returns

`Promise`\<`Buffer`\<`ArrayBufferLike`\>\>

Returns a promise that resolves once the initialization segment has been seen, or returning it immediately if it already has been.

##### start()

```ts
start(
   cameraId, 
   channel, 
options): Promise<boolean>;
```

Start an fMP4 livestream session from the Protect controller.

###### Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `cameraId` | `string` | Protect camera device ID property from the camera's [ProtectCameraConfig](ProtectTypes.md#protectcameraconfiginterface). |
| `channel` | `number` | Camera channel to use, indexing the channels array in the camera's [ProtectCameraConfig](ProtectTypes.md#protectcameraconfiginterface). |
| `options` | `Partial`\<[`LivestreamOptions`](#livestreamoptions)\> | Optional parameters to further customize the livestream session. |

###### Returns

`Promise`\<`boolean`\>

Returns `true` if the livestream has successfully started, `false` otherwise.

###### Remarks

Once a livestream session has started, the following events can be listened for (unless you've specified `useStream` in `options`, in which case only the
         `close` event is available):

| Event         | Description                                                                                                                                  |
|---------------|----------------------------------------------------------------------------------------------------------------------------------------------|
| `close`       | Livestream has been closed.                                                                                                                  |
| `codec`       | The codec and container format in use in the livestream. The codec information will be passed as an argument to any listeners.               |
| `initsegment` | An fMP4 initialization segment has been received. The segment will be passed as an argument to any listeners.                                |
| `message`     | An fMP4 segment has been received. No distinction is made between segment types. The segment will be passed as an argument to any listeners. |
| `segment`     | A non-initialization fMP4 segment has been received. The segment will be passed as an argument to any listeners.                             |
| `timestamp`   | A `BigInt` representing the decode timestamp of frames. It mirrors what is provided in the `tfdt` box in fMP4 segments.                      |

##### stop()

```ts
stop(): void;
```

Stop an fMP4 livestream session from the Protect controller.

###### Returns

`void`

## Interfaces

### LivestreamOptions

Options for configuring a livestream session.

#### Properties

| Property | Type | Description |
| ------ | ------ | ------ |
| <a id="emittimestamps"></a> `emitTimestamps` | `boolean` | Optionally emit the decode timestamps of frames as timestamp events. This is the same information that appears in `tfdt` boxes. |
| <a id="lens"></a> `lens` | `number` | Optionally specify alternate cameras on a Protect device, such as a package camera. |
| <a id="requestid"></a> `requestId` | `string` | Optionally specify a request ID to the Protect controller. This is primarily used for logging purposes. |
| <a id="segmentlength"></a> `segmentLength` | `number` | Optionally specify the segment length, in milliseconds, of each fMP4 segment. Defaults to 100ms. |
| <a id="usestream"></a> `useStream` | `boolean` | If `true`, a Node.js Readable stream interface will be created for consuming raw fMP4 segments instead of using EventEmitter events. Defaults to false. |
