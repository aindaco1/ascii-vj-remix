# 1.0.0 Release Candidate QA

This document tracks the pre-publication 1.0.0 candidate. It separates local
verification, CI artifacts, virtual-machine acceptance, physical hardware
acceptance, and public release state.

## Candidate scope

- Classic Camera ASCII is the clean-profile visual default.
- The clean-profile backend remains Auto; built-ins without an explicit
  compatibility backend resolve to WebGPU/WebGL2 when available.
- The packaged macOS glyph path uses a compact active-ramp WebGPU texture;
  Paper Shredder explicitly retains Canvas2D to preserve its established look.
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
  VP8/WebM on Linux while macOS and Windows retain H.264/MP4, selected videos
  can fall back to bundled FFmpeg, and WebGL2 is accepted when a Hyper-V guest
  does not expose WebGPU.
- Experimental MIDI remains explicitly labeled and its physical validation
  claims remain limited to the documented macOS UC-33e/mioXC path.

## Current evidence

| Layer | State | Evidence |
| --- | --- | --- |
| Source metadata | Pass | Package, npm lock, Cargo package/lock, and Tauri config agree on 1.0.0. |
| Static UI/renderer | Pass | Clean-profile Auto ownership, accelerated built-in resolution, all 69 built-ins, live search, alphabetical sections, overflow focus, and minimum-window select geometry pass `npm run smoke:static`. |
| Desktop gate | Pass | `npm run check:desktop` passes, including 53 Rust tests and the native debug build. |
| Release runtime gate | Pass | Pinned FFmpeg 8.1.2 Apple Silicon resources are staged and `npm run check:release` passes. |
| Installed macOS app | Pass | `~/Applications/ASCII VJ Remix Dev.app`, version 1.0.0, development bundle id, stable signature, verified FFmpeg resources. |
| Installed Apple WebKit presets | Pass | `npm run smoke:primary-presets`: 69/69 visible, 41/41 GPU-eligible presets on WebGPU, 28 explicit Canvas2D compatibility presets, zero failures. |
| Native Pop Out | Pass | 30-second structural packaged smoke reports 60.0 FPS average native presentation, 16 synchronized transitions, zero transition failures, zero GPU failures, and a visible WebGPU primary surface. |
| Windows CI installer | Pass | [Desktop run 33306914277](https://github.com/aindaco1/ascii-vj-remix/actions/runs/33306914277) built the pinned FFmpeg resources and unsigned development EXE/MSI and passed the GUI-subsystem check. |
| Windows physical QA | Pass | User-verified development artifact on the Windows 11 Pro / RTX 2070 machine. |
| Linux CI packages | Pass | [Desktop run 33330609894](https://github.com/aindaco1/ascii-vj-remix/actions/runs/33330609894) built the pinned FFmpeg resources and development AppImage/deb/rpm artifact on Ubuntu 24.04. |
| Linux VM QA | Retest required | Ubuntu 26.04.1 and Fedora 44 both rendered cleanly through WebGL2 but rejected WebGPU and the H.264 demo; Ubuntu also exposed an unusable virtual microphone. The scoped fixes require a refreshed package pass. |
| Public release | Not started | No tag, GitHub Release, public updater manifest, or deployment is authorized by this candidate pass. |

## Physical Windows checklist

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
5. Confirm the packaged Windows glyph presets remain visible through the
   bounded Canvas2D compatibility path and solid/pixel presets can remain GPU
   accelerated.
6. Uninstall and confirm the production app, if present, remains unchanged.

## Publication hold

Do not merge the version bump to `main`, create `v1.0.0`, dispatch the release
workflow, or publish updater metadata until the Windows and Linux acceptance
rows above are recorded. The Windows packages remain explicitly unsigned
previews for 1.0 unless a separately approved Authenticode rollout completes.
