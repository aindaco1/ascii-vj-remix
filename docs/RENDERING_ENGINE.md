# Rendering Engine

This document describes how ASCII VJ Remix renders sources into ASCII/cell
visual output across browser and Tauri desktop contexts.

Related practice docs:

- [Performance](PERFORMANCE.md) for renderer/output latency and FPS validation.
- [Security](SECURITY.md) for local media, Tauri capability, updater, and
  FFmpeg sidecar boundaries.
- [Testing](TESTING.md) for the current renderer, media, native output, and
  release validation matrix.
- [Accessibility](ACCESSIBILITY.md) and [Internationalization](I18N.md) for
  control-surface UX rules that affect renderer-facing controls.

## Architecture Properties

- WebGPU/WebGL output is the visual-quality target.
- ASCILINE-derived Canvas and adaptive-stream paths remain available as
  compatibility and development infrastructure.
- Normal app use is local-first and offline.
- All live controls route through one canonical parameter model.
- Presets, WTF mode, audio reactivity, and MIDI control compose without forking
  renderer state.
- Pop Out uses latest-frame native paths where available to minimize live-camera
  latency.
- Palette, ordered-dither, glyph, and density behavior is defined once in
  shared catalogs/math and implemented by each backend without parallel state.

## High-Level Data Flow

```text
Source selection
  -> source adapter
  -> canonical params
  -> optional live modulation
  -> effective params
  -> renderer runtime
  -> main preview
  -> optional native/browser Pop Out
```

Source selection can come from built-in media, user-selected files, camera
streams, mixed cameras, or development stream sessions. The renderer runtime
chooses the best backend for the active source and environment.

## Source Layer

### Built-In Media

The visible built-ins are:

- Demo Image: `media/demo.svg`.
- Demo Video: `media/demo-video-2.mp4`.

Additional bundled media files remain hidden development fixtures for parity
tests and performance smoke tests.

### Custom Files

Browser mode uses browser file APIs and blob URLs. Tauri mode uses a native
dialog command and registers the selected file under a session-local media id.
That media id is exposed to the webview through Tauri's asset protocol.

The important security boundary is that the renderer receives a playable media
URL or registered id. It does not gain broad filesystem access.

### Cameras

Browser camera capture uses `getUserMedia`.

For a single camera:

```text
MediaDevices.getUserMedia
  -> hidden video element
  -> MediaSource abstraction
  -> WebGPU/WebGL2/Canvas renderer
```

For multiple cameras:

```text
N camera streams
  -> hidden video elements
  -> Canvas2D mixer
  -> captured/mixed media source
  -> renderer
```

Camera controls include device selection, capture size, FPS, layout, framing,
and mirror. Facing-mode controls are hidden when irrelevant to the selected
device capabilities.

Tauri native Pop Out has an additional macOS path for single-camera output:

```text
AVFoundation capture
  -> latest BGRA/RGB frame
  -> native output renderer
```

That path avoids WebView canvas readback and was introduced to reduce camera
latency.

### Audio

Audio is not a visual source. It is an analysis source that modulates render
params.

Browser audio sources:

- local audio file.
- mic/input through `getUserMedia`.
- display/tab audio through `getDisplayMedia` when the platform exposes an
  audio track.

Tauri desktop audio sources:

- browser/Web Audio providers where available.
- native system/input audio feature providers for desktop builds.

The audio layer outputs bounded feature vectors, not raw audio buffers or raw
visual frames.

### Stream Sessions

Stream sessions are development and advanced infrastructure. They are not a
normal user-facing source.

Legacy path:

```text
Python/FastAPI/OpenCV
  -> ASCILINE frame preparation
  -> adaptive WebSocket frames
  -> JS decoder
  -> Canvas stream runtime
```

Rust/FFmpeg path:

```text
registered media id
  -> Rust media session
  -> FFmpeg probe/decode
  -> Rust frame preparation
  -> adaptive encode
  -> Tauri batch read
  -> StreamRuntime
```

The normal Source UI hides stream mode. Prospective productization work is
tracked in the [Roadmap](ROADMAP.md).

## Parameter Model

The app maintains one canonical parameter object, commonly referred to in code
as `params`.

Major parameter groups:

- source: source mode, media URL/id, media type, source name.
- camera: selected device ids, resolution, FPS, layout, framing, mirror.
- backend: auto, WebGPU, WebGL2, Canvas2D, Pixel Canvas.
- grid: columns, rows, auto rows, cell width, cell height, aspect correction,
  global Advanced Density preference.
- color: saturation, contrast, brightness, gamma, background blend,
  quantization, palette id, palette mapping.
- dither: ordered matrix, strength, scale, bias, invert.
- sampling: FPS, jitter amount, jitter speed, sample X/Y, smoothing.
- glyph/cell: glyph mode, solid mode, character set, custom typed ramp, depth,
  offset, reverse, glyph-color mode/color, background color, neutral atlas
  style, font family metadata, minimum glyph intensity.
- stream: codec, quality, tolerance, buffer settings, frame timing.
- UI/performance: stats overlay, transition seconds.

The control surface, presets, persistence, source changes, WTF mode, audio
reactivity, native output, and MIDI all read from or write through this
model.

Static renderer-family transitions keep media ownership at the `StaticRuntime`
layer. Canvas2D, pixel Canvas, WebGL, and WebGPU renderers can crossfade over
the same live video/camera source instead of destroying and reloading media when
`solidMode`, `glyphMode`, `pixel`, or `backend` changes.

### Shared Renderer Math

Shared helpers reduce duplicated renderer math without changing the established
Canvas or stream output.

Shared JavaScript helpers live in:

```text
renderers/shared/character-sets.js
renderers/shared/density-policy.js
renderers/shared/glyph-atlas.js
renderers/shared/palettes.js
renderers/shared/render-math.js
renderers/shared/render-math-vectors.json
```

The shared module currently owns:

- GPU-style color processing used by software snapshots and native parity tests.
- Legacy Canvas color processing.
- Legacy stream color processing.
- shader-style jitter hash helpers.
- a bounded canonical character-set catalog, including credited ascii.today
  adaptations.
- complete approved Unicode coverage metadata and bounded custom-ramp
  validation.
- project-native palette ids/colors, a cached 32x32x32 palette lookup table,
  and immutable Bayer matrices.
- shared accelerated/software column and total-cell density limits.
- Unicode-scalar glyph ids, 1024px atlas page addressing, cached max-coverage
  browser mips, a four-page decoded cache, and lazy local page loading.
- compact charset and luminance-to-glyph helpers.

The Canvas and stream functions are intentionally named separately from the GPU
function. Their established quantization and background-blend behavior remains
distinct while shared vectors protect compatibility.

`npm run test:render-math` validates the JavaScript helpers against shared
vectors. Rust native output tests consume the same vector file for GPU color
processing parity.

### Effective Params

Some features affect live rendering without changing saved state.

Audio reactivity is the main example:

```text
base params
  + audio feature modulation
  -> effective params
  -> renderer.updateParams()
```

Effective params must not persist back into user presets unless the user
explicitly saves the current state as a preset.

## Backend Selection

Backend `auto` attempts the highest-quality viable path first.

Typical browser priority:

1. WebGPU.
2. WebGL2.
3. Canvas2D.
4. Pixel Canvas when selected or required.

The user can override the backend manually. Controls that do not apply to the
active backend are hidden or disabled.

Backend choice is resolved once per renderer construction in
`renderers/gpu/ascii/renderer/backend-policy.js`; it is not evaluated in the
frame loop. Apple WebKit glyph mode uses WebGL2 even when WebGPU is available
or manually requested because the WebKit WebGPU atlas path can expose a live
renderer while presenting an empty canvas. Solid-cell mode can still use
WebGPU, and glyph mode retains WebGPU on compatible runtimes. If WebGL2 is not
available, WebGPU remains the last accelerated option rather than falling
straight to an unavailable CPU renderer.

## WebGPU Renderer

The WebGPU renderer is the primary quality target.

Video sources use `importExternalTexture()` per frame. Image sources upload once
with `copyExternalImageToTexture()` into a `texture_2d<f32>`.

The renderer uses a two-stage GPU flow:

1. Cell pass:
   - divide the source into a grid.
   - sample one point per cell.
   - apply animated per-cell jitter.
   - optionally mirror X.
   - apply color processing, ordered thresholding, and palette lookup.
   - write one processed color per cell to a storage texture.
2. Render pass:
   - draw a fullscreen triangle.
   - map output pixels to cells using cell width/height.
   - fetch the processed cell color.
   - fill the output canvas or mask it through the selected Unicode glyph ramp.

Color processing includes:

- saturation boost around luminance average.
- contrast boost around midpoint.
- brightness.
- gamma.
- optional color quantization.
- background blend toward the app's dark canvas color.
- optional Bayer 2x2/4x4/8x8 ordered dithering.
- optional nearest-color or luminance-ramp palette mapping through a palette
  lookup buffer that changes only when palette/mapping changes.

Jitter uses a deterministic hash seeded by cell position and time, so static
images can animate without changing source media.

Uniform ArrayBuffers/DataViews, texture views, and bind groups whose resources
do not change are created once and reused. Browser video still imports an
external texture and creates its source-dependent compute binding per frame;
that resource is frame-scoped by WebGPU. Grid/source rebuilds create a new
renderer and therefore a new complete resource set.

The glyph renderer uses Unicode scalar ids in a 96-entry storage buffer and a
16-layer R8 texture array. Atlas pages are generated offline, locally bundled,
and loaded on demand. Live audio/transition updates compare a compact glyph
input key before resolving ramps or touching atlas resources.

## WebGL2 Renderer

The WebGL2 backend mirrors the WebGPU visual model as closely as practical:

- video frames upload with `texImage2D()` per frame.
- images upload once.
- first pass samples one color per cell into a cell-color texture.
- first-pass palette/dither math matches the shared contract.
- second pass expands the cell-color texture and optionally samples the same
  Unicode-scalar atlas/ramp contract as WebGPU.
- shader uniforms match the WebGPU parameter set where possible.
- all 18 shader uniform locations are cached after program linking rather than
  queried again during each frame.

WebGL2 is the most important browser fallback because it is widely available on
machines that do not expose WebGPU and is the accelerated glyph path in the
macOS Apple WebKit webview.

## Canvas Renderers

Canvas paths preserve ASCILINE compatibility and low-level fallback behavior.

Canvas2D glyph/text mode renders character-like cells. Pixel Canvas renders
colored block/pixel data more directly.

Canvas uses the same palette catalog, lookup table, ordered thresholds, and
bounded active glyph ramp. It does not load operating-system fonts into the
native output path and remains governed by the lower software density ceiling.

These paths are important for:

- older browsers or webviews.
- stream-frame compatibility.
- testing the adaptive codec output.
- environments where GPU initialization fails.

Canvas fallback remains functional even though it is not the highest-quality
path.

## Static Runtime

`StaticRuntime` manages browser-native local sources and GPU/Canvas backends.

Responsibilities:

- load or rebuild the active source.
- choose backend.
- start and stop media playback.
- keep the renderer alive across live-safe param changes.
- rebuild renderer surfaces when structural params change.
- preserve video playback state when changing presets that do not change the
  source.
- update stats.

For structural changes, the runtime uses layered renderer surfaces:

```text
old renderer stays visible
  -> new renderer initializes behind or beside it
  -> non-structural params tween
  -> surfaces crossfade
  -> old renderer is destroyed
```

This avoids black frames during preset transitions.

For a non-structural numeric tween, only controls whose values are changing are
synchronized during animation frames. Source lists, camera-device options,
visibility, meters, persistence, and the complete control surface are reconciled
at the final state boundary. This is a UI-work optimization only; effective
renderer params and native/Pop Out synchronization still advance during the
tween.

## Stream Runtime

`StreamRuntime` handles ASCILINE-style encoded frame streams.

It can consume:

- WebSocket frames from the legacy Python/FastAPI server.
- native Rust/FFmpeg session batches in Tauri development paths.

Stream frames carry INIT metadata and framebuffer messages. The JS decoder
supports:

- legacy raw frames.
- adaptive RAW.
- adaptive ZLIB.
- adaptive DELTA.

Stream mode is hidden from the normal Source UI and retained as development
infrastructure.

## Adaptive Codec

The adaptive codec exists to reduce bandwidth compared with sending the full
framebuffer every frame.

Each encoded frame chooses one of:

- RAW: full framebuffer.
- ZLIB: compressed framebuffer.
- DELTA: cells changed since the previous frame.

Codec quality can allow tolerance-based temporal deltas for color planes while
keeping character planes exact where applicable.

Compatibility rules:

- existing legacy clients can still receive raw frames.
- JS and Rust decoders must stay compatible with Python-generated vectors.
- codec changes require vector tests.

## Rust/FFmpeg Media Pipeline

The Rust/FFmpeg path ports the Python/FastAPI stream preparation path toward a
desktop-packaged local engine.

Current shape:

```text
Tauri selected media
  -> Rust registry id
  -> ffprobe metadata
  -> ffmpeg RGB frame reader
  -> frame preparation
  -> adaptive encoder
  -> native session batches
  -> StreamRuntime or validation tools
```

Key modules:

- `media_engine::ffmpeg`: FFmpeg/ffprobe process boundary, video probe, RGB
  reader, camera reader options.
- `media_engine::frame_prep`: ASCILINE-compatible text/color/pixel framebuffer
  preparation.
- `media_engine::codec`: adaptive codec encoder/decoder.
- `media_engine::pipeline`: decode -> prep -> encode -> optional decode
  verification.

Frame preparation modes:

- text mode: grayscale to ASCII palette.
- color modes 2 through 5: `[char, R, G, B]` cells with quantized color levels.
- pixel mode: `[B, G, R]` cells.

The Rust path complements rather than replaces the WebGPU/WebGL static renderer.
It provides packaged stream-style media preparation and native decoder
integration.

## Native Output Renderer

The native output renderer exists because a second WebView-rendered pop-out was
too expensive for low-latency live output.

Desktop flow:

```text
main UI params/source state
  -> Tauri native output command
  -> native output state
  -> source frame acquisition
  -> native `wgpu` presenter
  -> output window
```

For file-backed images/videos, Rust resolves bundled resources or registered
media ids, decodes frames, uploads the latest frame to the GPU, applies cell
color math, and presents through the native swapchain.

On the macOS display-link path, the decoded source-frame version is passed to
the presenter. When that version and the frame dimensions have not changed, the
presenter reuses the existing source texture while still encoding/presenting
with the latest visual and audio-reactive params. Unversioned fallback callers
retain unconditional uploads. Logs expose source upload and skip counters.

For macOS single-camera output, AVFoundation captures latest frames directly for
the native presenter. Live camera presets do not use browser mirror transport by
default because canvas readback and IPC frame transfer are too expensive for
sustained output.

Native output consumes the same canonical palette, dither, `glyphMode`,
character-set/custom-ramp, depth/offset/reverse, and glyph/background color
params as the control surface. The native `wgpu` presenter fuses palette and
ordered-dither work into its cell pass, then masks cells through the same
Unicode-scalar page/ramp contract as the browser GPU renderers.

The frontend resolves the selected catalog entry into a bounded base
`charsetRamp`; Rust validates supported scalars and applies depth, offset, and
reverse once to create a maximum 96-id ramp. Required 1024px R8 atlas pages are
decoded/uploaded lazily and retained in the presenter's fixed 16-layer texture.
`fontFamily` remains preview/control-surface metadata; native output never loads
arbitrary system or user fonts.

For fallback/mirrored sources, bounded raw pixel snapshots can be sent from the
main renderer to the native output.

Native output design rules:

- output window does not own broad Tauri permissions.
- presenter consumes the latest params live.
- latest-frame semantics are preferred over deep buffering.
- primary renderer behavior must not regress when Pop Out is open.
- browser fallback must remain available.

## Audio-Reactive Modulation

Audio analysis updates effective render params at frame rate.

Features:

- RMS.
- bass.
- low-mid.
- mid.
- high-mid.
- treble.
- presence.
- brightness.
- density.
- spectral flux.
- beat pulse.
- phase/sway.

Dense-mix dampening uses the density feature to reduce beat/flux-heavy
modulation during crowded broadband passages without muting sparse transients.

Modulation targets are live-safe visual controls:

- brightness.
- contrast.
- saturation.
- gamma.
- background blend.
- jitter amount.
- jitter speed.
- sample offsets.

Structural controls such as source, backend, grid allocation, and camera devices
are not modulated per beat because they would cause renderer churn.

## Presets, WTF Mode, and MIDI

These are all control layers over the same parameter model.

Presets:

- apply known parameter sets.
- may specify transition duration.
- can be saved/imported/exported by users.

WTF mode:

- creates randomized target params.
- anchors some random states around extreme preset families and traditional
  ASCII presets.
- transitions indefinitely until stopped.
- avoids unsafe all-white/all-black states.

Experimental MIDI:

```text
UC-33e DIN output
  -> mioXC/CoreMIDI
  -> bounded Rust event queue
  -> frame-coalesced mapping engine
  -> canonical visual/audio target
  -> params/effective params
  -> main preview and native Pop Out synchronization
```

- Uses the same ranges, clamps, setters, and structural metadata as visible UI
  controls.
- Applies base visual or audio-reactive settings; it does not fork renderer
  state or write audio-derived effective params back into presets.
- Re-arms soft takeover after visual preset changes.
- Keeps button edges ordered while coalescing high-rate continuous changes.
- Restricts actions to visual params, audio-reactive settings, visual presets,
  and WTF mode. Sources, Camera, Pop Out, and output displays are not targets.
- Uses four channel-addressed UC-33e pages and stable numeric preset slots.
- Captures/restores bounded opaque SysEx packets through the selected mioXC
  output without exposing MIDI permissions to the output window.
- The mapping and transport layers are automated-test covered, but physical
  full-bank restore/verification remains an experimental acceptance gap.

See [UC-33e and mioXC MIDI Control](MIDI_UC33E.md) for the physical map.

## Packaging and Offline Runtime

The renderer must not depend on online assets at runtime.

Packaged assets include:

- frontend bundle.
- renderer code.
- GPU assets.
- fonts.
- built-in demo media.
- Tauri native code.
- reviewed FFmpeg sidecars.

Production CSP blocks arbitrary remote HTTP(S) runtime access. The asset
protocol is scoped narrowly and session-locally for user-selected media.

## Validation

The maintained validation matrix lives in [Testing](TESTING.md). The primary
renderer, output, codec, and media commands are:

```bash
npm run smoke:static
npm run test:output-display
npm run smoke:native-output
npm run smoke:ui-perf
npm run test:vectors
npm run test:frame-prep
npm run test:decode-resize
npm run check:media
npm run test:rust
```

Prospective renderer, camera, stream, audio, and MIDI work is tracked only in
the [Roadmap](ROADMAP.md).
