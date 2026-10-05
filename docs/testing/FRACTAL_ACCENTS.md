# Fractal Accents implementation check — 2026-10-04

Local implementation on an Apple M1 Max running macOS 27.0.1, not a release.
The scope includes six restrained presets, stronger visible accents on every
preset and optional scene, persistent accent controls and WTF integration, with
Subtle Limit enabled globally. Inspiration:
[Fractal Explorer](https://techmatt.github.io/fractals/explorer/). The implementation
uses original bounded Julia orbit measurements, without importing explorer code.

Behavior and architecture are maintained in the [User Guide](../USER_GUIDE.md#fractal-accents)
and [Rendering Engine](../RENDERING_ENGINE.md#fractal-accents). Reproduction commands
are in [Testing](../TESTING.md#fractal-accent-regression-checks).

## Local evidence

- `npm test -- --offline`: desktop checks passed, including the offline bundle,
  policy/resource checks, Rust tests and debug desktop build. Its final browser
  preset sweep hit a glyph-loading timeout while other renderer checks ran;
  the standalone `smoke:static` rerun passed all 96 presets and its remaining
  palette/source/output checks with no errors. Its palette-only fixture now
  explicitly disables accents, matching the new persistent-accent behavior.
- JS scene/accent tests: exact bypass; visible preset/variation differences;
  glyph, color and luminance bounds; fixed-color/monochrome response; every scene;
  retained sample controls and preset settings; bounded audio; cached fields;
  freeze, trail decay and automatic short trails; deterministic WTF/Off selection.
- Rust: 86 tests passed, including browser/native uniform vectors, discrete
  variation, bounded audio and complete native shader validation.
- Real WebGPU/WebGL2: 152 checks passed (148 CPU/reference comparisons), including
  all six accents and maximum-strength settings
  compared with the Canvas reference; all ten scenes with five accent styles;
  direct WebGPU/WebGL2 color and glyph comparisons; original moving-source response,
  video continuity, manual/MIDI edits and history regression checks retained.
  All six accents, plus five scene combinations, also render through the actual
  Canvas fallback within its existing density limits. [Renderer check report](evidence/fractal-accents-renderer-checks.json).
- Installed Apple WebKit: all 96 presets visible, 68/68 eligible presets on
  WebGPU, 28 explicit Canvas, zero failures, with Flat Media retained for all
  96 presets in the optimized development app.
  [Installed preset report](evidence/fractal-accents-macos-presets.json).
- Optimized macOS development app, Julia Glass at 640 columns and full coverage,
  synthetic audio, bundled 24 FPS video: Amount 0.5, primary average 38.2 FPS, minimum
  33.7 FPS, worst phase p95 29.59 ms; native Pop Out average 60.1 FPS, zero
  GPU failures and 16 successful live transitions. One display was available.
  [Structured performance evidence](evidence/fractal-accents-macos-performance.json).
- Native Mandelbox with Julia Glass at 240 columns, full coverage and Amount 0.5:
  primary average 38.4 FPS, minimum 35.7 FPS, p95 28.00 ms; native Pop Out average
  60.0 FPS, seven successful transitions, zero failures.
  [Scene performance evidence](evidence/fractal-accent-scene-macos-performance.json).
- Paired [accent-off/on review](evidence/fractal-accents.png) uses actual WebGL2
  presentation of the bundled demo. The last pair includes moving-source history.
  The [combination review](evidence/fractal-accent-combinations.png) covers fixed-color
  ASCII World Mint, monochrome cells, Media Corridor and Mandelbox.

The presets keep the same subject readable. Threadlight, Silver Etching and
Phosphor Lace retain glyph texture; the other three use solid cells. The
revised defaults expose engraving, bands and color currents more clearly while
retaining the selected source.

The new spatial-glass parity fixture exposes float-sensitive Mandelbox hit/normal
boundaries in the double-precision software reference. The unaccented comparison
already differs on about 1.72% of RGB channels by more than 8/255; warped rays
reach about 2.13%. Existing case limits remain unchanged. New spatial-glass cases
permit 2.5% while retaining the 2/255 mean bound and adding direct WebGPU/WebGL2
limits across RGB and glyph addresses (0.5/255 mean, 1% above 8/255). See the
renderer report for actual measurements: worst CPU mean was 1.357/255, worst
GPU/GPU mean 0.145/255, and the largest GPU/GPU fraction above 8/255 was 0.352%.
No scene detail or resolution was reduced.

## WTF visibility follow-up (October 4)

WTF now selects Flat Media with 95% probability, with the other 5% distributed
uniformly among ten scenes. Scene and accent choices remain independent of
candidate retries and the validated fallback.

The old guard checked solid cell colors rather than displayed glyph coverage,
accepted null/failed previews, and did not check its fallback. The new guard
uses the existing software cell pipeline on a bounded source sample and dim
reference, including glyph atlas ink, fixed foreground color, accents and audio
limits. Actual black source frames are allowed. A failed readback or exhausted
set of unsafe candidates holds the previous look. A shared JSON tone envelope
protects shadows during frontend and native audio/transition updates only while
WTF is active. Bright Output and Subtle Limit remain user preferences.

Validation:

- `check:desktop` passed, including 87 Rust tests, shared WGSL validation, offline
  bundle checks, JS contracts and the development app build.
- `smoke:static` passed across the 96-preset matrix with no JavaScript or GPU errors.
- `smoke:spatial` passed: 152 renderer cases, 216 live-control checks and 44
  deterministic WTF scene retry/fallback checks.
- `smoke:wtf` passed: 46 accepted targets and 138 final-image readbacks across
  WebGPU, WebGL2 and Canvas, including all ten scenes. The source was dimmed to
  30% and synthetic audio exercised every audio preset. Minimum mean displayed
  luminance was 13.05/255; the test also rejects blank/fixed-black glyphs and
  verifies readback failure, rejected fallback, natural black source and Stop
  during a pending candidate. Target generation averaged 28.7 ms (132 ms max).
  [Renderer evidence](evidence/wtf-visibility-checks.json).
- The installed optimized macOS Dev app passed a 45-second WTF/audio transition
  run: preview averages 40.0 FPS steady and 26.3 FPS under aggressive 0.55-second
  random rebuilds; native Pop Out averaged 60.0 FPS, with 22 transitions and no
  frontend, GPU, native-sync or transition failures. The reset of per-renderer
  counters during rapid rebuilds appears as zero minimum-FPS samples in the
  report; the phase averages use measured frame progress.
  [macOS evidence](evidence/wtf-macos-performance.json).
- The earlier locked-screen run was excluded: macOS throttled the hidden
  webview and could not create its native display link. The unlocked rerun above
  and an actual on-screen WTF image confirmed visible, source-led output.

## Remaining acceptance boundaries

Windows/Linux builds and physical-device checks were not run for these local
changes. Shared shader validation, platform-independent JS/Rust tests and
Canvas fallback checks do not replace those checks. Existing Desktop CI runs
the new unit checks through `check:desktop`, plus static preset and native-output
smokes on supported platform lanes when this change is submitted.

Before the stronger cross-preset revision, default `npm test` completed its
desktop/static checks, then the hosted Jev
preflight stopped before any network attempt (authentication or evidence-storage
precondition). It did not evaluate a case. This advisory check is separate from
renderer correctness; no user media was submitted. No release, tag, push or
public installer was produced.
