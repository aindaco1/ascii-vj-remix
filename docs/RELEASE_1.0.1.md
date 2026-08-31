# 1.0.1 Release Readiness and Acceptance

This document tracks the 1.0.1 corrective release. It separates implemented
contracts and local QA from packaged, installed, and physical-platform
acceptance.

## Release Scope

- Repair Camera Pop Out on Windows by selecting the cross-platform mirror
  backend rather than the macOS-only native camera worker.
- Make native-output worker failures reviewable through the existing bounded
  Reports pipeline and allow an explicit manual diagnostic snapshot from an
  empty queue.
- Save a PNG of the primary renderer surface directly to Desktop, excluding the
  HTML Stats Overlay and avoiding a save dialog.
- Add multiple named, saved preset playlists with accessible reordering, one
  shared hold interval, and random or in-order looping through the canonical
  preset transition path.

## Current Evidence

| Gate | Status | Evidence / boundary |
| --- | --- | --- |
| Source metadata | Pass | npm package/lock, Cargo package/lock, and Tauri config agree on 1.0.1. |
| JavaScript and production bundle | Pass | App/adaptor/modules parse and the Vite production bundle builds. |
| Playlist contract | Pass | Bounded schema, stable ids, reorder, sequential wrap, random non-repeat, active-preset avoidance, preview-revealing modal dismissal, truthful transition status, rendered save/reload, and loop start/stop checks. |
| Native-output policy | Pass | Platform capability simulation selects `native-camera` only on macOS and `mirror` for Windows/Linux camera output. |
| Rust unit suite | Pass | PNG validation and existing media/output/report suites pass locally. |
| Static rendered smoke | Pass | Screenshot control/accessibility, playlist workflow, renderer/source matrix, layout, and output mirror checks pass in Chromium. |
| Local macOS development app | Partial | The locally identity-signed `ASCII VJ Remix Dev` 1.0.1 bundle was rebuilt and installed. Screenshot was user-accepted; playlist playback returned to the preview and visibly completed a 4.6-second transition. Manual report and existing Pop Out regression sweeps remain pending. |
| Physical Windows camera | Pending | Real camera main/Pop Out visible-motion test on the 1.0.1 installer; policy simulation is not device acceptance. |
| Windows screenshot/report | Pending | Confirm Desktop write, no dialog, Stats Overlay exclusion, empty-queue manual capture, local debug behavior, and release submission. |
| Linux camera/packages | Pending | Confirm mirror camera Pop Out and AppImage/deb/rpm launch on maintained targets. |
| CI and public artifacts | Pending | Commit/push, desktop/release workflows, installers, updater metadata, publication, and updater hop are separate gates. |

## Physical Windows Checklist

1. Install the exact 1.0.1 release-profile development or release artifact and
   record its filename/hash and installed version.
2. Select Camera, grant access, and confirm the primary frame advances.
3. Open Pop Out and confirm it shows the same advancing camera look; change a
   preset and verify both surfaces transition. Close and reopen Pop Out.
4. Enable Stats Overlay, take a screenshot, and verify a uniquely named PNG is
   written to Desktop without a dialog and without the Stats Overlay pixels.
5. From an empty Reports queue, add a short note and capture current state.
   Review the bounded report, confirm it contains no media/frame/screenshot,
   file path, URL, or arbitrary log content, and exercise the appropriate local
   or production Send boundary.
6. Create two named playlists, add/reorder presets, save and reopen each list,
   activate one of their presets, then run in-order and random loops. Confirm
   Play/Restart closes the editor before the next preset begins transitioning,
   another item is selected when available, reopening the editor reports the
   completed item, and Stop plus manual preset selection end playback cleanly.

Repeat step 6 in the packaged Linux app as well as Windows. The shared browser
contract is platform-neutral, but physical WebView2 and WebKitGTK interaction
remain separate acceptance gates.

Do not call 1.0.1 physically accepted until the applicable pending rows are
recorded against exact packaged artifacts.
