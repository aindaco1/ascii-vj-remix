# 1.0.0 Release Readiness and Acceptance

This document records the 1.0.0 release-readiness decision. It separates local
verification, CI artifacts, virtual-machine acceptance, physical hardware
acceptance, and public release state so later publication evidence cannot be
confused with pre-release testing.

## Candidate scope

- Classic Camera ASCII is the clean-profile visual default.
- The clean-profile backend remains Auto; built-ins without an explicit
  compatibility backend resolve to WebGPU/WebGL2 when available.
- The packaged macOS glyph path uses a compact active-ramp WebGPU texture;
  Paper Shredder explicitly retains Canvas2D to preserve its established look.
- Windows no longer preemptively routes glyph presets to Canvas2D. The same
  69 total / 41 accelerated / 28 explicit Canvas ownership contract applies to
  every packaged desktop host.
- Point & Click Default is displayed as Dense Color ASCII while retaining its
  stable preset id.
- Built-in and My Presets are separate, independently alphabetized, and
  searchable live by display name.
- Sidebar controls use one shared select geometry; internal parameter keys and
  the one-option Atlas Style selector are absent from the visible UI.
- Advanced Density is labeled experimental with its 900-column limit and lack
  of a 30 FPS guarantee.
- Release-mode Windows binaries use the graphical subsystem and FFmpeg child
  processes do not create visible consoles.
- Linux CI is pinned to Ubuntu 24.04; the virtual acceptance matrix exercises
  Ubuntu 26.04.1 and Fedora 44 while retaining AppImage, deb, and rpm coverage.
- Linux opens at a platform-owned 1000x680 size, the bundled demo selects
  VP8/WebM on Linux while macOS and Windows retain H.264/MP4, bundled and
  selected videos can fall back to bundled FFmpeg, and WebGL2 is accepted when
  a Hyper-V guest does not expose WebGPU.
- Legacy absent/disconnected microphone reports are pruned, while the input
  control preserves its nonfatal unavailable-device status.
- Native Pop Out selects a browser-parity unorm surface format when available
  so the shared renderer color math is not converted through sRGB twice.
- Experimental MIDI remains explicitly labeled and its physical validation
  claims remain limited to the documented macOS UC-33e/mioXC path.

## Current evidence

| Layer | State | Evidence |
| --- | --- | --- |
| Source metadata | Pass | Package, npm lock, Cargo package/lock, and Tauri config agree on 1.0.0. |
| Static UI/renderer | Pass | Clean-profile Auto ownership, accelerated built-in resolution, all 69 built-ins, live search, alphabetical sections, overflow focus, and minimum-window select geometry pass `npm run smoke:static`. |
| Desktop gate | Pass | `npm run check:desktop` passes, including 60 Rust tests and the native debug build. |
| Release runtime gate | Pass | Pinned FFmpeg 8.1.2 Apple Silicon resources are staged and `npm run check:release` passes. |
| Installed macOS app | Pass | `~/Applications/ASCII VJ Remix Dev.app`, version 1.0.0, development bundle id, stable signature, verified FFmpeg resources, and advancing bundled Demo Video. |
| Installed Apple WebKit presets | Pass | `npm run smoke:primary-presets`: 69/69 visible, 41/41 GPU-eligible presets on WebGPU, 28 explicit Canvas2D compatibility presets, zero failures. |
| Native Pop Out | Pass | Current optimized structural packaged smoke with Demo Video reports 60.1 FPS average native presentation, eight synchronized transitions, zero transition failures, zero GPU failures, and a visible WebGPU primary surface. Deterministic unorm selection is covered separately; the release owner accepted the Ubuntu/Fedora color-parity path for publication. |
| Windows CI installer | Pass | [Desktop run 33355966122](https://github.com/aindaco1/ascii-vj-remix/actions/runs/33355966122) built the pinned FFmpeg resources and unsigned development EXE/MSI, passed the GUI-subsystem check, and enforced the shared preset-backend matrix. |
| Windows physical QA | Accepted | The release owner approved publication after testing on Windows 11 Pro with the NVIDIA RTX 2070-class machine and reviewing the final WebGPU ownership, Demo Video, Pop Out, and console-window fixes. |
| Linux CI packages | Pass | [Desktop run 33355966122](https://github.com/aindaco1/ascii-vj-remix/actions/runs/33355966122) built the pinned FFmpeg resources and development AppImage/deb/rpm artifact on Ubuntu 24.04. |
| Linux VM QA | Accepted with WebGL2 fallback | The release owner approved publication after the Ubuntu 26.04.1 and Fedora 44 Hyper-V pass. WebGPU was unavailable in both guests; visible, responsive WebGL2 is the accepted virtual-GPU fallback. The final package contains the native demo fallback, unavailable-microphone report pruning, and deterministic Pop Out surface selection. This does not claim physical Linux camera, microphone, or GPU coverage. |
| Public release | Approved | The release owner authorized merge and publication on 2026-08-30. The tag, public assets, updater manifest, and post-publication install/updater smoke remain deployment evidence rather than pre-release evidence. |

## Retained physical Windows regression checklist

Use only the exact `ascii-vj-remix-windows-test-<commit>` artifact retained by
the draft PR. Record the Windows build, GPU/driver, artifact commit, and
resolved renderer.

1. Install the development EXE, launch from Start, and confirm no terminal or
   command window appears at launch or during Demo Video/custom video use.
2. Confirm the app name is ASCII VJ Remix Dev and that it does not replace the
   production identity or offer production updater installation.
3. Verify preset search, alphabetical sections, Classic Camera ASCII, Dense
   Color ASCII, and aligned sidebar selects at 1024x720 and 1440x920.
4. Exercise Demo Image, Demo Video, one custom MP4, camera permission/input,
   microphone input, Stats Overlay, Reports, WTF, and Pop Out.
5. Run the primary preset sweep and confirm 69/69 visible, 41/41 accelerated
   presets resolved to WebGPU, 28 explicit Canvas presets, and zero failures.
   Spot-check Classic Camera ASCII, Signal Court, Midnight Scan CJK, Forest
   Kiln Hangul, Neon Sledgehammer, and Paper Shredder in Stats Overlay.
6. Uninstall and confirm the production app, if present, remains unchanged.

## Publication authorization

The release owner authorized merging the version bump to `main` and publishing
`v1.0.0` after the Windows and Linux acceptance rows above were recorded. The
exact tagged main commit must still pass the required `Desktop` main-push run;
the release workflow must then validate public assets, updater metadata,
notarization, Gatekeeper, installation, and the previous-version updater hop.
Windows packages remain explicitly unsigned previews for 1.0 unless a
separately approved Authenticode rollout completes.
