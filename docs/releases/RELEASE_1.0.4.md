# 1.0.4 — Color Cycling and Renderer Performance

Stage: implementation and validation in progress, September 15, 2026.
Public release and hardware acceptance are not implied by this record.

## Scope

The [approved design](COLOR_CYCLING_1.0.4_PLAN.md) preserves the initial research
and plan. The implementation extends existing palette, renderer, control,
preset, transition and native-output seams. See the [Changelog](../../CHANGELOG.md)
for the complete release scope, including changes since 1.0.3 and shared-relay work.

- Four original 32-color families, eight pixel/glyph presets; 79/51/28 ownership.
- Stable base mapping and glyph luminance, independent animated display colors.
- Shared transport, zero/reverse speed, pause/resume and speed-transition integral.
- Startup/device/pipeline/lookup reuse with bounded resource ownership.
- Readback-authorized recovery for static-image upload SecurityError (#35).
- Xcode 27 CI from reviewed PR #36; stable release lane retained.

## Evidence

| Gate | Evidence / state |
| --- | --- |
| Shared JS vectors | Passed: classic/blend, reverse/wrap, amount, stable glyph luminance, index 255, validation and speed integral. |
| Rust | 77 tests passed, including the final startup-diagnostics build. |
| Browser rendering | 79 presets passed in Chromium and the installed macOS 27 app (51 WebGPU / 28 Canvas); all eight new looks animate a still image in Chromium. Actual WebGL palette swatches passed for base palettes and frozen cycle times. Native-preview geometry/orientation checks passed. |
| Resource safety | JS coalesced compilation, retry after failure/device loss, bounded palette eviction, readable-image retry and tainted-image rejection passed. |
| macOS host/toolchain | macOS 27.0 (26A428), Xcode 27.0 (27A266a), Apple Silicon. Optimized dev app launches and presents native output. |
| Performance | Visible 480-column WebGPU run passed at 40.6 / 39.3 / 34.6 FPS (main / Pop Out / transition); native presentation 60 FPS, zero GPU failures. See the measurement record below. |
| Full local desktop/media gates | Passed `check:desktop`, `check:media`, final 77 Rust tests and Windows lifecycle/geometry tests. Final Chromium smoke passed including preset import/export and MIDI controls. |
| Exact release-candidate CI | Pending on release branch. |
| Public signed artifacts/updater | Pending. |
| Windows/Linux physical camera/display | Not exercised on this Mac. Existing release ownership contract remains; new CI cannot substitute for device acceptance. |
| Final Mac dev handoff | Pending final optimized build and visual check. |

## Windows/Linux Regression Boundary

Windows continues to use one Media Foundation camera owner, latest-frame
callbacks, and a binary JPEG main-preview bridge capped at 640×360/30 FPS.
Linux retains exclusive V4L2 capture, coordinated preview release/reacquisition,
and the bounded mirror fallback. No camera/session lifecycle implementation was
replaced. Native surface creation stays on the platform's required thread;
shader/device warming is off the Windows/Linux UI thread. Cached objects contain
no window, camera, surface, source texture, upload or frame buffer.

Validate cold/warm open, first visible frame, repeated close/reopen, camera →
video → camera, disconnect/reconnect, fullscreen/display changes and controls
while output is active using [Testing](../TESTING.md#hardware-and-platform-checks).

## Open Issues and PRs

- #35: add authorized-readback recovery and cleanup tests. The report omits the
  original image, so matching the reporter's precise input remains unconfirmed.
- #30: this host provides actual macOS 27/Xcode 27 build/runtime evidence. PR #36
  adds recurring compiler/SDK coverage; signed-artifact/updater and final UI
  acceptance remain separate below.
- #36: reviewed, all four CI lanes passed, merged as `6edc0d6`; included in this release.

## Local performance measurements

See [recorded runs](../performance/1.0.4-visible-macos27.json). The pre-optimization
reference already included color cycling; it is not the published 1.0.3 binary.
Visible before/after main, Pop Out and transition averages were 41.3/39.0/36.5
and 40.6/39.3/34.6 FPS. These are comparable steady-state results, not an FPS
speedup claim. Native output held 60 FPS without GPU failures.

The main gains remove repeated work: a repeated Tidal Glass lookup reuses the
32-cube table instead of rebuilding it (19.7 ms median rebuild in the local Node
component benchmark). Native opening reused the warmed adapter/device/pipelines:
first command 122 ms, repeat close/reopen 12 ms; surface/presenter setup rounded
to 0 ms and first presentation followed 4 ms / 1 ms after GPU readiness. These
intervals have different start points and are not a physical Windows measurement.

Two background/occluded performance runs failed and are retained in the record.
The harness now reports document visibility/focus and waits for actual measured
completion. An optional forced-WebGPU Chromium run had no GPU backend available;
the standard Chromium run passed. During that experiment one native launch
fell back to WebGL2 after 20.7 seconds and its initial image needed Reload;
this transient GPU-startup case is not counted as successful startup acceptance.
Subsequent clean launch checks are recorded separately below.

A clean Launch Services launch (`desktop:run-local`) automatically rendered the
Demo Image using WebGPU; renderer setup took 205 ms. Tidal Glass pixel and glyph
looks were reviewed in the native app on both Demo Image and Demo Video, with
the video advancing through a glyph-to-pixel transition while Pop Out was open.
Native video remained at 60 FPS without GPU failures. The stronger native smoke
passed: first GPU presentation 189 ms after open, repeat presentation 82 ms after
close/reopen, with 59.8 FPS during live parameter/cycling updates and no failures.
This smoke is now part of Windows PR CI; its Windows result is pending.
