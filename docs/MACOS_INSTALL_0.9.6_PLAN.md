# macOS Installation Hardening Plan for 0.9.6

## Status

Implemented locally for 0.9.6. Cross-platform contract tests, the full release
gate, a published 0.9.5 trust/baseline canary, and an optimized local 0.9.6
app/DMG canary pass. The local 0.9.6 artifact is ad-hoc signed, so the final
Developer ID signed/notarized candidate and downloaded-release smoke remain
required before publication.

## Goal

Make the normal macOS installation path obvious and make the published DMG a
verified release contract. A user should open the image, drag **ASCII VJ Remix**
onto **Applications**, eject the image, and launch the installed copy.

The application remains local-first. This work must not add runtime networking,
new Tauri permissions, an automatic installer, or a dependency on EasyDMG or
another third-party DMG handler.

## What Podcast Visualizer 1.1.1 Adds

Podcast Visualizer 1.1.1 provides a useful reference implementation:

- one real application bundle and one `/Applications` shortcut in the DMG;
- direct drag-to-install instructions;
- one shared layout validator used by packaging and final-image verification;
- `hdiutil` integrity verification;
- a read-only, non-browsing mount under a private temporary directory;
- rejection of unexpected entries, a redirected Applications link, or a
  symlinked application bundle;
- post-notarization checks of the mounted app, DMG, stapled tickets, and
  Gatekeeper results; and
- tests for valid and invalid layouts and safe mount-point parsing.

Its custom `package.sh` must not be copied into this project. ASCII VJ Remix
already delegates DMG creation to Tauri, and Tauri already creates the app and
Applications icons. Adding a second packager would create two owners for the
same artifact.

## Current ASCII VJ Remix Baseline

The current release path already does several important things:

- `src-tauri/tauri.conf.json` tells Tauri to produce all platform bundles.
- `scripts/check_tauri_bundle.mjs` checks the built app, resources, identifier,
  and code signature and requires a release DMG to exist.
- `scripts/notarize_macos_dmg.mjs` verifies the Tauri-signed DMG, submits it,
  staples it, and validates the ticket.
- `scripts/check_macos_notarization.mjs` checks the loose app and DMG signatures,
  stapled tickets, Gatekeeper acceptance, updater archive identity, Developer ID
  Team ID, hardened runtime, and designated requirement.
- `scripts/smoke_tauri_release_install.mjs` checks the published updater archive
  and performs a real updater replacement, but it does not currently inspect the
  published DMG.

A read-only canary of the published 0.9.5 DMG established the current Tauri
layout:

```text
.VolumeIcon.icns
ASCII VJ Remix.app
Applications -> /Applications
```

The app in that image reported `com.asciline.remix` and version `0.9.5`.
`hdiutil verify` accepted the image. The
[Tauri 2 DMG guide](https://v2.tauri.app/distribute/dmg/) also documents the app
and Applications icons as its standard DMG installation UI.

The first local 0.9.6 canary built with Tauri 2.11.3 added a regular
`.DS_Store` file containing the Finder window/icon arrangement. The signed and
notarized macOS 26 CI candidate omitted that file while retaining the reviewed
app, Applications link, and volume icon layout. The 0.9.6 contract therefore
accepts `.DS_Store` as optional reviewed metadata alongside the required
`.VolumeIcon.icns` and rejects all other top-level entries.

The remaining gap is therefore validation, not image creation: the layout is
implicit, the release checks do not mount the DMG, and the post-publication
smoke does not require the DMG.

## Implementation Plan

### 1. Make the Tauri-owned install UX explicit

- Add `bundle.macOS.dmg` positions to `src-tauri/tauri.conf.json` instead of
  relying on undocumented-in-repo defaults. Keep Tauri's current 660 x 400
  window with the app on the left and Applications on the right.
- Keep DMG construction in Tauri. Do not add a parallel staging or packaging
  shell script.
- Do not add a custom background for 0.9.6. It would introduce another visual
  and localization asset without improving the contract being tested.
- Update the README install steps to prefer the DMG, tell users to drag the app
  onto Applications, eject the image, and launch the installed copy. Describe
  `.app.tar.gz` as an updater artifact rather than the primary manual installer.

### 2. Add one reusable DMG contract module

Create `scripts/lib/macos_dmg.mjs` as the single owner of DMG discovery, safe
mounting, layout validation, and cleanup.

The module should:

- accept only an absolute, regular, non-symlink `.dmg` path;
- require exactly one release DMG when discovering it in Tauri's bundle tree;
- run `/usr/bin/hdiutil verify`;
- create a private directory with `mkdtemp`;
- attach with `-readonly`, `-nobrowse`, `-noautoopen`, `-mountroot`, and
  `-plist`, without invoking a shell;
- parse the plist response and require exactly one absolute mount point whose
  canonical path stays inside the private mount root;
- require a real `ASCII VJ Remix.app` directory;
- require `Applications` to be a symbolic link whose exact target is
  `/Applications`;
- require `.VolumeIcon.icns` to be a non-empty regular file, accept an optional
  `.DS_Store` only when it is also a non-empty regular file, and reject every
  other top-level entry;
- detach normally, fall back to forced detach only for cleanup, and remove the
  private directory in `finally`; and
- return a small structured report containing schema version, byte size, app
  name, Applications target, and accepted top-level entries.

The exact metadata allowlist is intentional. If a future reviewed Tauri update
changes its DMG metadata, the release should fail closed until the contract and
tests are updated deliberately.

### 3. Reuse existing app and notarization checks

Avoid creating a second set of signing or app-bundle checks.

- Extract only the reusable macOS app structure checks from
  `scripts/check_tauri_bundle.mjs` into a small library, or let the DMG helper
  yield the mounted app path to the existing checker.
- Keep production signing identity and designated-requirement logic in
  `scripts/lib/macos_app_identity.mjs`.
- Have `scripts/check_tauri_bundle.mjs` call the shared DMG contract for a
  release bundle, so local release packaging catches integrity and layout
  failures even without notarization credentials.
- Have `scripts/check_macos_notarization.mjs` call the same contract after DMG
  notarization, then apply its existing codesign, stapler, Gatekeeper, bundle
  identifier, Team ID, hardened-runtime, version, and designated-requirement
  checks to the app mounted from the DMG.
- Require the mounted app identity to match the loose `.app` and extracted
  updater archive. This gives all three macOS delivery forms one identity
  contract.

The release workflow already runs notarization before
`check_macos_notarization.mjs` and asset collection. Preserve that order so a
bad mounted image cannot reach the publishing job.

### 4. Test the contract at three layers

Add a cross-platform Node test, for example
`scripts/test_macos_dmg_layout.mjs`, for logic that does not require macOS:

- accept the canary layout;
- reject a missing Applications entry;
- reject `/tmp` or a relative Applications target;
- reject Applications as a regular directory;
- reject a symlinked app bundle;
- reject a missing or symlinked volume icon;
- accept the reviewed layout both with and without `.DS_Store`;
- reject `.DS_Store` when it is present as a symlink or empty file;
- reject extra top-level entries; and
- accept only valid absolute mount points from representative `hdiutil` plist
  data.

Add the test to `package.json` once and include it in an aggregate already used
by both `check:desktop` and `check:release`, rather than repeating its command
text in both gates.

On macOS, the existing bundle and notarization checks provide the integration
layer against a real DMG. The published-release smoke should also:

- require exactly one `.dmg` asset;
- run the shared DMG verifier against the downloaded bytes before the updater
  hop; and
- verify that the mounted app version matches `latest.json` and the release
  tag.

### 5. Protect and document the published installer

- Ensure all mounted-image verification finishes before release asset
  collection and upload.
- Make publishing fail if the same version already has a DMG asset instead of
  silently replacing its bytes with `gh release upload --clobber`. If broader
  artifact immutability is adopted, apply the rule uniformly to every platform
  artifact in the publishing helper rather than special-casing the DMG.
- Add a 0.9.6 changelog entry only after the implementation passes. It should
  describe the clearer drag-to-Applications flow and mounted-image verification,
  not merely the existence of this plan.
- Mention that the conventional image may work with cautious automatic handlers
  such as EasyDMG, but do not present such a handler as required or use it as the
  release gate.

## Planned File Ownership

| File | Responsibility |
| --- | --- |
| `src-tauri/tauri.conf.json` | Tauri-owned DMG window and icon positions |
| `scripts/lib/macos_dmg.mjs` | One DMG discovery, mount, layout, and cleanup contract |
| `scripts/lib/macos_app_identity.mjs` | Existing production identity and requirement contract |
| `scripts/check_tauri_bundle.mjs` | Local release app and mounted-DMG bundle gate |
| `scripts/check_macos_notarization.mjs` | Post-notarization signature, ticket, Gatekeeper, and mounted-app gate |
| `scripts/smoke_tauri_release_install.mjs` | Verification of the published DMG plus existing updater hop |
| `scripts/test_macos_dmg_layout.mjs` | Cross-platform contract unit tests |
| `README.md` | User-facing drag-to-Applications instructions |
| `CHANGELOG.md` | Completed 0.9.6 behavior after validation |

## Acceptance Criteria

The work is complete only when all of the following are true:

- A 0.9.6 candidate DMG opens with one visible app and one visible Applications
  destination.
- The top level contains exactly the app, the `/Applications` link, the reviewed
  Tauri volume icon metadata, and optionally a valid `.DS_Store`.
- The app and Applications entries cannot redirect outside the mounted image or
  `/Applications` contract.
- The image passes integrity, Developer ID signature, notarization-ticket, and
  Gatekeeper checks.
- The mounted app passes the same bundle identifier, Team ID, hardened runtime,
  designated requirement, version, resources, and signature checks as the
  loose app and updater archive.
- CI fails before publication for a malformed image.
- Published-asset smoke downloads and revalidates the DMG rather than trusting
  the build directory.
- A manual macOS 26 canary can drag the app to `/Applications`, eject the image,
  launch the installed copy, and reach Demo Image without using the copy mounted
  inside the DMG.
- No runtime capability, entitlement, updater key, media path, or application
  behavior changes as part of the installer work.

Planned validation commands:

```bash
npm run test:macos-dmg-layout
npm run check:desktop
npm run check:release
npm run bundle:release
npm run check:macos-notarization
npm run smoke:release-install -- --release-tag v0.9.6
```

## Delivery Sequence

1. Land the shared contract and unit tests.
2. Integrate it into the local bundle and notarization gates.
3. Validate one unsigned/local Tauri DMG layout canary.
4. Validate one Developer ID signed and notarized 0.9.6 candidate.
5. Update README and changelog copy from observed behavior.
6. Publish once, then run the downloaded-asset smoke and manual install canary.

Do not publish 0.9.6 merely because the unit fixture passes. The signed,
notarized, mounted-image canary is the release proof.
