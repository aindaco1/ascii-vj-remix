# Original Pixel Art and Color Cycling Presets

Status: archived approved design for 1.0.4. The checklists below preserve the
planning baseline; verified implementation and remaining acceptance are tracked
in the [release record](RELEASE_1.0.4.md).
Source reviewed: `c415d33`, package version 1.0.3, September 15, 2026.
Current behavior is documented in the [Rendering Engine](../RENDERING_ENGINE.md).

## Agreed Scope

The user confirmed:

- Transform the currently selected camera, video, or image.
- Offer solid-pixel and glyph-based looks.
- Create original palettes and preset designs inspired by the references.

Ship through the existing built-in preset library and normal app update. Users
can save and exchange variations through the existing preset JSON workflow
after installing an engine version that understands the new parameters.

The first release should deliver four original palette families, each with
one pixel preset and one glyph preset. Start with one pair as a visual proof.
Authored scene playback, artwork import, automatic scene segmentation, a
palette editor, a pack marketplace, and video export are separate future work.

## What the References Establish

- Ferrari's archive separates game backgrounds from color-cycling and
  palette-shifting scenes. Use it for composition, restrained color ramps,
  lighting, and pixel texture. [Mark Ferrari: Image Archives](https://www.markferrari.com/image-archives)
- Living Worlds provides separate cycle speed, Classic/Blend, and time-of-day
  controls. Palette rotation and a day/night palette change are different
  capabilities. [Living Worlds](https://www.effectgames.com/demos/worlds/)
- Color cycling changes palette entries associated with groups of pixels.
  [Amiga Graphics Archive](https://amiga.lychesis.net/specials/ColorCycling.html)
- The demo author's explanation describes indexed images, multiple animated
  color sets, and interpolation between palette steps. Its code and artwork
  have separate reuse terms. This plan uses original data and the technique,
  with no dependency on the demo player or its artwork.
  [Joseph Huckaby: Canvas Cycle](https://github.com/jhuckaby/canvascycle)

**Artistic limit:** the apparent water, rain, and fire motion in those scenes
depends on deliberately painted index patterns. Mapping arbitrary footage to a
cycling palette will animate color regions and contours; it cannot infer those
painted motion paths. Judge the first proof as a live-media interpretation.
If convincing directional water or rain is required later, add authored masks
or index fields as a separately scoped feature.

## Existing Engine and Specific Gaps

| Area | Current implementation | Required change |
| --- | --- | --- |
| Pixels and glyphs | Existing solid/pixel/glyph modes, cell grid, local atlas, and sampling controls | Reuse these modes; tune presets with stable sampling and low or zero jitter. |
| Palette catalog | 17 palettes; `MAX_PALETTE_COLORS = 16` | Add ordered ramps and bounded cycle-range metadata; expand supported capacity. |
| Color mapping | 32×32×32 RGB-to-index lookup, then palette-to-RGB lookup | Keep assignment tied to the immutable base palette while animating the display colors. |
| Dither | Shared Bayer 2×2/4×4/8×8 matrices | Reuse existing cell-anchored thresholds; keep their phase independent of cycling. |
| GPU resources | Palette colors, lookup, and dither share resource invalidation | Separate static mapping resources from frequently updated display colors. |
| Glyph selection | Cell alpha stores luminance derived from final mapped RGB | For cycling, retain base-palette luminance so colors can move without changing glyph density. |
| Animation time | Jitter uses local frame-count/FPS time; transitions already share a timestamp | Add a shared cycle transport; do not use independent renderer frame counts. |
| Native Pop Out | Receives resolved palette colors; Rust truncates to 16; native GPU has its own palette buffer | Extend the existing payload, normalization, GPU path, and software fallback. |
| Presets | Canonical defaults/control metadata, strict JSON keys, source exclusions, playlists, transitions | Add parameters to those existing seams and document new-engine requirements. |

Primary source owners:

- [Palette catalog and lookup](../../renderers/shared/palettes.js)
- [Shared color math](../../renderers/shared/render-math.js)
- [Controller, Canvas, StaticRuntime, presets, and output payload](../../app.js)
- [WebGPU renderer](../../renderers/gpu/ascii/renderer/webgpu/webgpu-renderer.js)
- [WebGL2 renderer](../../renderers/gpu/ascii/renderer/webgl2/webgl2-renderer.js)
- [Native params and software rendering](../../src-tauri/src/native_output.rs)
- [Native GPU rendering](../../src-tauri/src/native_output/gpu.rs)

## Rendering Contract

```text
Selected local source
  -> existing cell sampling and color adjustments
  -> existing ordered dither
  -> immutable base-palette lookup -> index i
  -> animated display palette[i]   -> cell RGB
  -> base palette[i] luminance     -> stable glyph density
  -> existing solid fill or glyph mask
  -> preview / Pop Out / current PNG capture
```

### 1. Palette Data and Capacity

Extend the shared palette catalog with optional cycle ranges. Each range has
inclusive start/end indices, a positive base rate in palette steps per second,
direction, and an optional initial offset. Propose a maximum of eight ranges;
reject overlaps, invalid indices, non-finite values, and zero-length ranges.
Colors outside all ranges remain fixed. Preserve catalog order for cycling;
the existing luminance-sorted mapping is a separate derived index order.

Support up to **256 entries internally**, with initial designs using roughly
16–64 colors. The current byte-valued lookup can already represent indices
0–255; its 32,768-entry size does not need to grow. Replace every 16-entry
allocation, shader declaration, byte offset, and native clamp together.
Keep palette count in a type that represents 256. `quantizeBits` remains its
existing channel-quantization control, not a palette-size control.

Use one bounded palette-layout contract consumed by JS and Rust rather than
scattered numeric limits. Keep authored palette data in the shared catalog;
send its resolved colors/ranges through `_nativeOutputParams()` instead of
maintaining a second Rust catalog. A 256-entry float RGBA display table is 4 KiB.
For WebGL2, use a small nearest-fetched texture instead of enlarging the current
`vec3[16]` fragment-uniform array. Retain GPU buffers where already appropriate
in WebGPU/native. These are backend adapters to the same data contract.

### 2. Cycling Evaluation

Add a small shared JS module for validation, range evaluation, and display-table
generation. Rust needs an equivalent evaluator for independent native output;
both consume the same conformance vectors. Evaluate at most 256 colors once
per rendered state per frame, outside the per-cell loop. Shaders only perform
the existing indexed lookup. Do not copy the range algorithm into each shader.

For a range of length N and phase p measured in palette steps:

- Classic uses `floor(p)` with positive modulo N, including reverse playback.
- Blend interpolates adjacent rotated entries using the fractional phase.
- Amount mixes each base entry with its evaluated entry in the app's existing
  byte-space color convention; preserve the same rounding across backends.

Suggested persisted controls, registered through existing defaults/metadata:

| Key | Initial contract | UI |
| --- | --- | --- |
| `paletteCycleMode` | `off`, `classic`, `blend`; default `off` | Color panel select; no-cycle palettes show Off/disabled behavior. |
| `paletteCycleSpeed` | Signed multiplier, proposed −4 to +4; default 1 | Speed; zero freezes the current phase, negative reverses. |
| `paletteCycleAmount` | 0–1; default 1 | Amount; zero displays the base palette. |

Use stable base-palette glyph luminance whenever cycling is enabled. Keep
feature-off glyph behavior byte-compatible. The existing cell alpha channel
already carries luminance, so no extra full-resolution render target is
required. Fixed glyph color still obeys the existing fixed-color control;
new glyph presets use palette/source coloring so cycling is visible.

Separate invalidation keys:

- Base palette contents/revision or mapping changes: rebuild RGB-to-index LUT.
- Dither mode changes: update only matrix data.
- Time, speed, mode, or amount changes: update the small display table only.
- Glyph ramp changes: retain the existing independent atlas/ramp path.

Never regenerate the base LUT from rotated colors. Doing so would reassign
pixels and undermine the intended cycling. Keep source textures, pipelines,
bind groups, and reusable table buffers alive during ordinary cycle updates.
The current cell pass can continue to resolve indices every render; persistent
index textures and static-cell caching are later optimizations if measured.

### 3. Time and Transition Ownership

Add one runtime-owned cycle transport alongside the current transition timing:
an anchor timestamp, accumulated cycle time, rate, and revision. Anchor each
renderer to a local monotonic clock after synchronization. Reconcile on
resume/reopen and clock discontinuities. Do not put timestamps into saved
presets or derive phase from source frame count.

- Resolve phase before changing speed so speed changes and reversal do not jump.
- Start/Stop freezes/resumes the cycle transport with the renderer. A still
  image animates while rendering runs, even with audio and jitter disabled.
- Video pause leaves the color effect running while the renderer is running.
- Mode Off bypasses cycling; speed zero holds phase. Returning from Off uses
  the current transport phase.
- Source changes and backend rebuilds preserve transport. Pop Out joins the
  current phase instead of starting at zero.
- Reuse the transition contract's start time for the outgoing and incoming
  states. Palette/range changes can use the existing surface crossfade even
  though they are live-safe outside a transition. Do not interpolate palette
  indices or silently interpolate discrete cycle modes.
- Numeric speed transitions require deterministic integration of the same
  rate curve on both outputs. Implement and test that alongside the existing
  easing contract; do not approximate phase as elapsed time × current speed.

Send bounded definitions/transport changes to native output. Native presentation
evaluates the palette locally; palette animation must not require a new stream
of per-frame color tables or rendered frames over IPC. Mirror paths that already
carry rendered pixels must not apply the cycle a second time. Browser Pop Out
also consumes the same transport via its existing synchronization path.

## DRY Integration Rules

1. Add preset/control fields through `DEFAULT_PARAMS`, control metadata,
   `normalizeParams()`, preset allowlists, and the existing setters. Extract a
   small palette-parameter projection used by `_rendererOptions()`,
   `_applyRendererParams()`, browser Pop Out, and `_nativeOutputParams()`; do not
   expand four hand-maintained copies of the new fields.
2. Share JS palette evaluation across Canvas, snapshots, WebGPU, and WebGL2.
   Extend Rust's existing native rendering helpers for GPU and software paths.
   Use common data/vectors for cross-language parity; avoid a second engine.
3. Consolidate the touched common WebGPU image/video color code into one local
   shader fragment. Share the corresponding WGSL fragment with native code at
   build time if the binding layout permits it; otherwise keep the adapter
   small and cover it with the same vectors. Do not duplicate new cycle math.
4. Build pixel/glyph pairs from one family definition plus two small mode
   overrides, following the existing `PALETTE_PRESETS` construction pattern.
5. Reuse preset selection, search, playlists, source preservation, transitions,
   and built-in/My Presets ownership. Existing JSON remains readable with
   cycling Off. Older engines reject new parameter keys and can normalize
   unknown palette ids to a fallback, so distribute the engine update before
   sharing these presets and state that requirement.
6. Existing audio modulation continues to affect effective params. Initially
   keep cycle speed independent of audio; optional audio response can modulate
   cycle amount using the existing bounded feature path. Add MIDI Learn targets
   via existing control metadata/setters, without changing the hardware map.
   Extend WTF through valid family definitions, not random unsupported ranges.
7. Keep grid/density, source capture, decode, atlas, PNG capture, and fallback
   owners intact. Normal presets do not enable Advanced Density. Hidden stream
   infrastructure gets compatibility checks, not a new transport/codec project.

## Execution Sequence

Each slice depends on the preceding slice's acceptance. This is a proposed
implementation sequence, not a claim that any checks have already passed.

### 1. Contract and Visual Proof

- [ ] Capture representative existing preset outputs on a fixed image/video.
- [ ] Add a synthetic ramp fixture with fixed shadows and two independent ranges.
- [ ] Specify capacity, units, modulo, blend/rounding, glyph luminance, and clock
  behavior with shared vectors; test indices 0 and 255 explicitly.
- [ ] Build one original 32-color family and pixel/glyph proof through the
  shared JS math and one existing accelerated renderer.
- [ ] Review still image, face/camera, landscape, and motion footage with jitter
  and audio off, then with normal audio settings. Select grid/dither/range rates
  from the rendered results before authoring the remaining pack.

Exit: the look has readable forms, restrained highlights, visibly independent
ranges, and stable glyph structure. Record whether ordinary fixed-palette
mapping is sufficient; if it is not, revise scope before adding spatial effects.

### 2. Palette Resources Across Backends

- [ ] Implement bounded palette definitions and a shared layout contract.
- [ ] Separate LUT/dither invalidation from dynamic display-table updates.
- [ ] Extend WebGPU image/video shaders, WebGL2 texture lookup, Canvas and
  software snapshots, native param validation, native GPU, and native software.
- [ ] Keep feature-off behavior and current fallback ownership unchanged.
- [ ] Verify no time-driven LUT rebuild, source upload, pipeline reconstruction,
  or atlas reload; verify 256-color input is not truncated.

Exit: all supported rendering paths evaluate the same test palette at fixed
times, with exact index/range agreement and a documented color tolerance.

### 3. Shared Clock, Presets, and Controls

- [ ] Add transport timing to StaticRuntime, browser Pop Out, native payload,
  native display loops, and both sides of transitions.
- [ ] Implement phase-preserving rate changes, zero/reverse speed, Stop/Start,
  source/backend changes, background/resume, and Pop Out reopen.
- [ ] Register controls and shared parameter projection; extend strict import,
  save/export/round-trip coverage and clean-profile defaults.
- [ ] Verify existing audio, MIDI pickup, playlists, WTF, and PNG capture with
  cycling. Add cycle-specific modulation only through their existing seams.

Exit: preview and native Pop Out agree on cycle phase for a synthetic source
despite different presentation FPS; video does not restart on preset changes.

### 4. Original Preset Pack

Proposed family briefs, to tune after the first proof:

| Family | Palette and motion intent | Pixel / glyph treatment |
| --- | --- | --- |
| Tidal Glass | Cool teal/blue ramps, fixed darks, slow highlight cycling | Crisp coastal color blocks / compact block or Braille marks |
| Ember Grotto | Warm amber/copper ramp with a quiet cool shadow group | Dark pixel texture / dense readable ASCII |
| Fern After Rain | Moss/jade ramps with narrow moving highlights | Fine Bayer texture / existing symbol ramp |
| Violet Dusk | Muted violet/rose/blue ramps with restrained glow | Broad pixel clusters / light-to-dense ASCII |

- [ ] Generate eight preset definitions from four family recipes.
- [ ] Bundle original palette/range data locally and document inspiration.
- [ ] Prefer 160–320 starting columns for pixel treatments, then tune within
  existing density policy. Choose glyph density visually rather than forcing
  identical columns for the paired look.
- [ ] Retain Auto backend. If all eight ship, intentionally update the backend
  baseline from 71/43/28 to **79 total / 51 accelerated / 28 explicit Canvas**,
  with matching visible preset-matrix evidence.

Exit: every new preset is distinct and useful on image, video, and camera;
all existing presets and saved user settings remain usable.

### 5. Desktop Acceptance and Handoff

- [ ] Extend existing renderer-math/Rust tests with frozen-time palette vectors:
  Off, Classic, Blend, reversal, wraparound, zero speed, amount endpoints,
  multiple ranges, invalid definitions, and old-preset behavior.
- [ ] Add rendered assertions for a fixed image with audio/jitter off: moving
  RGB in cycled regions, unchanged fixed regions, stable glyph indices, and
  unchanged base-LUT contents. Keep dither anchored to cells.
- [ ] Extend static/primary-preset smoke coverage with timed captures; nonblank
  screenshots and FPS counters alone do not establish correct cycling.
- [ ] Compare WebGPU, WebGL2, Canvas fallback, native GPU, and native software
  using the same fixture/time. Preserve documented legacy color differences
  for old presets rather than changing them to make a new test pass.
- [ ] Run optimized feature-off/on comparisons at 1080p with normal density,
  audio, transitions, and Pop Out. Record P50/P10 FPS, frame time, allocation/
  memory behavior, source-upload counts, and palette/LUT update counts.
- [ ] Proposed performance gate: investigate more than 10% added frame time
  on a matched workload; no accumulating memory growth or added camera-frame
  queue. Reuse existing performance floors; do not lower resolution to pass.
- [ ] Validate native timing on macOS, Windows, and Linux separately. Account
  for the documented Windows preview bridge and Linux exclusive-camera behavior;
  compare exact colors on synthetic/static inputs, not independently timed cameras.
- [ ] Check keyboard labels, disabled controls, minimum-window layout, source
  switching, Pop Out close/reopen, screenshot capture, and offline operation.
- [ ] Update Rendering Engine, User Guide, Testing, Performance, palette counts,
  backend baseline/evidence, and Changelog once implementation is verified.

Use the existing commands as applicable:

```bash
npm run test:render-math
npm run test:preset-backend-contract
npm run test:preset-playlists
npm run test:renderer-fallback
npm run test:audio-reactive
npm run test:midi
npm run test:rust
npm run smoke:static
npm run check:media
npm run smoke:primary-presets
npm run smoke:native-output
npm run smoke:ui-perf
npm run bench:density
npm run check:desktop
```

Select check sets from [Testing](../TESTING.md); avoid repeating checks already
covered by an unchanged broader gate. Installed desktop and physical-device
results remain separate from browser tests and CI packages. Publication and
installation follow the existing [release workflow](../RELEASING.md) when the
implementation is ready for release.

## Deferred Extensions

- Day/night palette morphing between authored tables with identical index/range
  topology; reuse the display-palette evaluator and transport.
- Per-palette ramp-aware dithering if the existing Bayer mapping misses the
  visual target; keep this a shared mapping feature.
- Temporal stabilization only if camera tests show objectionable index chatter;
  measure latency and ghosting before adding history buffers.
- Spatial masks or procedural index fields for designed directional flow.
- Authored indexed-image sources, indexed PNG/IFF metadata, and licensed scene
  packs only if scene playback becomes an explicit goal.

No additional scope answers are needed to begin the first proof. The remaining
decision is visual acceptance of that proof, before expanding the full pack.
