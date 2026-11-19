# 1.3.4 preview recovery

ASCII VJ Remix 1.3.4 was published on 2026-11-19 UTC at commit `4bd9e2060606c679198413e70560042dad3ae449`. The patch recovers a stalled WebGPU preview and bundles NDI 6.4.0. [Public release](https://github.com/aindaco1/ascii-vj-remix/releases/tag/v1.3.4) · [Acceptance receipts](evidence/1.3.4-publication.json)

## Renderer and NDI

- Before the fix, one failed frame submission threw in the regression fixture. The packaged Mac development build now retries a missed frame in place. After repeated failures or device loss it rebuilds WebGPU once, then can paint with WebGL2 or Canvas. Injecting device loss during a video crossfade preserved the source, playback, controls and requested backend. Changing the backend during recovery discarded the stale renderer. The trigger of the two original production reports remains unconfirmed. [Issue #55](https://github.com/aindaco1/ascii-vj-remix/issues/55) · [Implementation and tests](https://github.com/aindaco1/ascii-vj-remix/pull/63)
- During a physical Mac sleep/wake check, the visible video was playing before sleep. After a 33.64-second suspend gap and return to the foreground, the same source was playing on WebGPU. Its clock advanced from 0.686 to 9.654 seconds and its frame count from 34 to 446. The independent packaged renderer checks also passed for both fallback backends.
- All four runners rejected the previous NDI download pins. The reviewed SDK 6.4.0 archives, runtimes and notices passed verification on all four runners. The notarized Apple installer identifies NewTek, Inc. and version 6.4.0.2.261117. Its agreement matches the previously reviewed SHA-256. The Windows DLL reports 6.4.0.2 and Linux ships `libndi.so.6.4.0`. A Mac NDI loopback received 60 frames at 1920×1080 with transparent, partial and opaque alpha. [Failing checks](https://github.com/aindaco1/ascii-vj-remix/actions/runs/44409989489) · [Passing NDI checks](https://github.com/aindaco1/ascii-vj-remix/actions/runs/44417199466) · [Pinned vendor digests](../../src-tauri/resources/video-io/provenance.json)

## Published artifacts and updates

The PR and merged commit had identical source trees. Both passed all four Desktop jobs before the tag was published. All 15 release jobs passed, including the public 1.3.3 → 1.3.4 installer/updater checks on macOS, Windows and Linux. [PR CI](https://github.com/aindaco1/ascii-vj-remix/actions/runs/44420488236) · [Merged commit CI](https://github.com/aindaco1/ascii-vj-remix/actions/runs/44450817713) · [Release workflow](https://github.com/aindaco1/ascii-vj-remix/actions/runs/44452865398)

Independent public downloads matched GitHub's size and SHA-256 for all 22 assets. Each of the 4 corresponding-source archives matched its published digest and internal file manifest. All 9 public updater entries referenced the expected tagged assets and signatures.

On the physical Mac, a disposable copy of the signed 1.3.3 app used the public feed. The first transfer was interrupted after roughly 5.0 MiB of TLS traffic and stopped before installation. The same app retried at a 1.56 MiB/s limit, downloaded 71,771,623 signed bytes and installed 1.3.4 in 97.8 seconds. The updated app passed Gatekeeper and launched as 1.3.4. The public DMG passed Developer ID, stapled-notarization and Gatekeeper checks. Its app and the updated installation had the same production signing identity and designated requirement.

Windows installers retain the unsigned-preview policy. Windows updater packages are signed. Physical Windows/Linux camera, audio, MIDI and GPU acceptance remains on the [roadmap](../ROADMAP.md#distribution-and-platform-validation).

## Rollback

Quit the app, install the [official 1.3.3 package](https://github.com/aindaco1/ascii-vj-remix/releases/tag/v1.3.3) for the same platform, then decline the offered update while testing. Both tagged releases and their signed update assets remain available.
