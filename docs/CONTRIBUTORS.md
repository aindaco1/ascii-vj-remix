# Contributor Guide

This guide is for people who want to build, test, document, or extend ASCII VJ
Remix.

The project is a local-first native Tauri renderer lab. Treat that as a
constraint when contributing: avoid online runtime dependencies, keep broad
filesystem access out of the app, and preserve renderer quality whenever a
desktop-only feature is added.

## Repository Map

| Path | Purpose |
| --- | --- |
| `index.html`, `style.css`, `app.js` | Main renderer lab UI and control logic. |
| `renderers/gpu/` | GPU renderer, media source abstraction, WebGPU/WebGL2 backends, and renderer assets. |
| `renderers/desktop/` | Tauri adapter and output-display helpers. |
| `renderers/shared/midi-mapping.js` | UC-33e profile, mapping validation, scaling, soft takeover, and event coalescing. |
| `assets/branding/` | Canonical app artwork used to generate platform icons. |
| `src-tauri/` | Tauri v2 desktop shell, native output window, media registry, audio providers, FFmpeg media engine, capabilities, generated icons, and packaging config. |
| `media/` | Built-in demo image/video and hidden development fixtures. |
| `experiments/` | Legacy/adaptive codec vector and stream experiments. |
| `scripts/` | Build checks, Podman setup, release helpers, updater helpers, FFmpeg staging/build scripts, and smoke tests. |
| `docs/` | [Documentation index](README.md), user/developer guides, practice guides, release records, and performance evidence. |

## Prerequisites

Minimum development tools:

- Node.js 24 or newer.
- npm.
- Rust stable toolchain with Cargo.
- Git.
- A current browser. Chromium is preferred for WebGPU testing.

Platform-specific desktop prerequisites:

- macOS: Xcode command line tools.
- Windows: Visual Studio Build Tools with the C++ workload and WebView2
  runtime.
- Linux: WebKitGTK 4.1 development packages, appindicator, ALSA development
  headers, librsvg, OpenSSL, patchelf, and build tools.

Optional but useful:

- Podman for the reproducible Linux dev shell and Python/OpenCV experiments.
- FFmpeg/ffprobe for media-engine development.
- Playwright dependencies for browser smoke tests.
- GitHub CLI for release secret management.

## First-Time Setup

Install JavaScript dependencies:

```bash
npm ci
```

Run the browser dev server:

```bash
npm run dev
```

Open:

```text
http://127.0.0.1:8010/
```

Run the static smoke test:

```bash
npm run smoke:static
```

Run the desktop app in development mode:

```bash
npm run tauri:dev
```

Run the main desktop validation gate:

```bash
npm run check:desktop
```

On macOS workspaces stored under iCloud Drive, the Tauri build helper redirects
target output to `/private/tmp/ascii-vj-remix-tauri-target` so iCloud extended
attributes do not break app signing. You can override the build directory with
`ASCILINE_TAURI_TARGET_DIR` or `CARGO_TARGET_DIR`.

## Common Commands

| Command | Use |
| --- | --- |
| `npm run dev` | Browser dev server on `127.0.0.1:8010`. |
| `npm run build` | Vite production build plus runtime asset copy. |
| `npm run preview` | Preview the production build. |
| `npm run tauri:dev` | Tauri desktop dev mode. |
| `npm run tauri:build:dev -- --bundles app` | Optimized macOS development app. |
| `npm run bundle:debug` | Build and validate a local debug desktop bundle. |
| `npm run bundle:test` | Windows release-profile development EXE/MSI with staged FFmpeg. |
| `npm run bundle:test:linux` | Linux development AppImage, deb, and rpm with staged FFmpeg. |
| `npm run icons:generate` | Regenerate platform icons from the canonical source. |
| `npm run midi:probe` | List MIDI ports; add `-- --connect` to open both mioXC directions. |

The [Testing quick reference](TESTING.md#quick-reference) owns validation
commands; its [recommended check sets](TESTING.md#recommended-check-sets)
explain which to run for a change.

Same-repository pull requests also package updater-disabled development
artifacts after the platform's desktop gate passes. The unsigned `ASCII VJ
Remix Dev` Windows installer is built in release mode, verifies the graphical
PE subsystem, and installs alongside the production identity. Linux produces
AppImage, deb, and rpm packages from the same development identity. CI builds
and verifies the pinned FFmpeg/ffprobe resources for each package set before
bundling. The
`ascii-vj-remix-windows-test-<commit>` and
`ascii-vj-remix-linux-test-<commit>` artifacts are retained for 14 days. See
[Linux VM QA](LINUX_VM_QA.md) for the maintained VM matrix.

## Podman Development Shell

The repo includes a Podman setup for a reproducible Linux environment on macOS
and Linux. It is especially useful for Python/OpenCV codec experiments and for
avoiding host Python/OpenSSL differences.

```bash
scripts/podman-doctor.sh
scripts/podman_build.sh
scripts/podman_venv.sh
scripts/podman_run.sh bash
```

The Podman image defaults to Node 24. To smoke-test a newer even-numbered Node
release:

```bash
NODE_MAJOR=26 scripts/podman_build.sh
```

Run the legacy codec/vector suite through Podman:

```bash
scripts/podman_codec_tests.sh
```

For long-running commands, the Podman wrapper can restart unexpected exits:

```bash
PORT=8010 ASCILINE_RESTART=1 scripts/podman_run.sh python -m http.server 8010 --bind 0.0.0.0
```

If a port is already in use, pick another host port:

```bash
HOST_PORT=8011 CONTAINER_PORT=8010 ASCILINE_RESTART=1 scripts/podman_run.sh python -m http.server 8010 --bind 0.0.0.0
```

## Development Rules

- Keep runtime behavior local-first. Do not add CDNs, online decoders, hosted
  fonts, analytics, remote provider SDKs, or runtime codec downloads.
- Keep user-selected files behind explicit user selection.
- Do not add broad home-directory or filesystem grants.
- Keep the normal Source UI focused on static local sources. Stream mode remains
  development-only.
- Preserve the Vite/static smoke harness and renderer portability when adding
  desktop-only Tauri features.
- Keep stats overlay user-controlled. Randomization, presets, and audio
  reactivity must not silently turn it off.
- Avoid renderer restarts when switching presets, audio settings, or live-safe
  controls.
- Run appropriate checks before opening a PR.

Use the project practice docs when changing shared behavior:

- [Security](SECURITY.md): Tauri capabilities, local media, permissions,
  updater signing, FFmpeg sidecars, and secret handling.
- [Performance](PERFORMANCE.md): renderer FPS, native Pop Out, source switching,
  camera latency, audio response, and optimized-build validation.
- [Testing](TESTING.md): check selection, smoke coverage, release checks, and
  manual hardware validation.
- [Accessibility](ACCESSIBILITY.md): keyboard, focus, labels, contrast, and
  dense-control best practices.
- [Internationalization](I18N.md): current language boundary, string ownership,
  and localization-safe UI rules.

## Frontend and Renderer Work

The app uses vanilla HTML/CSS/ES modules with Vite. There is no React/Svelte
application layer.

Important state concepts:

- `params`: canonical persisted renderer state.
- `effectiveParams`: live render state after audio reactivity or other
  non-persistent modulation.
- `SOURCE_PRESETS`: visible built-in sources.
- `BUILTIN_PRESETS`: read-only preset library.
- `StaticRuntime`: browser media source plus WebGPU/WebGL2/Canvas renderer.
- `StreamRuntime`: legacy/dev stream path.
- `AudioReactiveRuntime`: local audio analysis and effective-param modulation.

When adding a visible control:

1. Add it to the canonical parameter model.
2. Add control metadata.
3. Add conditional visibility rules if it is not valid for every source/backend.
4. Route changes through the same setter path as sliders, presets, WTF mode, and
   MIDI.
5. Verify it works live without restarting media unless it is explicitly a
   structural renderer/source change.

## Desktop and Tauri Work

Tauri commands are declared in `src-tauri/src/lib.rs` and gated through
capabilities in `src-tauri/capabilities/`.

Keep capabilities narrow:

- Main window: media selection, output management, audio providers, updater.
- Output window: minimal listen/close/fullscreen permissions only.

The MIDI command surface is main-window only. Native MIDI code lives
in `src-tauri/src/midi.rs`; the first supported port is the DIN-connected
mioXC. Do not grant MIDI or SysEx commands to the output window. See
[MIDI_UC33E](MIDI_UC33E.md) before changing the hardware profile.

Select the [MIDI checks](TESTING.md#midi-uc-33e-or-sysex-changes) for mapping,
transport, or SysEx changes.

The production CSP in `src-tauri/tauri.conf.json` intentionally blocks
arbitrary remote HTTP(S) connections. If you need a new protocol or resource
path, update the policy deliberately and run:

```bash
npm run check:tauri-policy
```

The app icon has one source of truth:
`assets/branding/ascii-vj-remix-app-icon-1024.png`. Do not hand-edit the
platform files under `src-tauri/icons/`. Regenerate and verify them with:

```bash
npm run icons:generate
npm run check:icons
```

## macOS Permissions During Development

Production and development use separate app identities:

```text
ASCII VJ Remix      com.asciline.remix
ASCII VJ Remix Dev  com.asciline.remix.dev
```

`npm run tauri:dev`, `npm run bundle:debug`, and
`npm run tauri:build:dev` automatically apply `src-tauri/tauri.dev.conf.json`.
Do not use a production-named bundle for local Camera, Microphone, or System
Audio testing.

Create the stable local code-signing identity once:

```bash
npm run desktop:codesign:local
```

Then build, install, and launch the development app:

```bash
npm run desktop:run-local -- --build
```

The local runner installs `~/Applications/ASCII VJ Remix Dev.app`, verifies
`com.asciline.remix.dev`, and refuses ad-hoc signing by default. For a disposable
build that will not receive persistent privacy grants, explicitly opt in with
`ASCILINE_ALLOW_ADHOC_LOCAL=1`.

Override `ASCILINE_CODESIGN_IDENTITY` only when deliberately testing a
different stable signing identity.

Reset development privacy grants when needed:

```bash
tccutil reset Camera com.asciline.remix.dev
tccutil reset Microphone com.asciline.remix.dev
tccutil reset ScreenCapture com.asciline.remix.dev
tccutil reset AudioCapture com.asciline.remix.dev
```

## FFmpeg and Media Engine Work

The Rust/FFmpeg pipeline provides local stream/media preparation without
bundling Python in production. Python/OpenCV remains development and reference
infrastructure.

Development commands use these environment variables when set:

```bash
ASCILINE_FFMPEG=/path/to/ffmpeg
ASCILINE_FFPROBE=/path/to/ffprobe
```

On macOS and Windows, the Podman wrappers reuse a healthy default Podman
connection before starting `podman-machine-default`. This avoids colliding with
another checkout's already-running VM. Set `ASCILINE_PODMAN_MACHINE` only when
the fallback machine has a different name.

Preview the media pipeline:

```bash
npm run media:decode-preview -- media/demo-video-2.mp4 96 54 2
npm run media:pipeline-preview -- media/demo-video-2.mp4 96 54 12 5 false
npm run media:native-session-preview -- media/demo-video-2.mp4 96 54 12 5 true 4
```

Run the [FFmpeg and media checks](TESTING.md#ffmpeg-and-media-engine) when
changing frame preparation, decode, or native media sessions.

The release workflow uses reviewed FFmpeg/ffprobe sidecars. Stage local binaries
with explicit provenance:

```bash
npm run ffmpeg:stage -- --ffmpeg /path/to/ffmpeg --ffprobe /path/to/ffprobe --license LGPL-2.1-or-later --source "reviewed reproducible build notes"
npm run check:ffmpeg-resources
```

The release workflow builds FFmpeg from the pinned official 8.1.2 source
tarball with network protocols disabled and stages LGPL-compatible sidecars.
Do not commit generated sidecar binaries or private release keys.

## Release and Updater Work

Follow the [Release and Updater Guide](RELEASING.md) for packaging, signing,
publication, immutable artifacts, and post-publication acceptance. Use
[Testing: Release and Updater](TESTING.md#release-and-updater) for check selection.
Version-specific evidence lives in [release records](releases/README.md).

## Pull Request Checklist

Choose the smallest useful [recommended check set](TESTING.md#recommended-check-sets)
and complete the applicable [manual smoke checks](TESTING.md#manual-smoke-checklist).
For documentation moves, also verify relative links, heading anchors, and path
references; `git diff --check` alone does not check links.

## Contribution Flow

1. Create a focused branch.
2. Keep changes scoped to the feature or bug.
3. Add or update tests when behavior changes.
4. Update docs when user-facing behavior, release process, or architecture
   changes.
5. Run the relevant checks.
6. Open a PR with:
   - what changed.
   - why it changed.
   - how it was tested.
   - any known limitations.

## License

The repository uses the upstream ASCILINE license text: MIT License with an
Anti-Advertisement Restriction. See [LICENSE](../LICENSE).

Contributions must be compatible with that license and with the project's
local-first runtime policy.
