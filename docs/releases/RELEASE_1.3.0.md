# 1.3.0 — Native Video I/O

Prepared and deployment authorized: 2026-10-13 (America/Denver).
Status: **published; source, installer and updater gates passed**.
Source: `v1.3.0` at `52c7eedb0886a9e1036f7cf9ffed2376a9caef7f`, merged through
[PR #49](https://github.com/aindaco1/ascii-vj-remix/pull/49).

After reviewing the preparation summary and remaining acceptance checks, the
owner explicitly requested deployment and cleanup. The physical interoperability,
sustained-performance and lifecycle checks below are deferred from this deployment;
they remain unverified. Publication and automated installer/updater acceptance
completed through the established release workflow.

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
| Candidate Desktop CI and development packages | [PR CI](https://github.com/aindaco1/ascii-vj-remix/actions/runs/38501598797) passed all four lanes, the Windows/Linux installer builds and native Pop Out first-frame/reopen checks. Hosted Pop Out used software presentation, not physical GPU acceptance. |
| Exact-main Desktop CI | [All four lanes passed](https://github.com/aindaco1/ascii-vj-remix/actions/runs/38504292662) for the tagged source, including the NDI SDK round trip on all platforms and Windows preset checks. |
| Production packages, public feed and 1.2.0 → 1.3.0 updater | [Release workflow](https://github.com/aindaco1/ascii-vj-remix/actions/runs/38506448310), attempt 2, passed all fifteen jobs, including public installer and updater checks on all three platforms. |
| Independent local Mac acceptance | Public hashes/feed, DMG layout, Developer ID/notarization, nested runtimes/notices and stable identity passed. The actual installed production app updated naturally from 1.2.0 to 1.3.0 and passed the Update/Reports UI check. |

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
passed the SDK round trip and proceeded to package building. The final source
and publication results above describe the shipped version.

The Windows SDK round trip exposed an over-strict test assertion: the received
opaque black pixel was `[0, 0, 0, 254]`, while half-transparent samples remained
128. The SDK fixture now uses the same two-code compression tolerance for all
alpha bands and also checks a fully transparent band. Renderer alpha checks
remain unchanged; this correction does not clamp or alter application pixels.
The next Windows run passed those assertions on 56 frames before the old
eight-second timeout. The integrity fixture now allows 30 seconds for connection
startup and debug-build copies; it still requires 60 valid frames and is not a
performance benchmark.

The first publishing attempt stopped before uploading assets: its isolated
FFmpeg jobs used the combined runtime validator, which also required NDI files
that are staged in the application/package jobs. Workflow-only correction
`5846e0fa91c38e029fc28dc297c0b3d1abf15526` scopes those jobs to the existing FFmpeg
source and runtime checks. Full FFmpeg/NDI/Syphon validation remains in the
package job. The `v1.3.0` tag and application source were not changed.

## Acceptance and Deferred Coverage

The deployment authorization above permitted release with the manual checks still
open. The table retains the required evidence for those follow-ups; it does not
turn unperformed checks into passes. Automated public signing, installer and
updater acceptance passed as recorded above.

| Gate | Result and remaining evidence |
| --- | --- |
| Exact candidate CI | Passed all four lanes, SDK round trips and Windows/Linux development package/Pop Out checks. |
| Transport platform matrix | Deferred: installed Windows/Linux NDI input/output, alpha, resize, reconnect and concurrent Pop Out; Mac transport regression on the public build. |
| Real interoperability | Deferred: named apps/plugins, cross-platform LAN, HX2/HX3 sources and at least one hardware receiver; record version, format and alpha support. |
| Performance | Deferred: 30-minute representative 1080p60 run with received frame rate/age, memory and drops; retain measured limits if the target is not met. |
| Lifecycle and coverage | Deferred: network-permission denial/recovery, firewall recovery, sleep/wake, macOS 13 runtime, representative transparent-media checks across the complete preset catalog, and physical privacy-grant/transport behavior after updating. |
| Distribution | Passed public installer checks, signed/notarized Mac package and signed updater packages. Windows installers retain unsigned-preview status. |
| Updater | Passed downloaded public bytes and real 1.2.0 → 1.3.0 updater hops on all three CI platforms, plus the local production Mac update and relaunch. |

Use [Testing](../TESTING.md#native-video-io) for the existing SDK and installed-app
fixtures. Older physical camera/audio/MIDI/display checks remain in
[Hardware and Platform Checks](../TESTING.md#hardware-and-platform-checks).

## Publication and Local Installation

[Version 1.3.0](https://github.com/aindaco1/ascii-vj-remix/releases/tag/v1.3.0)
was published at 03:56:30 UTC on 2026-10-14 (2026-10-13 in America/Denver) with
fourteen assets. The live `latest.json` matches the tagged manifest and resolves
all nine updater entries to signed 1.3.0 packages.

The first corrected workflow attempt encountered a transient Mac SDK-download
`EHOSTUNREACH` error. The failed job was retried without changing SDK pins or
checksums; successful platform outputs were reused. The second attempt passed
all fifteen jobs. [Desktop CI for the workflow correction](https://github.com/aindaco1/ascii-vj-remix/actions/runs/38506449076)
also passed all four lanes.

The production app in `/Applications/ASCII VJ Remix.app` and the installed Dev
app are both 1.3.0. The local production updater downloaded and verified the
published archive with no forced version override, replaced 1.2.0, retained the
designated requirement, and relaunched successfully. No profile reset was used.
The [publication evidence](evidence/1.3.0-publication.json) records source/tooling
commits, CI jobs, public asset digests, the actual updater result and cleanup.

## Post-release Cleanup

Removed approximately 7.56 GB of local generated files, including the debug
build tree, duplicate exploratory SDK downloads, obsolete installer copies and
old generated test output. Removed thirteen obsolete/redundant Actions artifacts
(1.35 GB) and four caches scoped to merged PR #49 (0.35 GB). Deleted the merged
`feat/native-video-io` branch locally and remotely. `main` is the only branch;
there are no open PRs.

Retained the current production and Dev apps, one signed 1.2.0 rollback copy,
the optimized release build cache, dependencies, frontend bundle, staged native
runtimes, pinned SDK cache, current Windows/Linux Dev installers, current Mac
public packages and NDI/Syphon test tools. Local test packages, rollback and
tools are organized under `/private/tmp/ascii-vj-remix-release-testing`.
Published release history, signing identities, user media/preferences/reports
and other managed worktrees were preserved. The next debug build recreates its
cache; see [Build cleanup](../CONTRIBUTORS.md#build-cleanup).
