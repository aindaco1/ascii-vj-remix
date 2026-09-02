# Performance

This guide documents the current performance model, acceptance behavior, and
validation practices for ASCII VJ Remix.

Performance work is about frame pacing, GPU
output, media decode, camera latency, audio-reactive response, native Pop Out,
and keeping the dense control UI responsive while the renderer is under load.

## Performance Principles

- Test performance with optimized builds when making performance claims.
- Preserve renderer quality before accepting a faster but visibly worse path.
- Avoid renderer restarts for live-safe control changes.
- Prefer latest-frame semantics for live camera and output paths.
- Keep main preview and Pop Out FPS measured separately.
- Keep audio analysis responsive without shipping raw unbounded audio buffers
  across IPC.
- Keep randomization, presets, audio reactivity, and MIDI on the same coalesced
  live-control path.
- Keep all runtime assets local so performance does not depend on network
  availability.
- Resolve density through the shared column/total-cell policy. Advanced Density
  is an explicit global preference, not a visual-preset escape hatch.
- Rebuild palette lookup tables and glyph ramps/pages only when their discrete
  inputs change; audio and transition frames must remain uniform/param updates.
- Start the production launch update check asynchronously. A slow or unavailable
  release endpoint must not delay renderer, source, audio, or control startup.
- Keep crash reporting off the render path. Capture, queueing, sanitization, and
  submission must be bounded and must not block frame presentation or live
  controls.
- Watch thermals and battery. This app can intentionally keep CPU, GPU, camera,
  media decode, and audio analysis active.

## Practical Acceptance Behavior

These are regression criteria for supported hardware, not frame-rate guarantees
across every machine.

| Area | Target |
| --- | --- |
| Demo Image | Renderer starts automatically and remains responsive while presets/WTF/audio change params. |
| Demo Video | Smooth playback through source switches and preset transitions without restarting video unless source changes. |
| Main preview | Does not collapse to low single-digit FPS solely because Pop Out is open on supported hardware. |
| Pop Out | Native output approaches display refresh on Demo Image and Demo Video in optimized builds. |
| Camera Pop Out | Prefer latest-frame native capture/presentation paths to minimize visible latency. |
| Audio reactivity | Visual response remains immediate while preserving stable RMS/band/beat analysis. |
| Source switching | Built-in image/video switches are bounded and do not leave the renderer stuck. |
| Control UI | Sliders, preset buttons, source selection, and WTF toggle remain interactive under render load. |
| MIDI | Continuous controls are frame-coalesced and remain responsive without one IPC/render update per raw hardware message. |

## Renderer Performance Model

The renderer follows this flow:

```text
source adapter
  -> canonical params
  -> optional live modulation
  -> effective params
  -> renderer runtime
  -> main preview
  -> optional native/browser Pop Out
```

Performance regressions often happen when one layer bypasses this model.

Rules:

- Use the canonical parameter model for UI controls, presets, WTF mode, audio
  modulation, native output sync, and MIDI.
- Batch high-frequency control changes to animation frames where possible.
- Do not rebuild renderer resources for numeric control changes that can be
  updated as uniforms/params.
- Separate source changes from visual param changes.
- Preserve active media playback time when visual presets change.
- Keep discrete changes controlled and predictable during transitions.

## 0.9.6 Measured Optimization Pass

The 0.9.6 pass removes repeated setup/copy work from measured hot paths without
changing shaders, sampling, color math, glyph selection, source/output
resolution, or quality controls.

| Path | Before | 0.9.6 behavior |
| --- | --- | --- |
| Native macOS video Pop Out | RGB-to-RGBA conversion and texture upload on every display-link presentation | Upload only when the decoded source-frame version changes; continue presenting and applying params every display tick |
| WebGPU | New uniform backing storage, texture views, and stable bind groups assembled per frame | Reuse uniform storage, texture views, and stable bind groups; external video texture binding remains per frame |
| WebGL2 | 18 `getUniformLocation` calls per frame | Resolve the 18 locations once after linking |
| Numeric transitions | Full source, camera, visibility, meter, and control-surface sync on every tween frame | Sync changing values during the tween and perform the complete final-state refresh once |

On the optimized macOS Apple Silicon test build, Demo Video decoded at about
23.8 FPS while native Pop Out presented at 60.1 FPS. Source-version caching
performed 23.8 uploads and skipped 36.3 duplicate uploads per second, removing
about 60% of the previous RGB conversion/texture-upload frequency. A benchmark
run can still be affected by machine load; compare the same fixed transition
targets, backend, duration, build type, and phase percentiles rather than a
single minimum.

On the same host, the optimized published 0.9.5 reference measured 35.8 FPS in
the main phase and 39.3 FPS after opening Pop Out. The final optimized 0.9.6
candidate measured 38.6 and 39.0 FPS respectively, then 35.9 FPS during fixed
numeric-transition churn. The older harness used a random third phase, so only
the steady main/Pop Out phases are used for that release comparison.

The browser smoke harness also instruments a 250 ms numeric transition. It
requires source-control synchronization to remain at no more than two calls and
camera/full-visual synchronization at no more than one call while value updates
continue throughout the tween.

## 0.9.8 Release Build Optimization

The 0.9.7 release's slowest Windows packaging job took about 31 minutes. Its
FFmpeg source build took about 12.5 minutes, repeated release verification about
5.5 minutes, and app compilation plus packaging about 10 minutes; those
independent stages were mostly serialized.

Version 0.9.8 adapts the verified-build reuse pattern used by MKV Magic. Release
CI resolves one immutable tag commit and runs the FFmpeg source build and Tauri
`--no-bundle` app compilation concurrently. It also waits for the exact
commit's normal `Desktop` CI instead of repeating that suite inside every
packaging job. Bundle jobs accept only the matching short-lived workflow
artifacts, recheck FFmpeg resources, and verify the app binary's commit,
platform, version, size, and SHA-256 before `tauri bundle` packages it without a
second compile. Signing, updater signatures, notarization, bundle inspection,
published-asset checks, and real install/update smokes remain release gates.

This changes the critical path from the sum of FFmpeg plus app compilation to
approximately the slower of the two, without changing renderer code, shipped
resources, target platforms, signing policy, or output formats.

## 0.9.11 Palette, Dither, Unicode, and Density Pass

The 0.9.11 reference floor is Apple M1/16 GB or a comparable Windows x64
integrated-GPU machine. Intel macOS is not a release target. The optimized
primary workload is local 1080p video with Audio Reactivity and a visible
native output window; the release target is 30 FPS with P95 frame time at or
below 33.3 ms on the reference floor.

Shared density limits are:

| Mode | Columns | Total cells | Promise |
| --- | ---: | ---: | --- |
| Accelerated normal | 640 | 160,000 | Performance-guarded range; presets stay here. |
| Software normal | 120 | 6,000 | Lower Canvas/CPU guardrail. |
| Advanced Density | 900 | 500,000 | Explicit global preference; no 30 FPS guarantee. |

The M1 Max/64 GB development host is faster than the reference floor, so its
results are local regression evidence rather than floor acceptance. At 640
columns, feature-off WebGL2 measured 39.1 FPS main, 39.9 FPS with native output,
and 35.4 FPS during transition churn; peak RSS was about 444 MB. Signal Court +
Bayer 4 + the CJK Unified ramp measured 37.9, 40.1, and 37.0 FPS with about
446 MB peak RSS. Main/Pop Out/transition P95 values were 29.6/29.4/31.6 ms,
within ten percent of the matched feature-off phases. Native output remained
near 60 FPS with no GPU failures.

Machine-readable evidence:

- `docs/performance/0.9.10-phase-zero-baseline.md`
- `docs/performance/0.9.11-density-feature-off-m1-max-webgl2.json`
- `docs/performance/0.9.11-density-feature-on-m1-max-webgl2.json`
- `docs/performance/0.9.11-pre-fix-occluded-output-soak-m1-max-webgl2.json`
- `docs/performance/0.9.11-background-memory-soak-m1-max-webgl2.json`

The first 15-minute unattended soak exposed an occluded-native-output resource
retention bug: steady RSS climbed from 156.5 MB to 9,411.9 MB because source
frames were uploaded before an output surface was available to submit them.
Native output now acquires the surface before queue writes, skips uploads while
occluded, drains the display-link thread's autorelease pool per tick, and polls
completed GPU work without blocking. The repeat 15-minute run began at 156.1 MB
steady RSS and ended at 155.5 MB, a -0.6 MB drift, with 446.1 MB startup peak
and no native-sync failures.

The repeat ran while the unattended macOS session kept the application in the
background, so WebKit throttled requestAnimationFrame and native IPC to roughly
1 Hz. That run is memory-lifetime evidence only, not frame-rate acceptance. The
visible-window 640-column figures above remain the local FPS evidence; physical
reference-floor and Windows performance acceptance remain separate.

The source Unicode atlas is divided into sixteen 1024px grayscale pages. Only
pages required by the active maximum-96-scalar ramp are decoded, and the shared
browser cache retains at most four base pages plus generated max-coverage mips.
WebGPU compacts the active masks and all five coverage levels into one 768x62
RGBA texture, about 186 KB of GPU storage. WebGL2 retains the bounded 16-layer
R8 array and its mips, while native Pop Out retains the 16 MB base-page
allocation. This avoids the multi-second CJK page stalls observed with four
2048px pages while keeping package bytes, CPU cache, and WebGPU allocation
bounded.

The original local feature-on measurements selected WebGL2 and remain browser
GPU regression evidence, not acceptance evidence for the installed Apple
WebKit glyph preview.

For the primary macOS Apple WebKit view, acceleration-eligible glyph presets
use the compact WebGPU ramp texture. Presets that explicitly own Canvas2D keep
the normal software density ceiling. The installed all-preset sweep resolves
41 built-ins to WebGPU and 28 to Canvas2D, keeps all 69 visible, and confirms
every GPU-eligible preset is accelerated. Native Pop Out remains independently
GPU-rendered. A 30-second structural run held the primary view at 30.0 FPS,
native presentation at 60.0 FPS, source uploads at 23.5 FPS for the 24 FPS
fixture, and completed 16 synchronized crossfades with zero GPU or transition
failures. These are M1 Max development-host regression results, not M1/16 GB
floor certification.

## Backend Notes

### WebGPU

WebGPU is the primary visual quality target and the first choice on capable
Chromium and packaged macOS Apple WebKit runtimes.

The clean-profile preset must not own the global renderer preference. The
default backend is Auto, and built-ins without an explicit compatibility
backend are expected to resolve to WebGPU first and WebGL2 second.

Watch for:

- external texture import costs on video frames.
- storage texture sizing after grid/cell changes.
- shader changes that increase per-pixel work at high output sizes.
- transition paths that accidentally create extra full renderers for too long.

### WebGL2

WebGL2 is the most important embedded GPU fallback and visually tracks WebGPU as
closely as practical.

Watch for:

- per-frame texture upload cost.
- context loss handling.
- extra canvas readbacks.
- precision differences in gamma, quantization, and saturation.

### Canvas2D and Pixel Canvas

Canvas paths preserve compatibility and ASCILINE lineage. They are not the
highest-quality path, but they must stay functional.

Watch for:

- text/glyph rendering cost at high column counts.
- per-cell loops at high target FPS.
- stream compatibility regressions.

### Native Pop Out

The native output path exists because a second full webview/canvas renderer was
not fast enough for the product goal.

Rules:

- Use native `wgpu` output when available.
- Keep output-window permissions minimal.
- Prefer direct frame transfer or latest-frame native capture paths.
- Keep glyph-mode resources bounded. Character-set changes update the
  small glyph ramp/params, not trigger unbounded font loading or large dynamic
  atlas allocation.
- Avoid blocking the main UI while the output window presents.
- Arm preset transitions once with a shared timestamp. Do not serialize one
  request/response parameter update per animation frame while a native tween or
  crossfade can advance on the display link.
- Keep the native surface at minimum supported frame latency so swapchain
  buffering does not add avoidable main-to-output delay.
- Prefer a non-sRGB native surface format so the shared byte-space renderer
  color math is not transformed a second time by the swapchain.
- Upload source textures on source-frame version changes rather than display
  refresh; unversioned fallback callers must continue to upload.
- Keep counters/logs available for frame acquisition, presentation, param
  version, source version, and pacing regressions.

## Source-Specific Budgets

### Static Images

Static image rendering is the cheapest path. Jitter, audio modulation,
and WTF transitions can animate the output without reloading the image.

Avoid:

- re-decoding or re-uploading the same image for every preset.
- resetting source identity during preset transitions.

### Video Files

Video source changes are structural; preset changes are not.

Avoid:

- restarting video on preset changes.
- waiting for a transition midpoint before applying continuous numeric params.
- doing unnecessary readbacks from the video canvas.

### Cameras

Camera latency matters more than buffering smoothness.

Rules:

- Prefer latest-frame semantics.
- Keep camera resolution/FPS adjustable.
- Do not queue old camera frames when the renderer falls behind.
- Use platform-native capture/texture paths where they produce meaningful
  latency reductions.
- Windows Media Foundation and Linux V4L2 single-camera Pop Out feed the native
  `wgpu` presenter without WebView readback or per-frame IPC. If native opening
  fails, the bounded 640x360 mirror keeps only one request in flight and is
  capped at 30 FPS; diagnostics report accepted FPS and transfer timings.
- For multi-camera, be explicit about the mixing cost and the selected layout.

### Audio Reactivity

Audio analysis is tuned for stable live response.

Rules:

- Keep analyzer windows and smoothing low enough for live response.
- Use feature vectors such as RMS, bass, mid, treble, flux, beat pulse, and
  phase rather than unbounded raw samples.
- Keep dense-mix helpers derived from the same bounded analyzer buffers:
  low-mid/high-mid bands, presence, brightness, and density do not add
  unbounded history or raw-audio IPC.
- Clamp modulation so high sensitivity cannot drive pure black or pure white
  screens.
- Restart capture automatically when the selected input device changes.

### Crash Reporting

Crash reporting must stay opportunistic and low overhead.

Rules:

- Capture small structured reports only; do not attach frames, screenshots,
  media files, raw audio, or long logs.
- Renderer failures may attach at most the eight most recent sanitized
  renderer events; keep collection bounded and outside frame-loop work.
- Keep local queues bounded by report count and byte size.
- Submit asynchronously from Rust with short network timeouts.
- Never wait on crash-report submission before starting renderers, switching
  sources, opening Pop Out, or applying live controls.
- Attempt Canvas fallback immediately after a GPU construction failure; queue
  its diagnostic asynchronously after the replacement renderer is active.
- In debug/dev builds, capture locally but refuse network submission.

### Experimental MIDI Control

- Rust keeps a bounded event queue and drops the oldest event when full.
- JavaScript preserves ordered button edges but coalesces continuous events by
  message/channel/controller before applying a frame.
- Live-safe params update through existing renderer setters.
- Structural params keep the existing delayed rebuild path rather than
  rebuilding for every 7-bit increment.
- Soft takeover avoids disruptive jumps after preset changes without adding a
  polling loop per binding.
- Port monitoring runs at a low fixed cadence; normal event reads are bounded.
- SysEx capture/restore is an explicit setup operation and never runs on the
  render thread. Packet restore is paced for older hardware.

## Battery and Thermal Guidance

The app can be heavy by design.

For laptop use:

- Use AC power for performances.
- Lower columns, FPS, camera resolution, and jitter when thermals climb.
- Close Pop Out when it is not needed.
- Avoid multiple cameras on battery unless necessary.
- Treat fans and thermal throttling as performance signals, not just noise.

## Validation Commands

General build/offline checks:

```bash
npm run build
npm run check:offline
```

Static/browser harness:

```bash
npm run smoke:static
```

Native output and UI performance helpers:

```bash
npm run smoke:native-output
npm run smoke:ui-perf
npm run smoke:primary-presets
npm run test:native-output-log
npm run bench:density
```

`smoke:ui-perf` starts from canonical defaults and uses two fixed,
non-structural numeric transition targets. It records average, P10, P50, and
minimum preview FPS plus native output rates and the renderer backends actually
visited, requested palette/dither/charset, renderer replacements, frame resets,
and a post-run primary-canvas pixel signal. A renderer with advancing frames
but an empty canvas fails the smoke. To compare an exact installed or archived
application bundle:

```bash
ASCILINE_SOURCE_APP="/absolute/path/ASCII VJ Remix Dev.app" \
ASCILINE_UI_PERF_SMOKE_DURATION_MS=30000 \
npm run smoke:ui-perf
```

Add `ASCILINE_UI_PERF_SMOKE_STRUCTURAL=1` to alternate glyph and solid renderer
families during the transition phase. This exercises the native two-pass
crossfade and reports display-link `transitioned` frame cadence in addition to
parameter and audio-modulation cadence.

`smoke:primary-presets` separately activates every built-in Demo Image preset
inside the installed Apple WebKit app. It verifies the final primary canvas for
each preset so Pop Out output, an intermediate transition snapshot, or a later
renderer fallback cannot satisfy the primary-view acceptance check.

Feature-on comparison example:

```bash
ASCILINE_UI_PERF_SMOKE_BACKEND=webgl2 \
ASCILINE_UI_PERF_SMOKE_PALETTE=signal-court \
ASCILINE_UI_PERF_SMOKE_DITHER=bayer4 \
ASCILINE_UI_PERF_SMOKE_CHARSET=cjk-basic \
ASCILINE_DENSITY_BENCH_COLUMNS=640 \
npm run bench:density
```

Native display-link logs include `sourceUploads` and `sourceUploadSkips`. For a
24 FPS video on a 60 Hz output, the expected healthy shape is about 24 uploads
and 36 skips per second while presentation remains near 60 FPS.

Desktop and release gates:

```bash
npm run test:desktop-updater
npm run check:desktop
npm run check:release
```

Media pipeline:

```bash
npm run check:media
npm run test:rust
```

Secondary-display simulation:

```bash
npm run test:output-display
npm run test:midi
```

## Manual Performance Checks

Before shipping renderer, source, output, or audio changes, manually verify:

- Demo Image starts on load.
- Demo Video plays without manual renderer start.
- Switching Demo Image and Demo Video is fast.
- Preset transitions are smooth and do not flash original media frames.
- At least one traditional ASCII preset, such as Classic Camera ASCII, renders
  correctly in the main preview and Pop Out.
- WTF mode runs indefinitely and source switching does not wedge the renderer.
- Audio reactivity visibly changes output with Mic/Input selected.
- Pop Out keeps the main preview responsive.
- Pop Out reflects WTF and audio-reactive changes while fully visible.
- Pop Out palette, brightness, contrast, and background colors match the main
  preview for the same preset.
- Camera Pop Out does not freeze on the first frame.
- Stats Overlay reports believable FPS/grid/source/preset data.

For optimized-build performance claims, use the built app rather than the dev
server or debug bundle.

## Regression Signals

Investigate immediately when:

- main preview caps at a low FPS only while Pop Out is open.
- Pop Out only updates correctly when dragged partly off screen.
- preset transitions pause before numeric params start changing.
- video restarts on preset change.
- source switching takes multiple seconds for built-in media.
- audio reactivity has obvious visual delay after beat/transient changes.
- camera output freezes or accumulates stale frames.
- CPU/GPU usage spikes after closing Pop Out.

Prospective benchmark, latency-test, texture-sharing, and performance-dashboard
work is tracked in the [Roadmap](ROADMAP.md).
