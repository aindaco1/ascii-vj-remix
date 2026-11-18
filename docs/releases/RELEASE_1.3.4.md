# 1.3.4 preview recovery

The maintenance candidate addresses the preview recovery gap tracked in [#55](https://github.com/aindaco1/ascii-vj-remix/issues/55). A single missed WebGPU frame retries in place. Two consecutive submission failures or loss of the shared device stop the affected renderer. The active preview rebuilds on the existing source and can fall back to WebGL2 or Canvas. A transition resolves which renderer owns recovery. The user's backend selection and playback stay with the source.

## Candidate evidence

- Before the change the frame-submission fixture threw on its first missed frame. The regression tests cover transient and repeated failure, decoded-frame cleanup, shared device loss, and teardown.
- The packaged macOS Dev WKWebView painted the image again on the same renderer after one failure, rebuilt WebGPU after repeated failure, then painted with WebGL2 after a second failure. Destroying the shared device during a live crossfade recovered the existing playing video with the requested controls.
- The previous [Desktop run](https://github.com/aindaco1/ascii-vj-remix/actions/runs/44409989489) rejected the three NDI SDK archives. The replacement Apple package is notarized for NewTek, Inc., version 6.4.0.2.261117. The Windows DLL reports 6.4.0.2 and Linux supplies libndi.so.6.4.0. The Apple agreement matches the previously reviewed SHA-256. The Mac round trip received 60 frames at 1920×1080 with transparent, partial and opaque alpha. Archive, runtime and notice digests are in the versioned provenance file.
- The next release stages are green exact-main Desktop CI, signed publication and installer/updater acceptance from 1.3.3. The Windows installer follows the existing unsigned-preview policy, with signed updater packages.

For rollback, install the verified [1.3.3 package](https://github.com/aindaco1/ascii-vj-remix/releases/tag/v1.3.3) and decline the subsequent update. Preserve both signed releases and their manifests.
