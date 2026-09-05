# 1.0.3 Release Readiness and Acceptance

This document tracks the 1.0.3 camera Pop Out corrective release and keeps
source, CI, packaged-artifact, installed-app, and physical-platform evidence
separate.

## Release Scope

- Add native single-camera capture through Media Foundation on Windows and
  V4L2 through the bundled local FFmpeg runtime on Linux.
- Feed both platform captures into the existing native `wgpu` presenter,
  bypassing WebView canvas readback and per-frame Tauri IPC in the normal path.
- Preserve the existing macOS AVFoundation/display-link implementation.
- Retain bounded mirror fallback for native-open failures and multiple cameras,
  with measurable accepted-FPS, readback, send, and throughput diagnostics.
- Keep the Windows main preview live by feeding the existing WebGPU renderer
  from the single native camera owner's
  bounded binary JPEG preview bridge.
- Add ASCII World Mint and ASCII City Nightshift as visual presets for the
  current source, using the existing glyph, palette, and renderer paths.

## Acceptance Contract

1. Source metadata agrees on version 1.0.3 and the candidate branch is
   `release/1.0.3`.
2. The exact candidate commit passes macOS, Windows, and Linux Desktop jobs.
3. Windows PR packaging produces an updater-disabled `ASCII VJ Remix Dev`
   EXE/MSI; Linux packaging produces updater-disabled AppImage, deb, and rpm
   artifacts from the same commit.
4. The staged Windows FFmpeg runtime exposes DirectShow and the staged Linux
   runtime exposes V4L2 before packaging succeeds.
5. Existing macOS renderer, native-output, static smoke, and Rust suites pass;
   the macOS-gated AVFoundation implementation block remains unchanged.
6. The Tauri policy gate confirms the main window can invoke the native preview
   frame reader and that every frontend Tauri command has a generated narrow
   permission before packaging.
7. The owner accepted the Windows development candidate and explicitly
   authorized Linux publication with Ubuntu/Fedora physical camera testing
   deferred. Source, package, signing, and updater gates remain required.

## Release Decision — 2026-09-04

- The owner reported that the Windows development build works well and
  authorized merging and publishing 1.0.3, including both new presets.
- Thorough Ubuntu/Fedora camera testing is not complete. The owner explicitly
  approved publishing those packages with hardware validation deferred; do not
  present automated Linux checks as physical camera acceptance.
- Application source is pinned to `v1.0.3` at
  `04e8107d993d1ca62639a8c8ddf0e7ffea491dc7`. The exact merged commit passed
  [Desktop CI](https://github.com/aindaco1/ascii-vj-remix/actions/runs/33943626231)
  on macOS, Windows, and Linux.
- A release-only packaging correction restores Unix FFmpeg executable modes
  after artifact transfer. It does not change the tagged application source.

## Physical Camera Matrix

For each row, select exactly one camera, open Pop Out, change several presets,
change FPS, leave the output running for at least two minutes, close it, and
confirm camera preview recovery. Windows should keep both views live with
`exclusiveCameraActive` using the native preview bridge. Linux may pause while
native output owns the camera. Capture one manual diagnostic while Pop Out is
open.

The latest Windows follow-up must additionally verify Acid Snowstorm's tiny-cell
appearance against the main view, Arcade Rain without an uncovered right edge,
and repeated Camera → Demo Image → Demo Video → Camera switches with Pop Out
left open. Compare cold and repeat Pop Out opens separately; command timing in
manual reports is not first-visible-frame timing. The owner's Windows
acceptance and explicit Linux deferral are recorded above; the remaining Linux
device observations below are still follow-up work.

| Platform | Candidate artifact | Required observation |
| --- | --- | --- |
| Windows 10/11 x64 | Dev EXE or MSI | Live output is materially smoother than 1.0.2; `cameraFallbackActive` is false; both views advance through the `binary-jpeg` exclusive preview bridge; close restores normal browser capture; no blank output or crash report. |
| Ubuntu x86_64 | Dev AppImage or deb | Native V4L2 output remains live; main preview restores after close; `cameraFallbackActive` is false. |
| Fedora x86_64 | Dev rpm or AppImage | Native V4L2 output remains live; main preview restores after close; `cameraFallbackActive` is false. |
| macOS Apple Silicon | Local candidate smoke | Existing AVFoundation Pop Out behavior remains unchanged. |

If native device opening fails, the output must automatically use the bounded
mirror path, the main preview must be live, and the manual report must contain
the native-open failure reason plus mirror accepted FPS and timing metrics. A
successful fallback is useful diagnostic evidence but does not satisfy
native-path acceptance for that row.
