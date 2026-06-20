# Rust/FFmpeg Stream Port Plan

## Goal

Port the Python/FastAPI stream path into a native, bundled Rust media pipeline so packaged desktop builds can run stream mode without Python, pip, OpenCV, or an external server.

The browser/static renderer stays the default desktop experience. The Rust stream path should be an optional local engine that can be enabled when the user wants server-style frame preparation, adaptive transport, or future capture/transcode features.

## Non-Goals

- Do not replace the WebGPU/WebGL/static renderer.
- Do not add online media-provider dependencies.
- Do not bundle Python as the long-term production answer.
- Do not loosen filesystem permissions. Media files must come from explicit user selection or bundled resources.
- Do not change the adaptive codec format until vector parity tests exist for Rust, Python, and JS.

## Target Shape

Use a Rust media engine behind a narrow command/event API:

```text
Tauri UI
  -> source adapter
  -> rust media session command channel
  -> decode / scale / quantize / encode pipeline
  -> frame events or local websocket-compatible bridge
  -> existing renderer client
```

The first implementation can preserve the existing WebSocket-ish client contract to reduce frontend churn. Later, the Tauri app can bypass localhost transport and feed decoded/encoded frames through direct IPC or shared memory if profiling shows the transport is the bottleneck.

## Crate Layout

Initial option:

- `src-tauri/src/media_engine/`
  - owned by the Tauri app while the API is still changing.

Future option once stable:

- `crates/media-engine/`
  - reusable Rust library for decode, frame prep, timing, and adaptive encode.
- `src-tauri/`
  - Tauri shell and command/event bridge only.

## Pipeline

1. **Source open**
   - Accept only explicit file paths selected through Tauri dialog or bundled demo resources.
   - Store session-local access, not broad path permissions.

2. **Decode**
   - Use FFmpeg bindings or a thin internal wrapper around FFmpeg CLI/libav APIs.
   - Decode video frames into a predictable pixel format, initially RGBA or RGB24.
   - Capture audio timing metadata early even if audio output remains browser-side at first.

3. **Frame preparation**
   - Resize/downsample to target columns/rows.
   - Apply mode/pixel/glyph preparation matching current Python behavior.
   - Keep GPU-quality static rendering separate; this stream path optimizes the current ASCILINE server pipeline.

4. **Encoding**
   - Port the adaptive RAW/ZLIB/DELTA protocol exactly.
   - Keep tolerance/quality semantics byte-compatible with `codec.py` and `codec.js`.

5. **Timing**
   - Preserve master-clock behavior.
   - Start with video-clock timing for local proof of concept.
   - Add audio-clock sync once audio extraction/playback strategy is explicit.

6. **Control**
   - Support soft parameter updates.
   - Support reinit updates for grid/mode/pixel changes without crashing the session.
   - Surface structured errors and lifecycle events to the UI.

## Packaging

- Bundle the Rust media engine into the Tauri app.
- Bundle FFmpeg libraries or sidecar binaries only from a reviewed, reproducible build.
- Prefer Tauri resources under `src-tauri/resources/ffmpeg/{os}-{arch}/bin/`; the desktop bridge resolves `ASCILINE_FFMPEG`/`ASCILINE_FFPROBE` first for dev and CI, then packaged resources, then `PATH` as a development fallback.
- Release CI builds the default sidecars from the pinned official FFmpeg 8.1.2 source tarball with SHA-256 verification, LGPL-compatible configure flags, static FFmpeg libraries, and FFmpeg network protocols disabled.
- Stage sidecars with `npm run ffmpeg:stage -- --ffmpeg <path> --ffprobe <path> --license <spdx-or-policy> --source <review-notes>` so every packaged binary has version, byte-size, SHA-256, license, source, and NOTICE metadata.
- Validate staged binaries with `npm run check:ffmpeg-resources`; require the current platform for release packaging with `npm run check:ffmpeg-release`.
- Keep runtime offline. No runtime downloads of FFmpeg, codecs, models, decoders, or provider SDKs.
- Treat FFmpeg licensing as a release gate. Decide whether the app ships an LGPL-only FFmpeg build, a GPL-enabled build, or asks advanced users to provide their own FFmpeg binary.

## Compatibility Strategy

Before replacing Python behavior, keep three implementations comparable:

- Python encoder: current reference.
- JS decoder: current shipped client.
- Rust encoder: new candidate.

Every codec change should pass:

- Python-generated vectors decoded by JS.
- Rust-generated vectors decoded by JS.
- Python-generated vectors decoded by Rust.
- Rust/Python output parity for representative frame sequences.

## Milestones

1. **Design Lock**
   - Freeze the Rust media session API.
   - Decide FFmpeg binding/build approach.
   - Decide local bridge: localhost WebSocket compatibility first, direct Tauri IPC later, or both.

2. **Codec Parity**
   - Port adaptive frame encoder/decoder to Rust. **Initial implementation complete.**
   - Add vector tests against `experiments/vectors`. **JS and Rust decoders can now validate Python-generated vectors.**
   - Keep this independent of FFmpeg.

3. **Decode Prototype**
   - Decode a local MP4 into RGB/RGBA frames. **Initial RGB24 FFmpeg process adapter complete.**
   - Emit frame dimensions/timing. **Initial `ffprobe` parser reports dimensions, FPS, duration, codec, and pixel format.**
   - Add one CLI/dev command for local verification. **Use `npm run media:decode-preview -- <video> [width] [height] [frames]`.**
   - Add one end-to-end local media pipeline preview. **Use `npm run media:pipeline-preview -- <video> [width] [height] [frames] [mode] [pixel]` to run decode -> prep -> adaptive encode -> Rust decode verification through `media_engine::pipeline`.**
   - Compare decode/resize output against Python/OpenCV. **Use `npm run test:decode-resize`; it uses bounded metrics because FFmpeg/OpenCV decoder and scaler internals are not byte-identical.**

4. **Frame Prep Parity**
   - Match Python resize/mode/pixel behavior for a small fixture. **RGB-to-stream-frame prep is byte-exact against Python/OpenCV for text, `[char,R,G,B]`, and `[B,G,R]` pixel fixtures via `npm run test:frame-prep`.**
   - Add tolerance-based image comparisons where byte parity is not realistic. **Decode/resize bounded parity passes via `npm run test:decode-resize`.**

5. **Tauri Session Bridge**
   - Start/stop media sessions from the UI.
   - Route frames to the existing stream runtime or a compatible local bridge.
   - Preserve static renderer and browser fallback behavior.
   - Selected-file access boundary is now started: Tauri owns media selection, registers selected files under session-local ids, adds only those selected paths to the asset protocol scope, and exposes probe/preview commands that accept registered ids instead of arbitrary paths.
   - Native session bridge is now started: Tauri can create a registered-source media session, hold the streaming FFmpeg reader in managed state, return INIT-style metadata, pull bounded batches of adaptive encoded frames, and stop/drop the session. `StreamRuntime` now uses that path in Tauri stream mode when the active source is a selected desktop file, while preserving the WebSocket path for external stream mode.
   - Native session batch validation exists through `npm run media:native-session-preview -- <video> [width] [height] [frames] [mode] [pixel] [batch]`; `npm run check:media` runs this in both ASCII-color and pixel modes.
   - Current bridge target: profile the batched IPC path, then move to event batches/direct IPC/shared memory if needed so native stream mode does not regress renderer smoothness. Do not expose a broad arbitrary-path media command.

6. **Audio and Sync**
   - Extract or hand off audio.
   - Reproduce master-clock sync behavior.
   - Confirm latency budget under desktop app conditions.

7. **Packaging**
   - Bundle the engine and reviewed FFmpeg runtime.
   - Verify offline launch and playback on macOS, Windows, and Linux.
   - Add installer smoke tests.

## Open Decisions

- FFmpeg binding: current implementation starts with a Rust-owned FFmpeg/ffprobe process boundary so a bundled sidecar can be swapped in later without frontend changes. Revisit direct libav bindings after frame-prep parity and packaging constraints are clearer.
- Packaged FFmpeg sourcing: the resource lookup path is wired, but reviewed per-platform binaries and license notices still need to be added before production distribution.
- Transport: localhost-compatible WebSocket bridge vs direct Tauri IPC.
- Audio ownership: browser/webview playback, Rust playback, or split decode/playback.
- Licensing posture for bundled FFmpeg builds.
- Whether stream mode should be user-facing in v1 desktop builds or hidden behind an advanced/dev flag until parity is proven.
- Decode/resize parity: RGB-to-framebuffer prep is covered by byte-exact Python/OpenCV fixtures. FFmpeg-vs-OpenCV decode/resize is covered by bounded visual metrics in `npm run test:decode-resize`; exact byte parity is not a realistic contract because decoder and scaler internals differ.
