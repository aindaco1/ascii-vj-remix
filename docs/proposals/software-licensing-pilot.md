# Complimentary private-update pilot

This is an opt-in macOS arm64 pilot, separate from public release configuration.
The shipping free build still uses its existing signed public updater. Browser,
Windows and Linux behavior is unchanged; private enrollment on those native
platforms awaits their credential-store and installer acceptance work.

A build-time `ASCII_LICENSING_ENDPOINT` enables the Software license panel.
It must be an HTTPS origin with no credentials, path, query or fragment.
Debug builds alone accept loopback HTTP for the isolated test harness. The
Tauri public signing key stays in the build's updater configuration; the
service and app must use the same public key. Production endpoints/keys were
not changed. Do not point a release build at the synthetic probe.

The user explicitly activates a key. Rust creates and persists one installation
ID before sending the bounded activation request, so retries reuse the same
seat. macOS Keychain holds the installation ID, service origin and opaque token.
Neither the token nor stored key is returned to JavaScript. A typed activation
key is cleared from the input immediately and is never saved in web storage.
Keychain reads during status/update checks suppress interactive prompts;
status reads run off the WebView main thread to keep OS access waits from
blocking rendering;
explicit activation may request access. A locked Keychain or unavailable service
does not disable rendering, media, presets, output or the installed application.

The existing update controller still owns launch checks, manual installation,
progress and relaunch. For an enrolled build, Rust requests the authenticated
feed and downloads with a bearer header. URLs contain no key/token. Redirects
are disabled and a feed cannot send credentials to another origin. The existing
Tauri updater verifies the artifact signature before installation. The user
must click Update; discovery never installs. Changing activation invalidates
the cached pending update. Update/support expiration filters eligible releases;
it does not turn installed software into a trial or stop it from launching.

Activation accepts legacy four-part, device-revision five-part and versioned
signing-key six-part server receipts within the same length, character and
installation bounds. The token stays opaque in Keychain. If an old server signer
is retired, update checks fail safely; the user can enter their license key again
to reactivate the same installation. The activation key is not retained, so there
is no automatic silent reactivation. Server rotation does not affect offline use.
The November 8 signed pilot below accepts this compatibility path. Public
release and notarized-artifact acceptance remain separate.

## Local reproduction

1. Use a disposable config overlay, unique bundle ID and the established
   Developer ID identity from [RELEASING](../RELEASING.md#macos-release-signing).
   Generate an ephemeral Tauri updater key; never use the production updater key.
2. Build 1.3.3 and 1.3.2 probe bundles with the same endpoint/public key and
   Developer ID identity. Preserve the 1.3.3 `.app.tar.gz` and `.sig` before
   building 1.3.2. The repository version remains 1.3.2.
3. In sibling `dust-wave-licensing`, run `probes/complimentary-local.mjs` with
   artifact, signature, public-key and ignored output-key-file paths. It starts
   real Store/licensing Workers at loopback, checks admin/CSRF/replay, publishes
   verified bytes, issues a complimentary license and runs the Resend dry-run.
4. Copy the 1.3.2 probe app into a fresh temporary installation directory. Run
   its existing updater smoke with `ASCILINE_UPDATER_SMOKE=install`,
   `ASCILINE_UPDATER_EXPECT_VERSION=1.3.3`, a report path and
   `ASCII_LICENSING_SMOKE_KEY_FILE` pointing to the synthetic key file. That key
   file hook exists only in debug builds. Run the replaced executable again with
   `ASCII_LICENSING_SMOKE_EXPECT_ACTIVATED=1` and no key-file variable. This asserts
   a persisted activation before the authenticated feed check, so an unenrolled
   app cannot pass merely because it found no update. Then stop the server and
   verify launch.
5. Archive redacted reports. Delete only the test bundle's Keychain record and
   synthetic resources when finished. Do not overwrite an installed user app.

Ad-hoc signatures change code identity between builds and can trigger Keychain
permission prompts after replacement. Use the intended release signing identity
for final acceptance; a local test certificate is not sufficient evidence.

## November 4 evidence and signing resolution

[Redacted reports](../release-evidence/2026-11-04-private-update-pilot.json) retain
both the initial local-certificate failure and the successful Developer ID run.
The installed public 1.3.2 app verifies as **Developer ID Application: Volver
Health LLC (PWT3Q52LZ2)** and Gatekeeper accepts it as notarized. The owner
confirmed retaining that established identity; the legal publisher remains
Fumblers LLC dba Dust Wave.

Using that Developer ID identity and hardened runtime, a disposable app installed
99,080,386 signed bytes from 1.3.2 → 1.3.3 in 7.89 s. The replaced executable
restarted without receiving a license key again, asserted that its saved
activation was present, and completed the authenticated feed check in 161 ms.
An expired license on 1.3.2 offered no 1.3.3 update; the updated app's offline UI
passed after the service stopped. Post-update credential retention is accepted
for this Developer ID-signed local pilot.

The initial non-Apple local certificate produced Keychain status -25293 after a
binary change. A standalone Swift two-binary test reproduced it, while both reads
passed when signed with the established Developer ID identity. No Keychain trust
or access controls were relaxed. The issue was the local signing test setup,
not a reason to replace the app's secure credential store.

These new disposable packages were **not submitted for notarization**. The
historical public 1.3.2 Gatekeeper result does not notarize this pilot, and this
local hop is not a public release or Windows/Linux acceptance.

## Remaining release gates

Server encrypted recovery, provider email/payment and administration acceptance
are recorded in Platform's current licensing implementation record. Remaining
gates include Cloudflare sustained-load/peak-memory, abuse limits, retention and
recovery objectives; production private feed configuration; notarized signed
hops and Windows/Linux adapters. Keep the distribution gates in
[RELEASING](../RELEASING.md), including the retained VCR font redistribution
question and AppImage runtime/source evidence. No paid release is enabled here.

## November 8 signing-key rotation acceptance

[Sanitized native evidence](../release-evidence/2026-11-08-native-rotation.json)
records new disposable 1.3.2 and 1.3.3 builds signed with the established Volver
Health Developer ID identity, hardened runtime and identical designated
requirements. Source was copied from the current local pilot; public version,
endpoint and updater key stayed unchanged.

The visible license form activated a synthetic complimentary license. Its legacy
token still found the private update after the service introduced a new signer.
After the old signer's deadline was retired, that token failed the update check;
the app continued rendering. Entering the same key in the form reactivated the
same installation under the versioned signer. Authority readback confirmed one
occupied seat and an unchanged installation/revision digest throughout.

The app then installed 99,120,657 signed bytes from 1.3.2 to 1.3.3 in 7.14 seconds.
The replaced executable matched the signed target and passed deep/strict signature
verification. Restart supplied no license key, asserted persisted activation and
completed the authenticated feed check. After stopping the local Workers, the
packaged UI check passed and a visible preset change still rendered offline.

To repeat the rotation phases, add `--rotation-controls` to the existing
complimentary probe. Use `status`, `rotate`, `retire`, and `quit` on its stdin;
the licensing repository's README owns these controls. Use the app form for
activation/reactivation, then the existing updater smoke for install/restart.
Keep the synthetic key outside the repository; do not read or log Keychain tokens.
This run removed its test Keychain record, temporary Worker state, license files
and ephemeral updater private key. No real payment or email was sent. Neither
these local bundles nor their updater were published or notarized.
