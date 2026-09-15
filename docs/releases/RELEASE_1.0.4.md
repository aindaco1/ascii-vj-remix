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
| Rust | 77 tests passed after cycling and native resource-cache changes; full final gate pending. |
| Browser rendering | 79 presets passed; all eight new looks animate a still image. Actual WebGL palette swatches passed for base palettes and frozen cycle times. Native-preview geometry/orientation checks passed. |
| Resource safety | JS coalesced compilation, retry after failure/device loss, bounded palette eviction, readable-image retry and tainted-image rejection passed. |
| macOS host/toolchain | macOS 27.0 (26A428), Xcode 27.0 (27A266a), Apple Silicon. Optimized dev app launches and presents native output. |
| Performance | Initial runs lacked complete UI reports; no before/after claim is accepted from those runs. The harness now waits for a real completion result. Final matched measurements pending. |
| Full local desktop/media gates | In progress. |
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
- #36: reviewed and included in the release branch; macOS lanes passed when
  inspected. Windows/Linux checks and merge state must be refreshed before release.
