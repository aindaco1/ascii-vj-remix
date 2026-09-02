# ASCII VJ Remix

ASCII VJ Remix is a local-first native desktop renderer lab for turning
images, videos, cameras, and audio-reactive signals into high-performance ASCII
and cell-based visuals.

The app is built for VJ-style experimentation: pick a source, choose a preset,
push the renderer hard, pop the output onto another display, and keep tuning
the look live while the media keeps running.

The current source/package release candidate is 1.0.3. Release history is
recorded in the [Changelog](CHANGELOG.md); prospective work belongs in the
[Roadmap](docs/ROADMAP.md).

## Quick Links

- [Changelog](CHANGELOG.md)
- [Roadmap](docs/ROADMAP.md)
- [Rendering engine guide](docs/RENDERING_ENGINE.md)
- [Contributor guide](docs/CONTRIBUTORS.md)
- [LLM agent guide](docs/AGENTS.md)
- [Security guide](docs/SECURITY.md)
- [Performance guide](docs/PERFORMANCE.md)
- [Testing guide](docs/TESTING.md)
- [1.0.0 release readiness and acceptance](docs/RELEASE_1.0.0_RC.md)
- [1.0.1 release readiness and acceptance](docs/RELEASE_1.0.1.md)
- [1.0.3 release readiness and acceptance](docs/RELEASE_1.0.3.md)
- [Accessibility guide](docs/ACCESSIBILITY.md)
- [Internationalization guide](docs/I18N.md)
- [UC-33e and mioXC MIDI guide](docs/MIDI_UC33E.md)
- [Release and updater notes](docs/CONTRIBUTORS.md#release-and-updater-work)
- Contact: [alonso@dustwave.xyz](mailto:alonso@dustwave.xyz)
- Support the project: [shop.dustwave.xyz](https://shop.dustwave.xyz) or [pool.dustwave.xyz](https://pool.dustwave.xyz)

## What This Project Is

ASCII VJ Remix combines several renderer and desktop-tooling ideas:

- It started from [ASCILINE](https://github.com/YusufB5/ASCILINE), which
  provides a high-performance ASCII video streaming pipeline, Python/FastAPI
  server code, OpenCV frame preparation, adaptive WebSocket frame encoding,
  terminal playback experiments, and Canvas rendering fallbacks.
- It includes high-quality WebGPU/WebGL rendering alongside Canvas compatibility
  paths.
- It keeps the local-first spirit of a standalone creative tool. The Tauri app
  packages the renderer, demo media, fonts, native output path, and local media
  adapters so day-to-day use does not require online services.
- It uses an extreme black, white, grey, neon pink, and neon blue VJ control
  surface with compact VCR-style typography and sharp rectangular controls.

The result is a live renderer workbench for stylized ASCII/cell video output.

## Current Capabilities

### Sources

- Built-in Demo Image, used as the default startup source.
- Built-in H.264/MP4 Demo Video on macOS and Windows, with a matching VP8/WebM
  asset selected on clean Linux installations.
- User-selected local image and video files.
- MKV selection support in the desktop file picker. If the platform webview
  cannot decode the built-in demo or a selected video, the desktop app retries
  it through the bundled FFmpeg path.
- Local webcam/camera input.
- Multiple simultaneous cameras when the operating system and desktop runtime
  allow it.
- Camera mixer layouts: grid, split row, stack, and picture-in-picture.
- Camera controls appear directly under the Source panel while Camera is active.
- Static media and camera frames stay local. They are not uploaded to a server.

### Rendering

- WebGPU renderer is the primary quality target on capable desktop runtimes.
- WebGL2 renderer is the main embedded GPU fallback.
- Canvas2D and pixel Canvas paths remain compatibility fallbacks.
- Packaged desktop views attempt WebGPU for every acceleration-eligible preset,
  then WebGL2 and Canvas2D as bounded fallbacks. Presets with an explicit
  compatibility backend retain Canvas2D on every platform.
- Native Tauri output window uses a `wgpu` presenter where available:
  - Metal on macOS.
  - D3D12 on Windows.
  - Vulkan/GLES on Linux.
- Native Pop Out preserves glyph-mode and character-set params for traditional
  ASCII presets instead of flattening them into solid cells.
- Sixteen project-native palettes, nearest-color/luminance mapping, and ordered
  Bayer 2x2/4x4/8x8 dithering share one parameter and lookup-table contract
  across browser, Canvas, and native output paths.
- Glyph controls cover depth, offset, reverse, source/fixed color, background,
  Braille, common drawing/symbol blocks, Latin Extended, Greek, Cyrillic, CJK
  marks, Hiragana, Katakana, CJK Unified U+4E00-U+9FFF, Hangul, and custom typed
  ramps of up to 96 supported Unicode scalars.
- The neutral Unicode atlas is generated and verified offline, bundled locally,
  and loaded in bounded 1024px pages only as selected glyphs need them.
- Normal density is performance-guarded by shared column and total-cell limits.
  The global Advanced Density preference exposes up to 900 columns without a
  30 FPS guarantee and is never stored in visual presets.
- Version 0.9.6 removes duplicate native source-frame uploads, reuses stable GPU
  resources, and bounds transition-time UI work without changing renderer math
  or quality settings.
- The renderer exposes live controls for grid, cell size, color, gamma,
  brightness, contrast, saturation, background blend, quantization, jitter,
  sample position, smoothing, FPS, glyph/cell behavior, and performance status.
- Stats overlay is enabled by default and remains user-controlled.

### Presets and Live Controls

- Built-in read-only visual presets, including extreme looks such as Neon
  Sledgehammer, Gamma Sinkhole, Chrome Wound, Candy Fragmenter, Paper Shredder,
  Cyberdelic Riot, Acid Snowstorm, Terminal Collapse, and Neon Razorstorm.
- Built-in traditional ASCII presets, including Classic Camera ASCII, ANSI
  Newsprint, Terminal Mono, and Dense Typewriter.
- Classic Camera ASCII is the default for a clean profile. Existing persisted
  profiles keep their visual settings instead of being silently reset. The
  clean-profile visual choice does not override the global Auto renderer
  preference; presets without an explicit compatibility backend use
  WebGPU/WebGL2 when the runtime supports them.
- Twenty-three read-only character presets adapted from
  [ascii.today](https://ascii.today/), including Broadway KB, Computer, Doom,
  Ghost, Modular, Standard, Univers, and Doh. The complete credited pack is in
  [ascii.today Character Presets](docs/ASCII_TODAY_PRESETS.md).
- Built-in and My Presets are shown as separate, independently alphabetized
  sections with a live name search. The prior Point & Click Default display
  name is now the more descriptive Dense Color ASCII; its stable preset id is
  unchanged.
- Character Set, Font Family, Palette, and other selects share the same control
  geometry so traditional ASCII tuning stays aligned in the dense sidebar.
- Palette, mapping, ordered-dither, glyph-ramp, and glyph-color controls are
  independently tunable and saved through the existing visual-preset schema.
- Ten built-in palette/glyph variants include Braille, box drawing, CJK marks,
  Hiragana, Katakana, CJK Unified, and Hangul looks. The other six palettes are
  incorporated into existing presets.
- User presets can be saved, duplicated, updated, deleted, imported, and
  exported.
- Multiple named preset playlists can be saved with reordered stable preset
  entries, one shared hold interval, and random or in-order looping. Playlist
  playback keeps each preset's existing transition duration authoritative.
- Preset transitions crossfade instead of fading to black.
- Transition time is configurable.
- Presets preserve the active media source unless the user explicitly changes
  it.
- WTF mode continuously transitions through randomized live-safe settings and
  leans into both extreme and traditional ASCII preset families while avoiding
  pure white or pure black output.

### Audio Reactivity

- Audio reactivity is on by default.
- Mic/input is the default audio-reactive source.
- Local audio files can drive visual modulation.
- System/display audio is supported where the operating system provides an
  audio track to the desktop app.
- Tauri desktop builds include native audio capture paths for system/input
  audio features.
- Audio analysis tracks RMS, bass, low-mid, mid, high-mid, treble, presence,
  brightness, density, transient energy, beat pulse, and spectral movement.
- Dense-mix dampening and noise-floor controls help busy songs stay reactive
  without pinning jitter and beat response at maximum.
- Audio modulation is non-persistent: it affects live effective render params
  without rewriting saved presets.
- Safe clamps prevent high sensitivity from driving the renderer into pure
  white or pure black screens.

### Pop Out and External Displays

- Pop Out creates a separate output window intended for a projector, capture
  card, or secondary display.
- The main control window remains visible and interactive.
- The desktop output window is native, not a second heavyweight duplicated UI
  surface.
- Output display selection is persisted when Tauri can enumerate displays.
- Single-camera output uses platform-native capture: AVFoundation on macOS,
  Media Foundation on Windows, and V4L2 through the bundled local FFmpeg
  runtime on Linux. Windows/Linux frames feed the native `wgpu` presenter;
  bounded current-frame mirroring remains available when native device opening
  fails or multiple cameras are selected.
- The camera-icon control saves the current primary renderer surface as a PNG
  directly to Desktop. The HTML Stats Overlay is outside that captured surface,
  and no save dialog is opened.

### Experimental MIDI Control

- Experimental native DIN MIDI control for an Evolution/M-Audio UC-33e
  connected through an iConnectivity mioXC.
- Four hardware pages for Visual, Audio, Presets, and Fine/User control, with
  all 9 faders, 24 rotary controllers, and 14 assignable buttons mapped.
- Numeric visual-preset slots from 1 through 128 with Enter, Previous, and Next.
- Soft takeover is enabled by default to prevent jumps after software preset
  changes.
- MIDI Learn overrides, connection monitoring, and automatic mioXC reconnection.
- Bounded full-bank SysEx capture, explicit Install/Restore, verification, and
  optional Ensure Profile on Connection.
- MIDI is restricted to visual parameters, audio-reactive settings, visual
  presets, and WTF mode. It cannot change media sources, Camera, Pop Out, or
  output displays.
- Current physical hardware validation covers macOS Apple Silicon with the
  UC-33e connected by DIN through a mioXC. Direct UC-33e USB is not supported,
  and Windows/Linux physical validation is not complete.

MIDI remains experimental. Automated mapping, safety, native transport, and
bounded SysEx tests pass. Ensure Profile on Connection stays disabled by default
and requires a manually captured and verified hardware profile.

### Desktop Packaging and Updates

- Built with Tauri v2.
- Production runtime is local-only by default.
- The packaged app blocks arbitrary remote HTTP(S) connections through a
  production Content Security Policy.
- The app uses narrow Tauri capabilities split by window:
  - The main control window can open selected media and manage output.
  - The output window has a minimal command surface.
- Version 0.9.8 checks GitHub Releases metadata for signed updater packages once
  in the background whenever the production app opens. A current or offline
  check is silent; when a newer release exists, the top-bar Update control shows
  it. Versions 0.9.6 and 0.9.7 require a manual DMG upgrade to 0.9.8 because a
  missing production capability hid their Update control.
- The same Update control remains available for a manual recheck. Downloading,
  installation, and relaunch remain explicitly user initiated.
- The Reports control remains visible when no crash reports are pending so the
  `ask`, `always`, and `off` preference is always reachable. A pending count and
  warning state appear only after a bounded, sanitized report is captured.
  The same dialog can capture a manual current-state diagnostic with an optional
  problem description; it uses the existing bounded report schema and queue,
  not arbitrary application logs.
  Development bundles retain reports locally for review and keep Send disabled;
  only a release-mode build with the production bundle identifier may submit.
  Legacy unavailable-microphone reports are removed from the queue because a
  disconnected or absent input device is a normal hardware state.
- Public macOS artifacts are Developer ID signed, notarized, stapled, and
  Gatekeeper-validated. Current Windows artifacts are unsigned previews.
- Normal development commands use the visibly separate `ASCII VJ Remix Dev`
  app and `com.asciline.remix.dev` bundle identifier. Development builds cannot
  replace or inherit privacy grants from the production app.
- Intentional online paths are limited to the updater check/download flow and
  production-only reviewed/sanitized crash report submission.
- Crash report submission goes through the Rust desktop layer to the
  `https://crash.dustwave.xyz` Cloudflare Worker relay. The webview does not get
  arbitrary HTTP capability and selected media is never uploaded. Renderer
  failures may attach a bounded, sanitized event summary with preset/backend
  state; local media diagnostics and arbitrary logs are not attached.

### Advanced and Development-Only Paths

The legacy ASCILINE stream path and the Rust/FFmpeg stream-session code are
development infrastructure. Stream mode, the Static/Streaming selector, the
connection label, and the buffer counter are not exposed in the normal Source
UI.

The initial hardware setup and complete controller map live in
[docs/MIDI_UC33E.md](docs/MIDI_UC33E.md).

## System Requirements

These requirements are practical guidance for the current renderer, not a
contract. Higher grid sizes, multiple cameras, audio reactivity, and native
output windows all increase load.

### macOS

| Level | Requirement |
| --- | --- |
| Minimum | Apple M1 or newer, macOS 13 Ventura or newer, 16 GB RAM, Metal-capable GPU, 2 GB free disk space. Official macOS builds are Apple Silicon first. |
| Optimal | M1 Pro/Max, M2 Pro/Max, M3 Pro/Max, or newer; 16 GB RAM or more; macOS 14 Sonoma, macOS 15 Sequoia, or newer; external display/projector for Pop Out. |

Notes:

- Intel Mac support is not the current release target. It may work from source
  if you build a compatible bundle yourself, but it is not the tested path.
- Camera, microphone, and audio capture require explicit macOS privacy grants.
- Public macOS release builds are Developer ID signed, notarized, stapled, and
  accepted by Gatekeeper. Local or test builds may require the normal macOS
  right-click Open or Open Anyway flow.

### Windows

| Level | Requirement |
| --- | --- |
| Minimum | Windows 10 22H2 or Windows 11, x64 CPU, WebView2 runtime, integrated GPU broadly comparable to Apple M1 graphics with D3D12 or WebGL2 support, 16 GB RAM, 2 GB free disk space. |
| Optimal | Windows 11, recent Intel/AMD/NVIDIA GPU with current drivers, 16 GB RAM or more, hardware media decode, dedicated output display. |

Notes:

- Most current Windows 10/11 systems already include WebView2. If an installer
  reports that WebView2 is missing, install the Microsoft WebView2 Runtime once.
- Single-camera Pop Out uses Windows Media Foundation capture and the D3D12
  native renderer when available, with the existing bounded mirror as a
  device/driver fallback.
- Native WASAPI system-audio loopback is not implemented. Current system/display
  audio behavior depends on the capture path exposed by the runtime; verify it
  on the target machine before a live session.

### Linux

| Level | Requirement |
| --- | --- |
| Minimum | Modern x86_64 Linux distribution, WebKitGTK 4.1 runtime, Mesa or vendor GPU drivers with WebGL2, 8 GB RAM, 2 GB free disk space. |
| Optimal | Ubuntu 24.04, Fedora 44, Arch, or comparable current distro; Wayland or well-configured X11; recent Mesa/NVIDIA drivers; Vulkan-capable GPU. |

Notes:

- Linux Tauri uses the system WebKitGTK stack, so GPU feature support varies by
  distribution, WebKitGTK version, and graphics driver.
- WebGL2 may be the practical Linux fallback even when WebGPU is not available.
- Single-camera Pop Out uses V4L2 capture through the bundled local FFmpeg
  runtime and Vulkan/GLES native rendering. Because many V4L2 devices are
  exclusive, the main camera preview pauses while native Pop Out is active and
  is restored when it closes.
- Native Linux camera/audio/output behavior varies by distribution and
  hardware; Ubuntu and Fedora package acceptance remains a physical test.

## Hardware Guidance

| Level | Hardware |
| --- | --- |
| Minimum | Apple M1-class or comparable 4-core-plus CPU/integrated GPU, 16 GB RAM, WebGL2/Metal/D3D12/Vulkan/GLES support, 1080p display, one camera or one local media source at a time. |
| Optimal | 8 or more performance cores, 16 to 32 GB RAM, Apple Silicon Pro/Max or a recent discrete GPU, hardware video decode, SSD storage, external display/projector, USB or HDMI capture hardware, class-compliant audio interface. |

For live camera work, the best upgrade is often not raw CPU. Use stable USB
cameras, direct USB ports or a powered hub, good lighting, and a machine on AC
power.

## Battery and Heat Warning

ASCII VJ Remix can be demanding. WebGPU/WebGL rendering, high column counts,
multiple cameras, audio analysis, and native output windows can keep the CPU,
GPU, camera, and media decoder active continuously.

On laptops:

- Expect higher battery drain than a normal media player.
- Use AC power for performances or long sessions.
- Lower columns, FPS, camera resolution, and jitter if the machine gets hot.
- Leave Advanced Density off for the performance-guarded range; high column
  counts can increase total cells sharply when auto rows are active.
- Close Pop Out when you do not need a second output surface.
- Prefer the built-in Demo Image or a single video when testing on battery.

## Install Guide

### 1. Download

Download the latest desktop build from:

[https://github.com/aindaco1/ascii-vj-remix/releases](https://github.com/aindaco1/ascii-vj-remix/releases)

The current release contains a notarized Apple Silicon macOS DMG, Windows
EXE/MSI installers, Linux AppImage/deb/rpm packages, and signed updater
metadata. The Windows installers are unsigned previews.

### 2. Install on macOS

1. Download the macOS DMG. The `.app.tar.gz` file on the release is an updater
   artifact, not the primary manual installer.
2. Open the DMG and drag `ASCII VJ Remix.app` onto its **Applications** shortcut.
3. Eject the DMG, then open the installed app from `/Applications` in Finder.
4. The public macOS release is Developer ID signed, notarized, stapled,
   and accepted by Gatekeeper. Local or test builds may still require the
   normal right-click Open or Open Anyway flow.
5. Grant Camera, Microphone, Screen & System Audio Recording, or System Audio
   Recording permissions when macOS prompts for them.

### 3. Install on Windows

1. Download the Windows installer from GitHub Releases.
2. Run the installer.
3. Current Windows artifacts are unsigned previews. Windows may show Unknown
   Publisher, SmartScreen, or Defender warnings. Only continue if the installer
   came from the project GitHub Release and you accept that preview status.
4. Launch ASCII VJ Remix from the Start menu.
5. Grant camera and microphone permissions if Windows prompts.

### 4. Install on Linux

For an AppImage:

```bash
chmod +x ASCII-VJ-Remix*.AppImage
./ASCII-VJ-Remix*.AppImage
```

For a `.deb` package:

```bash
sudo apt install ./ascii-vj-remix*.deb
```

If the app does not launch, check that WebKitGTK, GPU drivers, and desktop
portal packages are installed for your distribution.

## First Run

1. Launch the app.
2. A clean profile starts on Demo Image with Classic Camera ASCII.
3. Search or choose a preset from the alphabetized Built-in section. Presets
   you save appear alphabetically under My Presets.
4. Use Source to switch to Demo Video, Camera, or a custom local file.
5. Tune Palette, Dither, and Glyph controls independently, or choose one of the
   built-in palette/glyph presets.
6. Use Audio Reactivity to select Mic/Input, Audio File, or System/Display
   audio.
7. Use Pop Out to create a separate output window for another screen.
8. Use WTF when you want the app to keep generating extreme or traditional
   ASCII-flavored transitions.

If the renderer does not start, press Start once. If it still does not start,
try a lower backend such as WebGL2 or Canvas2D.

## macOS Permissions and Entitlements

There are two different concepts:

- Entitlements are compiled into the app bundle by the developer. They declare
  what kinds of protected system resources the app may request.
- Privacy permissions are granted by you in macOS System Settings after the app
  asks for access.

ASCII VJ Remix currently includes these macOS entitlements and usage strings:

- Camera access for live camera rendering.
- Microphone/audio input access for audio-reactive visuals.
- Screen/audio capture usage descriptions for display or system audio capture.

Public releases use `com.asciline.remix`. Local development builds use
`com.asciline.remix.dev` and appear as `ASCII VJ Remix Dev`, so rebuilding the
development app cannot disturb the public app's privacy grants.

### Grant Permissions in System Settings

1. Open System Settings.
2. Go to Privacy & Security.
3. Open Camera and enable ASCII VJ Remix.
4. Open Microphone and enable ASCII VJ Remix.
5. Open Screen & System Audio Recording, Screen Recording, or System Audio
   Recording, depending on your macOS version, and enable ASCII VJ Remix.
6. Restart the app after changing these permissions.

macOS may show permission names differently across releases. On newer macOS
versions, system-audio capture can appear as System Audio Recording or as part
of Screen & System Audio Recording.

### Reset macOS Permission Prompts

If permissions are stuck, quit the app and run:

```bash
tccutil reset Camera com.asciline.remix
tccutil reset Microphone com.asciline.remix
tccutil reset ScreenCapture com.asciline.remix
tccutil reset AudioCapture com.asciline.remix
```

Then reopen ASCII VJ Remix and try Camera or Audio Reactivity again. If
`AudioCapture` is not recognized on your macOS version, that reset command can
be ignored.

Permissions are tied to the bundle identifier and app signature. If you used an
older build named `ASCILINE Remix.app`, grant permissions again for
`ASCII VJ Remix.app`.

If permissions are requested after every rebuild, make sure there is no
ad-hoc test build named `~/Applications/ASCII VJ Remix.app`. Keep the public app
at `/Applications/ASCII VJ Remix.app`; current development tooling installs only
`~/Applications/ASCII VJ Remix Dev.app` and requires a stable local signing
identity before launching a permission-sensitive build.

### Verify Entitlements on macOS

Advanced users can inspect the installed app:

```bash
codesign -d --entitlements :- "/Applications/ASCII VJ Remix.app"
plutil -p "/Applications/ASCII VJ Remix.app/Contents/Info.plist" | grep UsageDescription
```

Do not manually edit the app bundle to add entitlements. Reinstall a properly
signed build instead. Editing the bundle breaks the signature.

## Privacy and Offline Behavior

ASCII VJ Remix is designed to be local-first.

- Local media files stay on your machine.
- Camera frames stay local.
- Audio analysis is local.
- The production app performs one bounded release-metadata check for signed
  updater packages at launch. That request contains no media, camera, audio,
  preset, MIDI, crash-report, or local-path data, and a network failure does not
  block app startup. As with any request to GitHub, ordinary connection metadata
  is visible to the network service.
- The packaged app does not download renderer assets, fonts, codecs, models, or
  media providers at runtime.
- Intentional online paths are limited to the Tauri updater and production-only
  reviewed/sanitized crash reports.
- Crash reports exclude local media diagnostics and arbitrary logs. Renderer
  failures include only bounded, sanitized preset/backend events so users can
  review and send enough context to diagnose a fallback.
- Custom desktop file access is session-scoped. If the app says a custom file
  needs access after restart, reselect the file.

See [docs/SECURITY.md](docs/SECURITY.md) for the full local media, permission,
updater, Tauri capability, and FFmpeg sidecar security model.

## Troubleshooting

### Camera says blocked or denied

- Confirm the app is in `/Applications` or `~/Applications`.
- Check System Settings -> Privacy & Security -> Camera.
- Reset Camera permission with `tccutil reset Camera com.asciline.remix`.
- Restart the app.
- Try another camera app to confirm the device is not already locked.

### Microphone or audio input does not start

- Check System Settings -> Privacy & Security -> Microphone.
- Reset with `tccutil reset Microphone com.asciline.remix`.
- Restart the app.
- Select a concrete input device from Audio Reactivity.

### Display or system audio has no audio

Display capture can expose video without an audio track, especially for
app/window capture on macOS. Use System Audio where available. Native Core
Audio Tap capture is not implemented in the current release.

### A preset does not load or changes renderer on Windows

The app automatically retries failed WebGPU/WebGL2 renderer creation with the
Canvas compatibility renderer, including during live preset changes. Because
Windows WebView2 previously forced every glyph preset to Canvas2D, an Auto
preset should now resolve to WebGPU when available or WebGL2 when WebGPU cannot
initialize. Open Stats Overlay to see the resolved backend. If only a small
subset of presets is accelerated, or a GPU preset is blank, open the persistent
Reports control to review and send the bounded renderer diagnostic; it contains
preset/backend state and recent renderer events, never selected media or an
unrestricted log file. Canvas2D can still be selected manually while the GPU
path is diagnosed.

### Pop Out is slow

- Lower columns or FPS.
- Close other GPU-heavy apps.
- Use AC power on laptops.
- Try a direct external display connection instead of a wireless display.
- For a single camera on Windows/Linux, capture a manual report while Pop Out
  is open. `cameraFallbackActive: false` confirms the native capture path;
  mirror timing and accepted FPS are included when fallback is active.

### Video format does not play

The desktop app retries the bundled demo and selected videos through its local
FFmpeg decoder when the platform webview rejects them. If a file still does not
play, verify it with a common MP4/H.264 or VP8/WebM encoding; corrupt or unusual
container/codec combinations can remain unsupported.

## Development

Development instructions live in [docs/CONTRIBUTORS.md](docs/CONTRIBUTORS.md).
Testing expectations live in [docs/TESTING.md](docs/TESTING.md), and renderer
performance guidance lives in [docs/PERFORMANCE.md](docs/PERFORMANCE.md).

The short version:

```bash
npm ci
npm run tauri:dev
npm run check:desktop
```

## Financial Support

If this project is useful to you, support [Dust Wave](https://dustwave.xyz):

- Buy something at [our online shop](https://shop.dustwave.xyz).
- Support a crowdfunding campaign at [The Pool](https://pool.dustwave.xyz), our very own crowdfunding platform.

## Contact

Email Alonso at [alonso@dustwave.xyz](mailto:alonso@dustwave.xyz).

## License

This repository carries the upstream ASCILINE license text: MIT License with an
Anti-Advertisement Restriction. See [LICENSE](LICENSE) for the full license.

In plain language: the project is broadly permissive, but the license includes
an explicit restriction against using the software to serve, deliver, or display
digital advertisements, sponsored content, or commercial marketing to end users.
Read the license itself before redistributing or building on this project.
