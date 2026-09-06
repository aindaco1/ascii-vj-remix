# ASCII VJ Remix

ASCII VJ Remix is a local-first native desktop renderer lab for turning
images, videos, cameras, and audio-reactive signals into high-performance ASCII
and cell-based visuals.

The app is built for VJ-style experimentation: pick a source, choose a preset,
push the renderer hard, pop the output onto another display, and keep tuning
the look live while the media keeps running.

The current source/package version is 1.0.3, which is also the stable public
release. Release history is recorded in the [Changelog](CHANGELOG.md);
prospective work belongs in the
[Roadmap](docs/ROADMAP.md).

## Quick Links

- [Download desktop releases](https://github.com/aindaco1/ascii-vj-remix/releases)
- [User guide: controls, requirements, permissions, and troubleshooting](docs/USER_GUIDE.md)
- [Documentation index](docs/README.md)
- [Contributor guide](docs/CONTRIBUTORS.md)
- [Changelog](CHANGELOG.md) and [Roadmap](docs/ROADMAP.md)

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

- Local images, videos, cameras, and supported multi-camera mixes.
- WebGPU and WebGL2 rendering, with Canvas compatibility fallbacks.
- ASCII and cell visuals with palettes, ordered dithering, multilingual glyphs,
  and custom character ramps.
- Built-in and user presets, saved playlists, smooth crossfades, and continuous
  randomized WTF mode.
- Local audio reactivity from microphone/input, files, and supported
  system/display audio paths.
- Native Pop Out for another display and PNG capture of the main renderer.
- Experimental UC-33e MIDI control through the mioXC DIN connection.

See the [User Guide](docs/USER_GUIDE.md#current-capabilities) for the full feature
set and platform limits. It also covers [system requirements](docs/USER_GUIDE.md#system-requirements),
[hardware](docs/USER_GUIDE.md#hardware-guidance), and
[battery and heat](docs/USER_GUIDE.md#battery-and-heat-warning).

Media, camera frames, and audio analysis stay local. The app bundles its runtime
assets; intentional online paths are limited to signed updater checks/downloads
and production-only reviewed, sanitized crash reports. See
[privacy and offline behavior](docs/USER_GUIDE.md#privacy-and-offline-behavior).

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

For access problems, see [macOS permissions](docs/USER_GUIDE.md#macos-permissions-and-entitlements)
and [troubleshooting](docs/USER_GUIDE.md#troubleshooting).

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
