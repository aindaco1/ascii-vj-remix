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
| `docs/` | Roadmap, rendering-engine guide, security, performance, testing, accessibility, i18n, LLM agent guide, and contributor documentation. |

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
| `npm run check:offline` | Build and verify no remote runtime assets are required. |
| `npm run smoke:static` | Browser smoke test for source UI, renderer startup, output fallback, and audio fake devices. |
| `npm run tauri:dev` | Tauri desktop dev mode. |
| `npm run check:desktop` | Offline build, Tauri policy, output-display simulation, updater manifest, FFmpeg resource policy, Rust tests, and debug no-bundle build. |
| `npm run icons:generate` | Regenerate every Tauri platform icon from the canonical 1024px source. |
| `npm run check:icons` | Regenerate icons in isolation and verify the committed set matches. |
| `npm run bundle:debug` | Build a local debug desktop bundle and validate it. |
| `npm run bundle:release` | Run release gates, build release bundle, and validate it. |
| `npm run test:rust` | Run Rust tests. |
| `npm run check:media` | Run frame prep, decode/resize, and native session media checks. |
| `npm run test:output-display` | Deterministic secondary-display placement simulation. |
| `npm run test:desktop-updater` | Launch/manual updater orchestration, silent-check, install, and progress tests. |
| `npm run smoke:native-output` | Native output performance smoke helper. |
| `npm run smoke:ui-perf` | UI performance smoke helper. |
| `npm run test:midi` | MIDI map, scaling, soft-takeover, action, and scope tests. |
| `npm run midi:probe` | List physical MIDI inputs/outputs; add `-- --connect` to open both mioXC directions. |

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

MIDI checks:

```bash
npm run test:midi
npm run midi:probe
npm run midi:probe -- --connect
npm run test:rust
```

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

Preview the media pipeline:

```bash
npm run media:decode-preview -- media/demo-video-2.mp4 96 54 2
npm run media:pipeline-preview -- media/demo-video-2.mp4 96 54 12 5 false
npm run media:native-session-preview -- media/demo-video-2.mp4 96 54 12 5 true 4
```

Run parity checks:

```bash
npm run test:frame-prep
npm run test:decode-resize
npm run check:media
```

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

ASCII VJ Remix desktop builds must remain standalone at runtime. The Tauri
updater is an intentional online path: the production app invokes it once in
the background at launch and when the user requests a manual recheck. A current
or failed launch check stays silent. Downloading, installation, and relaunch
remain explicit user actions through the existing Update control.

Releases are published by `.github/workflows/release-desktop.yml`. The release
matrix builds macOS, Windows, and Linux artifacts, verifies them, writes updater
manifest fragments, merges those fragments into `latest.json`, and uploads
installers, updater packages, signatures, and `latest.json` to GitHub Releases.
The workflow builds from the requested `v*` tag so release artifacts match the
tagged source, not whatever happens to be at `main` later.

`.github/workflows/auto-version-release.yml` automates the common release path.
When `package.json`, `package-lock.json`, `src-tauri/Cargo.toml`,
`src-tauri/tauri.conf.json`, or `CHANGELOG.md` changes on `main`, it validates
that the app versions match with `npm run release:version:check`, creates
`vX.Y.Z` when that tag does not already exist, and dispatches the desktop
release workflow with that tag. If the tag already exists, it skips release
dispatch so repeated pushes do not overwrite a published version accidentally.

The GitHub Releases updater reads:

```text
https://github.com/aindaco1/ascii-vj-remix/releases/latest/download/latest.json
```

Updater packages are signed with a minisign key pair. The public key is
committed in `src-tauri/tauri.conf.json`. The private key must be stored as the
GitHub Actions secret `TAURI_SIGNING_PRIVATE_KEY`; never commit it.
`TAURI_SIGNING_PRIVATE_KEY_PASSWORD` is required for the current encrypted
release key.

The current public key was generated with a password-protected key:

```bash
npm run tauri -- signer generate --ci -w /private/tmp/ascii-vj-remix-updater.key -p "$(cat /private/tmp/ascii-vj-remix-updater.password)"
```

For this local workspace, the generated private key is expected at
`/private/tmp/ascii-vj-remix-updater.key` and the password is expected at
`/private/tmp/ascii-vj-remix-updater.password`. Never commit either file.

Set/check the updater key with GitHub CLI:

```bash
npm run updater:secret:check
npm run updater:secret:set
npm run release:secrets:check
npm run release:secrets:check:public
```

The updater secret script passes values to `gh secret set` over stdin, not as
command-line arguments. Use `-- --repo owner/repo` or `-- --key /path/to/key`
after the npm script if the defaults are wrong.

`release:secrets:check:public` requires updater signing and macOS Developer ID
notarization readiness. The current Windows release path publishes unsigned
preview artifacts and does not require Windows signing secrets.

For an updater-disabled local development bundle:

```bash
npm run bundle:debug
```

Production-shaped release packaging still requires the updater key and must not
be installed as a local permission-testing build.

The base config retains `bundle.macOS.signingIdentity = "-"` for portable
packaging defaults, but normal local commands layer
`src-tauri/tauri.dev.conf.json` to change the app name and identifier and disable
production updates. Public macOS release builds use
`src-tauri/tauri.notarized.conf.json` and fail if Developer ID signing and
notarization credentials are missing.

`scripts/run_local_desktop_app.sh` requires the stable local identity by
default. Override `ASCILINE_CODESIGN_IDENTITY` only when deliberately testing a
different stable signing identity:

```bash
npm run desktop:codesign:local
npm run desktop:run-local -- --build
```

Developer ID signing and notarization require Apple Developer Program
membership, a base64 Developer ID Application `.p12`, its password, a CI
keychain password, and either App Store Connect API credentials or Apple ID
notarization credentials. Check readiness or upload App Store Connect API
credentials with:

```bash
npm run release:secrets:check:notarized
npm run release:secrets:set:macos -- \
  --certificate /path/to/developer-id-application.p12 \
  --certificate-password-file /path/to/p12-password.txt \
  --api-key ABCDE12345 \
  --api-issuer 00000000-0000-0000-0000-000000000000 \
  --api-key-file /path/to/AuthKey_ABCDE12345.p8
```

Apple ID credentials are also supported:

```bash
npm run release:secrets:set:macos -- \
  --certificate /path/to/developer-id-application.p12 \
  --certificate-password-file /path/to/p12-password.txt \
  --apple-id-file /path/to/apple-id-email.txt \
  --apple-password-file /path/to/app-specific-password.txt \
  --apple-team-id TEAMID12345
```

When `--keychain-password-file` is omitted, the script generates a random
temporary keychain password and stores it in `KEYCHAIN_PASSWORD`.

The repository contains an inactive Azure Artifact Signing path in
`src-tauri/tauri.windows-signed.conf.json`, which invokes
`src-tauri/windows-artifact-sign.cmd`; that wrapper calls
`scripts/windows_artifact_sign.ps1`. This signs Windows artifacts before Tauri
creates updater signatures. The current Windows release path does not use this
config and publishes unsigned Windows preview artifacts. Configure the Azure
values only after Windows signing is enabled as a release policy:

```bash
npm run release:secrets:set:windows -- \
  --client-id "<app-client-id>" \
  --tenant-id "<tenant-id>" \
  --client-secret-file /path/to/azure-client-secret.txt \
  --endpoint "https://<region>.codesigning.azure.net/" \
  --account "<signing-account-name>" \
  --certificate-profile "<certificate-profile-name>"
node scripts/check_github_release_secrets.mjs --require-windows-signing
```

The helper stores `AZURE_CLIENT_SECRET` as a GitHub Actions secret and the other
Azure IDs as GitHub repository variables. The Azure client secret is the only
required Windows signing secret; keep it out of shell history and chat logs.
Provider selection and Windows signing rollout remain roadmap decisions; the
inactive tooling does not describe the current distribution posture.

Use these checks before publishing release changes:

```bash
npm run check:desktop
npm run test:desktop-updater
npm run test:updater-manifest
npm run check:bundle:debug
```

On this macOS iCloud Drive workspace, Tauri build output is redirected to
`/private/tmp/ascii-vj-remix-tauri-target` to avoid iCloud extended attributes
breaking `codesign`. Normal CI and non-iCloud workspaces continue to use
`src-tauri/target`. Override with `ASCILINE_TAURI_TARGET_DIR` or
`CARGO_TARGET_DIR` when needed.

Local release builds run `npm run ffmpeg:build-sidecar` before
`npm run check:release`. Public release CI keeps the same pinned official FFmpeg
8.1.2 source, completed-download promotion, source SHA-256, disabled network
protocols, and LGPL-compatible resource checks, but builds that runtime in
parallel with `tauri build --no-bundle`. It requires the exact commit's
successful main-push `Desktop` workflow, then hands both outputs to the bundle
jobs as immutable one-day workflow artifacts. The restored app binary is
verified against its commit, platform, version, byte size, and SHA-256 before
`tauri bundle` packages it without recompiling. Runtime builds remain offline;
CI may download official source during release builds, but the packaged app
never downloads FFmpeg, codecs, or renderer assets at runtime.

The release workflow also runs `scripts/smoke_tauri_release_install.mjs` on
macOS, Windows, and Linux after publishing. It downloads artifacts from GitHub
Releases instead of reusing local build directories, catching missing assets,
bad `latest.json` URLs, installer layout issues, a hidden Update control, and
broken signed updater downloads. macOS additionally extracts consecutive
updater archives, requires the DMG to contain the real app, exact
`/Applications` link, and reviewed Tauri Finder metadata; validates the
downloaded DMG and mounted app; extracts
consecutive updater archives; requires the stable production designated
requirement; performs a true updater self-replacement; and validates the
resulting app identity. Release upload does not replace already-published
artifact bytes for the same tag. CI-only smoke hooks are inactive unless these
environment variables are set:

The updater-hop smoke defaults to `ASCILINE_UPDATER_SMOKE_MIN_VERSION=0.9.0`.
Older `0.1.x` releases used an incompatible updater signing key, so they can be
kept as historical releases but cannot be used as a cryptographic updater-hop
baseline for the current app line.

- `ASCILINE_DESKTOP_SMOKE=launch`: bounded launch smoke with a report.
- `ASCILINE_DESKTOP_SMOKE=updater-ui`: requires the packaged production Update
  and Reports controls to remain visible after initialization and requires the
  duplicate top-bar backend readout to be absent.
- `ASCILINE_CRASH_REPORT_SMOKE=submit`: production-only acceptance canary. It
  refuses to run with an existing pending report or an `off` preference,
  captures one hard-coded sanitized report, submits it through the Rust relay
  path, and requires the queue to return to empty.
- `ASCILINE_UPDATER_SMOKE=download`: checks `latest.json`, downloads the signed
  updater package, verifies its signature, writes a report, and exits.
- `ASCILINE_UPDATER_SMOKE=install`: downloads and verifies the updater package,
  writes a pre-install report, and invokes Tauri's installer path.
- `ASCILINE_UPDATER_SMOKE_FORCE_FROM_VERSION`: records the forced older-version
  hop used by CI.

The true app-driven updater hop needs a previous release that already contains
`ASCILINE_UPDATER_SMOKE=install`. Releases before v0.1.5 can only participate in
direct install and updater download smoke.

## Pull Request Checklist

Before opening a PR, run the smallest useful check set for your change.

See [Testing](TESTING.md) for the full check matrix and manual smoke checklist.

Documentation-only:

```bash
git diff --check
```

Frontend/source UI:

```bash
node --check app.js
npm run smoke:static
```

Desktop/Tauri:

```bash
npm run check:desktop
```

Media engine:

```bash
npm run check:media
npm run test:rust
```

Release packaging:

```bash
npm run check:release
npm run bundle:release
npm run test:macos-dmg-layout
```

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
Anti-Advertisement Restriction. See `LICENSE`.

Contributions must be compatible with that license and with the project's
local-first runtime policy.
