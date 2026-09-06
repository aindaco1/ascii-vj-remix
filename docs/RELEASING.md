# Release and Updater Guide

This guide owns the reusable packaging, signing, publication, and updater
procedure for maintainers. Run commands from the repository root. Use
[Testing](TESTING.md#release-and-updater) to select validation checks and
[Security](SECURITY.md#release-security-posture) for the release security model.

Version-specific decisions and evidence are kept in
[release records](releases/README.md). They are historical snapshots, not the
current release procedure.

## Evidence and Release Records

Record the exact version, commit or tag, artifact filename/hash, and tested
platform when collecting release evidence. Keep these stages distinct:

1. Source metadata and local checks.
2. CI jobs for the exact candidate or tagged commit.
3. Packaged artifacts, signing, and published bytes.
4. Installed-app and updater acceptance against those artifacts.
5. Physical hardware and manual interaction results.

A successful build or publication does not establish physical-platform
acceptance. Record an owner-approved deferral with its scope; link the remaining
check from [Testing](TESTING.md#hardware-and-platform-checks) and the
[Roadmap](ROADMAP.md#distribution-and-platform-validation).

Create version-specific records under `docs/releases/`, identify the evidence
stage and date, and add them to the [release index](releases/README.md). Preserve
recorded pending rows as historical evidence; do not silently mark them passed
because a later release shipped. Durable product behavior belongs in the user
and architecture guides, and release history belongs in the
[Changelog](../CHANGELOG.md).

## Release Workflow

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

## Updater Signing

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

## Local Packaging and App Identity

For updater-disabled local bundles, use the
[contributor commands](CONTRIBUTORS.md#common-commands). On macOS, follow
[Permissions During Development](CONTRIBUTORS.md#macos-permissions-during-development)
for stable development signing.

Production-shaped release packaging still requires the updater key and must not
be installed as a local permission-testing build.

The base config retains `bundle.macOS.signingIdentity = "-"` for portable
packaging defaults, but normal local commands layer
`src-tauri/tauri.dev.conf.json` to change the app name and identifier and disable
production updates. Public macOS release builds use
`src-tauri/tauri.notarized.conf.json` and fail if Developer ID signing and
notarization credentials are missing.

## macOS Release Signing

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

## Windows Signing Tooling

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

## Build and Package

Choose the checks in [Testing: Release and Updater](TESTING.md#release-and-updater).
Local build-directory overrides are documented in
[Contributor Guide: First-Time Setup](CONTRIBUTORS.md#first-time-setup).

Local release builds run `npm run ffmpeg:build-sidecar` before
`npm run check:release`. Public release CI keeps the same pinned official FFmpeg
8.1.2 source, completed-download promotion, source SHA-256, disabled network
protocols, and LGPL-compatible resource checks, but builds that runtime in
parallel with `tauri build --no-bundle`. It requires the exact commit's
successful main-push `Desktop` workflow, then hands both outputs to the bundle
jobs as immutable one-day workflow artifacts. The restored app binary is
verified against its commit, platform, version, byte size, and SHA-256 before
`tauri bundle` packages it without recompiling. Runtime builds remain offline;
Unix artifact downloads restore executable mode on `ffmpeg` and `ffprobe`
before the release-input checks, because zipped artifact transfers reset file
permissions. Runtime hashes and camera-input availability are still verified.
CI may download official source during release builds, but the packaged app
never downloads FFmpeg, codecs, or renderer assets at runtime.

## Published-Artifact Acceptance

The release workflow also runs `scripts/smoke_tauri_release_install.mjs` on
macOS, Windows, and Linux after publishing. It downloads artifacts from GitHub
Releases instead of reusing local build directories, catching missing assets,
bad `latest.json` URLs, installer layout issues, a hidden Update control, and
broken signed updater downloads. macOS additionally extracts consecutive
updater archives, requires the DMG to contain the real app, exact
`/Applications` link, and reviewed Tauri Finder metadata; validates the
downloaded DMG and mounted app; requires the stable production designated
requirement; performs a true updater self-replacement; and validates the
resulting app identity. Release upload does not replace already-published
artifact bytes for the same tag.

If a post-publication runner exposes an acceptance-tooling defect, correct the
tooling and run the `Release Acceptance` workflow against the existing immutable
tag. It reuses the published bytes without rebuilding or replacing assets.

The updater-hop smoke defaults to `ASCILINE_UPDATER_SMOKE_MIN_VERSION=0.9.0`.
Older `0.1.x` releases used an incompatible updater signing key, so they can be
kept as historical releases but cannot be used as a cryptographic updater-hop
baseline for the current app line.

### CI Smoke Hooks

These hooks are inactive unless explicitly enabled through environment variables.

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
