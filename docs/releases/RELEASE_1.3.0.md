# 1.3.0 — Native Video I/O

Prepared: 2026-10-13. Status: **unpublished candidate; acceptance incomplete**.
Branch: `feat/native-video-io`, based on `a524e80` (the published 1.2.0 line).
Review: [draft PR #49](https://github.com/aindaco1/ascii-vj-remix/pull/49).
The owner requested documentation updates and preparation for production.
Publication has not been requested in this preparation step.

## Scope

- Native [NDI®](https://ndi.video/) video input/output on macOS arm64,
  Windows x64 and Linux x64; native Syphon Metal input/output on macOS.
- One selected live input, with independently enabled outputs and concurrent
  Pop Out. Outputs share one finished frame and canonical render parameters.
- Compact Video I/O controls, explicit discovery, source reconnects, output
  name, 720p/1080p and 30/60 fps. Live inputs and outputs reset off on launch.
- Source alpha preserved through WebGPU, WebGL2, Canvas and native output;
  effects and scenes may draw beyond the original source coverage. Opaque black
  remains opaque. Pop Out uses a display background while transports retain alpha.
- Video only. Independent local audio reactivity remains available.
- Pinned NDI SDK 6.3.2 and Syphon revision
  `f4761677a45b8034a3c2069ec0f3d2553da81fba`, bundled notices and nested Mac signing.

The preset contract remains 96 total / 68 accelerated / 28 explicit Canvas.
NDI output is High Bandwidth; HX encoding, transport audio, Intel Mac builds,
multiple transport inputs, WAN bridging and a 4K performance tier are outside
this release. 1080p60 is a target, not an established sustained-performance claim.

See the [User Guide](../USER_GUIDE.md#native-video-sharing) for operation,
[Rendering Engine](../RENDERING_ENGINE.md#native-video-io) for ownership, and
[Security](../SECURITY.md#native-video-transport-boundary) for network boundaries.
NDI® is a registered trademark of Vizrt NDI AB.

## Evidence

The [development record](NATIVE_VIDEO_IO_DEV.md) preserves the original accepted
plan and [2026-10-10 Mac results](evidence/native-video-io-dev.json). These precede
the version bump; they are not evidence of a signed public 1.3.0 package.

| Stage | Result |
| --- | --- |
| Mac SDK peers and installed Dev app, 2026-10-10 | Passed NDI/Syphon input/output, alpha, simultaneous destinations, sender restart/reconnect and input-size changes. |
| Throughput in that pass | 419–429 renders in short 8-second intervals, approximately 52–54 fps; no staging drops. Delivered receiver frame age and sustained 60 fps were not measured. |
| 1.3.0 source/version checks, 2026-10-13 | Passed `release:version:check` and the complete `check:release` gate, including 93 Rust tests; the separately invoked native GPU fixture also passed. |
| Release credentials, 2026-10-13 | Repository secret-presence check passed for updater signing and Mac notarization. This does not validate signed artifacts. Windows remains an unsigned preview. |
| Mac 1.3.0 Dev package, 2026-10-13 | Built, installed and launch-smoked successfully as `com.asciline.remix.dev`; strict signature, runtime/notice contents and macOS 13 minimum metadata passed. |
| Candidate Desktop CI and development packages | Follow the [candidate branch runs](https://github.com/aindaco1/ascii-vj-remix/actions/workflows/desktop.yml?query=branch%3Afeat%2Fnative-video-io) and PR checks for exact commit status and downloadable test installers. A queued/running job is not acceptance. |
| Production packages, public feed and 1.2.0 → 1.3.0 updater | Not run; nothing published. |

The complete static browser smoke passed with no errors, retaining the 96-preset
backend contract. The fresh staged NDI SDK passed a synthetic 60-frame 1080p
round trip with partial alpha and opaque black preserved; CI runs that same
check on every platform. Sanitized [preparation evidence](evidence/1.3.0-preparation.json)
identifies the local source revision and validation limits.

The preparation pass also verified all nine browser alpha fixtures (transparent,
half-transparent and opaque on WebGPU, WebGL2 and Canvas), 245 local Markdown
references and `git diff --check`. Fresh Mac SDK staging matched the pinned
archive/runtime checksums. It now includes and validates the SDK
`NDI-THIRD-PARTY-LICENSES.txt` in addition to application component notices.

The [vendor licensing documentation](https://docs.ndi.video/all/developing-with-ndi/sdk/licensing)
still identifies SDK 6.3.2 as of 2026-10-13. Runtime libraries remain private to
the app bundle; [component notices](../../src-tauri/resources/video-io/NOTICE.md)
and pinned provenance are shipped. The final distribution check must use the
full SDK agreement and the exact packaged libraries, not the web summary alone.

The first Linux SDK round trip received no frames despite successful compilation.
NDI requires Avahi libraries and an active daemon on Linux; those prerequisites
were missing from the CI setup and package metadata. They are now declared in
the Linux packages, CI and AppImage setup instructions. The
[corrected Linux lane](https://github.com/aindaco1/ascii-vj-remix/actions/runs/38498395941)
passed the SDK round trip and proceeded to package building. Final PR checks
remain authoritative for the current candidate.

## Acceptance Before Production

Complete these checks or record an explicit owner-approved deferral with its
scope and any resulting compatibility limits. The preparation request does not
itself waive them.

| Gate | Required evidence |
| --- | --- |
| Exact candidate CI | All four Desktop lanes pass; Windows/Linux development installers contain the pinned runtime and launch successfully. |
| Transport platform matrix | Installed Windows/Linux NDI input/output, alpha, resize, reconnect and concurrent Pop Out; Mac regression on the final candidate. |
| Real interoperability | Named apps/plugins, cross-platform LAN, HX2/HX3 sources and at least one hardware receiver; record version, format and alpha support. |
| Performance | 30-minute representative 1080p60 run with received frame rate/age, memory and drops; retain measured limits if the target is not met. |
| Lifecycle and coverage | Network-permission denial/recovery, firewall recovery, sleep/wake, macOS 13 runtime, and representative transparent-media checks across the complete preset catalog. |
| Distribution | Exact bundled notices/libraries, clean install, signed/notarized Mac package and signed updater packages. |
| Updater | Downloaded published bytes and real 1.2.0 → 1.3.0 update/relaunch on all three platforms; privacy grants and native library loading survive the update. |

Use [Testing](../TESTING.md#native-video-io) for the existing SDK and installed-app
fixtures. Older physical camera/audio/MIDI/display checks remain in
[Hardware and Platform Checks](../TESTING.md#hardware-and-platform-checks).

## Deployment Handoff

1. Resolve the acceptance table above and review the candidate PR.
2. Merge only when production deployment is intended. The existing automation
   waits for successful Desktop CI on the exact `main` commit, creates `v1.3.0`,
   then dispatches the desktop release workflow.
3. Follow the [release guide](../RELEASING.md) for source/runtime packaging,
   Developer ID notarization and updater signing. Do not replace assets under an
   already published tag.
4. Require published-artifact and previous-version updater acceptance, then
   record the exact commit, run URLs, asset digests and platform results here.
5. Update the Changelog publication date and README's published-version statement
   only after publication succeeds. Retain a 1.2.0 rollback installer; a
   corrective release uses a new version rather than overwriting 1.3.0 bytes.

Until then, the public release and updater feed remain at 1.2.0.
