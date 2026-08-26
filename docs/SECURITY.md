# Security

This guide documents the current security model, accepted tradeoffs, and
validation practices for ASCII VJ Remix.

ASCII VJ Remix's risk profile is a local-first Tauri desktop app that handles
local media, cameras, microphones, system audio, native output windows, bundled
FFmpeg sidecars, signed update artifacts, and reviewed/sanitized crash reports.

## Security Principles

- Keep the packaged app local-first and offline by default.
- Do not add CDNs, hosted fonts, hosted codecs, telemetry, hosted renderers, or
  runtime dependency downloads.
- Treat the GitHub Releases updater and production-only crash reporter as the
  only intentional online runtime paths.
- Keep user-selected media, camera frames, and audio analysis local.
- Require explicit user selection before reading a local file.
- Keep Tauri capabilities narrow and window-specific.
- Keep the output window as a presentation surface, not a second privileged app
  controller.
- Keep release signing, updater signing, and notarization secrets out of the
  repository.
- The production bundle identifier is `com.asciline.remix`; changing it creates
  a macOS privacy-grant migration.
- Keep local development on `com.asciline.remix.dev`; never sign or install an
  ad-hoc development build under the production identifier.

## Security Architecture

| Surface | Current Boundary | Risk Level | Notes |
| --- | --- | --- | --- |
| Local image/video files | Browser File API or Tauri dialog plus session-local media registry | Medium | Files are selected explicitly without broad filesystem access. |
| Built-in demo media | Bundled under `media/` and copied into app assets | Low | Demo media is local and versioned. |
| Camera input | Browser `getUserMedia`; macOS native AVFoundation path for Pop Out | Medium | Requires OS privacy permission. Frames stay local. |
| Mic/input audio | Web Audio and native Tauri providers | Medium | Requires OS privacy permission. Analysis features are bounded. |
| System/display audio | Browser display audio when present; native desktop providers where available | Medium | Platform permissions vary. Do not broaden capture beyond feature needs. |
| Presets/settings | Local browser storage, IndexedDB, imported/exported JSON | Low to Medium | User-authored data. Validate imports before applying. |
| Output window | Tauri output window with minimal permissions | Medium | Must not expose media selection, filesystem, updater, or broad command APIs. |
| Tauri commands | `src-tauri/src/lib.rs` plus capability files | High | Treat every command as a security boundary. Validate inputs in Rust. |
| Asset protocol | Empty by default, expanded only for selected media/session needs | High | Avoid persistent broad paths. |
| FFmpeg sidecars | Bundled resources with policy checks and source/provenance metadata | Medium | No runtime downloads. Release sidecars disable network protocols. |
| Updater | One production launch check plus explicit manual/download/install actions against the GitHub Releases endpoint with signed packages | High | Launch checks send no product data. Private signing key is external; public key is committed. |
| Crash reporter | Rust-only POST to `https://crash.dustwave.xyz/v1/reports` in production builds | High | Reports are bounded, sanitized, user-configurable, and relayed to GitHub issues by a Cloudflare Worker. |
| Experimental MIDI and UC-33e SysEx | Main-window-only Rust commands, mioXC port allowlist, bounded queues and packet limits | Medium | Profiles stay local and cannot target sources, Camera, Pop Out, or output displays. Physical full-bank restore verification remains incomplete. |
| Logs and smoke reports | Local developer/test artifacts | Low to Medium | Do not log private file paths, raw audio, or sensitive environment values unless needed for explicit debugging. |

## Release Security Posture

The current release line includes these security hardening rules:

- Production CSP allows only the app origin, Tauri IPC, and the Tauri asset
  protocol needed for selected local media. Localhost HTTP/WebSocket endpoints
  exist only in the development CSP; stream mode is not a production source.
- Crash report submission is implemented in Rust, not webview `fetch`, so the
  production CSP does not gain arbitrary remote `connect-src` access.
- GitHub Actions updater signing secrets are scoped to the updater-secret check
  and Tauri packaging steps. Do not place `TAURI_SIGNING_PRIVATE_KEY`,
  `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`, Apple certificate values, or keychain
  passwords in job-level workflow environment blocks.
- Public macOS release CI fails closed when Apple Developer ID signing or
  notarization is incomplete. Public 0.9.8 macOS artifacts are signed,
  notarized, stapled, and Gatekeeper-validated; Windows 0.9.8 artifacts are
  unsigned previews.
- Public macOS artifacts must retain Team ID `PWT3Q52LZ2` and the stable
  identifier/team designated requirement. CI validates both the built app and
  the extracted updater archive and rejects ad-hoc or code-hash-only identity.
- Local launch tooling requires the separate `ASCII VJ Remix Dev` identity and
  a stable local signing certificate. It never synchronizes into the production
  application path.
- GitHub Actions macOS jobs are pinned to `macos-26` instead of
  `macos-latest`. The native `wgpu`/`apple-metal` stack needs the macOS 26
  Metal SDK, and the moving `macos-latest` alias can select an older SDK.
- Frontend app state retains the derived playback URL or media id instead of the
  selected local path. Diagnostics redact file and asset URLs before writing
  `/tmp/asciline-media-diagnostics.log`.
- Tauri media registrations and asset grants are session-local. The
  `forget_media_file` command revokes a path grant after its final registration
  is removed; persisted custom-source metadata does not preserve path access
  across app restarts.
- Preset imports must be bounded, schema-checked, clamped through the shared
  control metadata, and stripped of source/media fields before they can affect
  renderer state.
- Glyph-mode native output treats `charset` as allowlisted data. Resolved
  custom catalog ramps must be bounded, space-leading, unique, and restricted
  to the fixed glyph atlas. Keep `fontFamily` out of native font-loading or
  resource-lookup paths.
- Dependency audits cover npm and Rust. `cargo audit` warnings from
  Tauri's current GTK/WebKit transitive stack are tracked as upstream desktop
  framework risk; actionable direct/transitive advisories must be fixed before
  release when an upgrade is available.

## Tauri Runtime Policy

The production runtime is intentionally narrow:

- `src-tauri/tauri.conf.json` keeps a restrictive production Content Security
  Policy.
- Production CSP does not allow arbitrary localhost HTTP/WebSocket endpoints;
  localhost stream/dev endpoints exist only in `devCsp`.
- `npm run check:tauri-policy` verifies the local-only runtime policy, the
  GitHub updater endpoint exception, and the Rust-only crash reporter command
  boundary.
- Capabilities in `src-tauri/capabilities/` split main-window privileges from
  output-window privileges.
- The main window owns media selection, output management, audio providers, and
  updater/crash-report work.
- The output window only listens for render/output messages and exposes
  the minimum close/fullscreen behavior it needs.

When adding a Tauri command:

1. Prefer a narrow command with typed inputs over a generic command.
2. Validate paths, ids, dimensions, enum values, and numeric bounds in Rust.
3. Grant the command only to the window that needs it.
4. Avoid returning raw filesystem paths to the webview unless the UI needs to
   display a user-selected filename.
5. Add or update a test/check when the command changes the app's security
   posture.

## Crash Reporting

Crash reporting is opt-in by preference and production-only for network
submission. Debug/dev builds can capture local reports for testing, but Rust
refuses to submit them.

The crash reporter can capture:

- frontend `error` events.
- frontend `unhandledrejection` events.
- Tauri command failures.
- Rust panic-hook reports imported on the next launch.

Security requirements:

- Reports must be bounded before local storage and before submission.
- Reports must redact local paths, asset/file URLs, emails, tokens, cookies,
  passwords, and auth-like context keys.
- Reports must not include user media files, decoded frames, screenshots, raw
  audio, local storage dumps, environment dumps, or arbitrary logs.
- The app stores at most a small local queue and lets the user choose `ask`,
  `always`, or `off`.
- Submission uses the Rust command surface only. The output window must not have
  crash-report permissions.
- GitHub credentials must not be present in the desktop app, repository config,
  or client-visible bundle.

Crash relay architecture:

```text
release desktop app
  -> Rust crash reporter command
  -> https://crash.dustwave.xyz/v1/reports
  -> Cloudflare Worker validation, rate limiting, and sanitization
  -> GitHub App installation token
  -> aggregated GitHub issue
```

The Cloudflare Worker lives in `crash-relay/`. Its GitHub App secrets are set
with `wrangler secret put`, and its KV namespaces rate-limit intake and index
crash fingerprints. Similar reports update one open issue instead of creating a
new issue for every report. The fingerprint prefers stable dimensions such as
kind, surface, platform, command/backend/source mode, native-output state, and
explicit error-code fields; normalized stack frame or message are fallbacks.
Issue bodies keep bounded aggregate state rather than concatenating every
report.

## Local Media and File Access

Custom files must stay behind explicit user selection.

Rules:

- Do not add broad home-directory, downloads-folder, removable-drive, or
  recursive directory grants.
- Do not persist raw file access capabilities beyond what the platform requires
  for the selected session.
- Do not upload selected media to a server.
- Do not send media paths to analytics or remote logs.
- Imported preset/profile files must be parsed and validated as data, not
  executed.
- Current preset exports exclude source and media fields, including private
  media files and absolute media paths.

## Camera, Microphone, and System Audio

Camera and audio capture are sensitive local inputs. Capture starts from visible
app behavior such as selecting Camera or enabling Audio Reactivity. Audio
Reactivity is an intentional default mode, so the app may request
microphone/input permission during startup. Capture remains OS-gated and local,
and the user can stop it by disabling Audio Reactivity or changing the audio
source.

Current macOS bundle identifier:

```text
com.asciline.remix
```

Development builds use `com.asciline.remix.dev`. Reset development grants with
that identifier; do not use a production-named ad-hoc bundle for media testing.

Permission reset helpers:

```bash
tccutil reset Camera com.asciline.remix
tccutil reset Microphone com.asciline.remix
tccutil reset ScreenCapture com.asciline.remix
tccutil reset AudioCapture com.asciline.remix
```

Development rules:

- Keep usage strings in `src-tauri/Info.plist` accurate and specific.
- Keep entitlements in `src-tauri/Entitlements.plist` aligned with real feature
  use.
- Prefer narrower native system-audio permissions when the platform exposes
  them.
- Keep feature frames bounded. Do not ship raw unbounded audio buffers over
  IPC when feature vectors are enough. Audio reactivity uses derived
  features such as RMS, bands, transient/flux, presence, brightness, density,
  beat pulse, and phase.
- Avoid capture auto-retry loops that keep prompting or capturing after the user
  denies access.

## Updater and Release Secrets

The updater is the intentional online path. It reads:

```text
https://github.com/aindaco1/ascii-vj-remix/releases/latest/download/latest.json
```

The production app checks that metadata once per launch without blocking
renderer startup. Current-version and network-failure results remain silent;
when a newer signed release exists, the existing Update control surfaces it.
Downloading, installation, and relaunch require an explicit user action. The
request contains no media, frames, camera or audio data, presets, MIDI state,
crash reports, local paths, credentials, or analytics identifiers. Development
builds do not receive the production endpoint. The launch request necessarily
exposes ordinary connection metadata to GitHub and the surrounding network.

Security requirements:

- Updater packages must be signed.
- The public updater key belongs in `src-tauri/tauri.conf.json`.
- The private updater key belongs in GitHub Actions secret
  `TAURI_SIGNING_PRIVATE_KEY`.
- The updater key password belongs in GitHub Actions secret
  `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`; encrypted updater keys cannot be signed
  in noninteractive release jobs without it.
- Do not commit `/private/tmp/ascii-vj-remix-updater.key` or any replacement
  private key.
- Use `npm run updater:secret:set` and `npm run updater:secret:check` for the
  current GitHub secret workflow.
- Release workflows must not print secret values or pass private keys as
  command-line arguments.
- Release workflows must scope updater signing secrets to signing-only steps,
  never to the whole job.

Apple Developer ID signing adds more secrets. Certificates, passwords, API keys,
and CI keychain passwords live in GitHub secrets, while local test credentials
remain outside the repo. The inactive Windows Authenticode tooling follows the
same boundary: secret values stay in GitHub secrets and non-secret Azure ids use
GitHub repository variables when that tooling is explicitly enabled.

## FFmpeg and Codec Sidecars

FFmpeg sidecars are bundled to keep media functionality standalone. They are
also an important supply-chain and licensing boundary.

Rules:

- Do not download FFmpeg, codecs, or media helper binaries at runtime.
- Release sidecars are built from pinned official source.
- Network protocols remain disabled for release FFmpeg builds unless a
  productized streaming feature explicitly requires a reviewed exception.
- Sidecars need version, SHA-256, license, source, and NOTICE metadata.
- Do not commit generated sidecar binaries unless the release policy changes.

Validation:

```bash
npm run test:ffmpeg-policy
npm run check:ffmpeg-resources
npm run check:ffmpeg-release
```

## Presets and MIDI Data

Presets and MIDI maps are local data, but they can still break the app if
the import path trusts them.

Import rules:

- Parse as JSON data only.
- Validate schema version and supported fields.
- Clamp numeric values through the same live-control metadata used by the UI.
- Keep character-set ids allowlisted. Any resolved ramp sent to native output
  must be bounded and restricted to the fixed bundled glyph atlas.
- Reject unknown structural fields instead of silently applying them.
- Do not let imported presets disable Stats Overlay unless the user imported
  that choice intentionally and the UI makes it clear.
- Do not include private absolute media paths in exported packs by default.

### MIDI and SysEx Rules

- The native adapter accepts only input/output port names containing `mioXC`;
  direct UC-33e USB is not supported.
- MIDI commands belong only to the main control window. The output window must
  never enumerate devices, read events, capture dumps, or send SysEx.
- Event queues, event reads, mapping counts, packet counts, decoded bytes, and
  stored base64 must remain bounded.
- Every outbound packet must start with `F0`, end with `F7`, and stay inside the
  full-transfer byte limit.
- Profile installation must be explicit unless the user has enabled Ensure
  Profile on Connection.
- Ensure-on-connect sends at most once per physical reconnect and must not loop
  while the interface stays connected.
- MIDI Learn targets must come from the allowlisted visual/audio/action target
  registry. Do not add source, Camera, Pop Out, output display, updater, file,
  or crash-report targets.
- Captured profiles and learned mappings remain local and must not contain media
  paths, frames, raw audio, credentials, or network data.

## Security Validation

Use the smallest relevant check set for the change.

General:

```bash
git diff --check
npm run check:offline
npm run check:tauri-policy
npm run test:midi
```

Desktop security and packaging:

```bash
npm run check:desktop
npm run test:macos-secret-args
npm run release:secrets:check
```

Updater:

```bash
npm run test:desktop-updater
npm run test:updater-manifest
npm run updater:secret:check
```

FFmpeg and media sidecars:

```bash
npm run test:ffmpeg-policy
npm run check:ffmpeg-resources
```

## Known Risks

- macOS privacy prompts remain sensitive to app path, bundle identifier, and
  signing identity. Production and development identities are isolated, but a
  deliberately ad-hoc development build still receives build-specific grants.
- Ad-hoc macOS signing is acceptable for local builds only; public releases are
  Developer ID signed, notarized, stapled, and Gatekeeper-validated.
- Windows 0.9.8 artifacts are unsigned previews and may trigger Unknown
  Publisher, SmartScreen, or Defender warnings.
- Linux media/camera/audio behavior varies by distribution, WebKitGTK, drivers,
  and portal setup.
- Stream mode exists in development paths but is hidden from the normal UI and
  excluded from the production CSP.

Prospective security hardening, Windows signing, stream exposure, and MIDI
profile work is tracked in the [Roadmap](ROADMAP.md).

## Reporting Security Issues

Report security issues privately to:

[alonso@dustwave.xyz](mailto:alonso@dustwave.xyz)

Include the operating system, app version, source type, whether Pop Out was
active, and any relevant permission or updater state.
