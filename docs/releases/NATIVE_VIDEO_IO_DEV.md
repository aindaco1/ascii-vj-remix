# Native Video I/O — Development Candidate

Evidence date: 2026-10-10 UTC. Branch `feat/native-video-io`, based on `a524e80`.
Source version was 1.2.0 for this development pass. Subsequent 1.3.0 preparation
and current gates are tracked in the [release record](RELEASE_1.3.0.md).
This is an installed macOS Dev candidate, not a published release.

## Implemented

- One selected native NDI or Syphon input, integrated with source selection.
- Independent NDI and Syphon output switches, name and 720p/1080p 30/60 settings;
  Pop Out shares the finished native frame. Sharing starts off on a fresh launch.
- Standard NDI SDK 6.3.2 for macOS arm64, Windows x64 and Linux x64; Syphon Metal
  on macOS. Platform SDK archives and runtime hashes are pinned in source.
- Bounded latest-frame input/output storage, three GPU/readback/export slots,
  separate NDI capture/send workers, source generation checks and reconnects.
- Straight RGBA at transport boundaries; coverage separate from glyph selection
  across WebGPU, WebGL2, Canvas and native wgpu. Crossfade mixes premultiplied
  frames. Scenes can generate visible content beyond source coverage.
- No transport audio. Existing independent audio reactivity remains available.
- Nested Mac libraries are signed. Dev installation selects an available Apple
  Development identity because a self-signed certificate has no Team ID and
  cannot satisfy hardened-runtime library validation for dynamic libraries.

## Recorded Local Evidence

Machine and result counts: [structured local evidence](evidence/native-video-io-dev.json).

- Native Rust suite: 93 passed, one GPU-only test excluded from the ordinary run.
- Explicit native GPU fixture: transparent/half/opaque alpha, bounded readback,
  and constant-coverage crossfade.
- Browser GPU/Canvas fixtures: 0/128/255 alpha retained by all three backends.
- Existing spatial smoke and resource/source/output regression checks pass.
- Independent standard NDI SDK peer: 1080p frames, partial alpha, opaque black;
  actual installed-app output received by a separate process.
- Independent public Syphon SDK peer: installed-app 1080p output received.
- Installed app: NDI 1920×1080 and Syphon 640×360 inputs retained alpha 0..255;
  WebGL2 and Canvas paths drove concurrent NDI + Syphon + Pop Out. Closing
  Pop Out left sharing active. Short 8-second intervals produced 419–429 output
  renders with zero reported staging drops on this machine; this is approximately
  52–54 fps, not proof of sustained 60 fps or receiver latency.
- The native pipeline received a three-band transparent source and its output
  was received independently with alpha 0..255. No audio was requested or sent.
- One-minute NDI and Syphon sender restart checks each detected one disconnect
  and one automatic reconnect with zero staging drops. NDI also changed input
  from 1920×1080 to 1280×720 without changing the 1080p output format.
- Installed test peers live in `src-tauri/examples/video_io_probe.rs` and
  `src-tauri/examples/syphon_probe.m`; the installed WebView fixture is described
  in [Testing](../TESTING.md#native-video-io).

## Release Gates Still Open

Windows/Linux source paths and CI staging are implemented, but their installed
builds have not been executed in this local Mac pass. Do not claim a tested
three-platform release until those gates pass. Also outstanding: physical
cross-platform LAN, HX2/HX3 senders, hardware receiver, Resolume/OBS plugin matrix,
30-minute 1080p60 soak with delivered frame-age/memory metrics, permission-denial
and firewall recovery, sleep/wake, macOS 13 hardware, all-preset transparent-media
acceptance, public signing/notarization and a 1.2.0-to-candidate updater hop.
No release, updater feed or production installation was changed.

## Accepted Plan (2026-10-09)

The following is the original accepted plan. Its planning-stage statements are
historical; implementation and evidence above describe this candidate.

### Native NDI and Syphon Scope

Scope agreed on 2026-10-09. Planning baseline: clean `main` at `a524e80`,
source/package version 1.2.0. Proposed version: **1.3.0**, subject to normal
release preparation. This section records a plan, not implemented behavior or
performance acceptance.

### Agreed Product Scope

| Capability | Release scope |
| --- | --- |
| NDI® | Native video input and output on macOS, Windows and Linux. |
| Syphon | Native video input and output on macOS. |
| Inputs | One selected live input at a time, integrated with the existing source/preset workflow. |
| Outputs | NDI, Syphon and Pop Out may run together on macOS; NDI and Pop Out on Windows/Linux. |
| Performance | Target 1920×1080 at 60 fps; verify on named hardware and representative looks. |
| Audio | No transport audio input, output, playback or analysis. Existing independent audio reactivity remains available. |
| Transparency | Preserve existing source alpha. Effects and spatial scenes may add visible content outside the source's original coverage. |
| Compatibility | Standards-based connections to a broad set of apps and devices; publish the exact tested matrix. |

NDI® is a registered trademark of Vizrt NDI AB. See [NDI](https://ndi.video/).

Keep current release architectures: macOS Apple silicon, Windows x86-64 and
Linux x86-64. Intel Mac support, multiple simultaneous transport inputs, Spout,
audio routing, HDR, PTZ/tally controls, WAN bridging, recording and a guaranteed
4K performance tier are outside this release. These exclusions do not remove
existing camera/multi-camera or local media features.

Use the standard NDI SDK initially: High Bandwidth output, with High Bandwidth
and HX2/HX3 reception verified against the chosen runtime and real senders.
HX encoding is not part of the standard output implementation. Alpha is retained
when supplied by the source and supported by the receiving application.
See the [SDK format capabilities](https://ndi.video/for-developers/ndi-sdk/).

### Architecture and Reuse

```text
NDI receiver / Syphon client / existing local source
  -> one source owner, latest frame and frame metadata
  -> existing source adapter + canonical/effective render parameters
  -> existing renderer with preserved alpha
  -> one finished output frame
       -> optional Pop Out presentation
       -> optional Syphon Metal server (macOS)
       -> optional NDI sender (native readback + SDK worker)
```

The main preview retains its existing renderer. The native output render is
shared by the external destinations; there must be no renderer, decoder or
receiver per destination. The existing Canvas/multi-camera mirror remains a
supported producer of finished pixels and is fanned out once. Do not process
those already-stylized pixels through the effects a second time.

Extend the existing source lifecycle, latest-frame slots, parameter coalescing,
transition clocks and camera ownership policy. Keep transport configuration
separate from visual presets and WTF/MIDI mutation. Introduce only a small
native `video_io` module with shared frame metadata/lifecycle plus NDI and
macOS-only Syphon adapters. Keep it product-local until another product has a
real reuse case; no generic plugin system, routing graph, additional process,
new renderer or new FFmpeg network path is needed.

Current code makes three changes necessary:

- `NativeGpuPresenter` owns a window surface, sizes from that window and returns
  without rendering when no drawable is available. Extract its render-to-texture
  work from presentation so sharing does not require an open/visible Pop Out.
  Use a fixed output size/cadence while sharing, scale only for local display,
  and keep the existing Pop Out behavior when sharing is disabled.
- Source capture, frontend parameter synchronization and mirror teardown are
  gated by `nativeOutputActive`. Track whether *any* native output consumer is
  active. Closing Pop Out must not stop a receiver, camera, sender or parameter
  updates still used elsewhere. Release exclusive cameras only after their
  final consumer stops.
- Native decode/upload uses RGB and fills alpha with 255; mirror/preview paths
  can flatten or JPEG-encode frames. WebGPU/WebGL output also writes opaque
  alpha, while `cell.a` carries glyph intensity. Real coverage must be carried
  separately from glyph-selection values and transition opacity.

### Implementation Sequence and Exit Criteria

| Step | Work | Exit criterion |
| --- | --- | --- |
| 1. Dependencies and interop proofs | Pin official NDI SDK/runtime and Syphon framework; review redistribution terms; prove send/receive of an alpha test pattern, wgpu 29.0.3/Metal interop, and bounded NDI readback. Exercise NDI on all three release targets. | Exact dependency versions/provenance recorded; pixels arrive in independent clients; GPU lifetime, alpha convention and packaging approach established. |
| 2. Shared frames and transparency | Add explicit pixel format, stride, dimensions, frame version, rational frame rate, timestamp and alpha representation at the native frame boundary. Preserve alpha in supported local image/video paths and transport frames. Extend shared rendering/Canvas behavior without repurposing `cell.a`. | Opaque regression fixtures remain unchanged; transparent/partial-alpha fixtures render and composite correctly across WebGPU, WebGL2, Canvas and native output. |
| 3. Output lifecycle | Extract one offscreen render target and small destination lifecycle; retain one finished-pixel mirror path; decouple source ownership and pacing from Pop Out. | Output keeps advancing with Pop Out closed/hidden; source changes and transitions work; opening/closing one destination does not interrupt another. |
| 4. Native transport inputs and outputs | Implement NDI discovery/receiver/sender and Syphon directory/client/server; integrate the shared source adapter and output frame. | One input can feed all enabled outputs, including NDI-to-Syphon and Syphon-to-NDI on macOS; reconnect, format changes and shutdown release all resources. |
| 5. Controls, permissions and packages | Add compact source discovery and output controls; stage/sign native dependencies; update policy checks, notices and installer checks. | Packaged apps work without a development SDK or bridge app; transport-off startup preserves ordinary offline behavior. |
| 6. Interoperability and release | Run renderer/transport tests, physical LAN and client acceptance, performance soak, exact-commit CI, package validation and updater hops. | Recorded acceptance matrix supports the advertised scope; prepare 1.3.0 metadata and publish through the existing release workflow. |

These are implementation/review slices, not separate reduced-scope releases.
Do the transport proofs before committing to the complete alpha/output refactor.
If either proof requires a substantially different design, update this plan with
the measured result before expanding the implementation.

### Transport Details

**NDI:** use a small Rust wrapper around the SDK's C ABI. Prefer an app-private,
pinned runtime with explicit capability/version checks and a useful unavailable
state. Discover only when the user opens/selects NDI input or explicitly enables
NDI output. Use SDK discovery and reconnect support rather than custom mDNS.
Keep SDK-owned frame pointers inside native code and release every received
frame. Request BGRA/BGRX or RGBA/RGBX explicitly and progressive video so the app
does not need a new YUV/field-processing implementation. Do not request audio.
See [receive behavior](https://docs.ndi.video/all/developing-with-ndi/sdk/ndi-recv).

Send completed frames from a dedicated worker. Start with synchronous SDK sends
on that worker plus a latest-pending-frame slot; this makes buffer ownership
simple while keeping sends off rendering/UI threads. Use a small fixed GPU
readback ring with nonblocking completion, drop stale pending frames, and never
overwrite in-flight storage. Only adopt SDK asynchronous sends if measurements
justify them, with the documented buffer-retention/flush rules. Preserve
timestamps and rational rates, and avoid two competing frame clocks. NDI's
[send API](https://docs.ndi.video/all/developing-with-ndi/sdk/ndi-send) supports
these approaches. A 1080p60 four-byte readback alone moves about 498 MB/s before
extra copies; that is memory traffic, not the NDI network bitrate.

**Syphon:** bundle the pinned BSD-licensed framework and add a narrow Objective-C
bridge using the existing `cc` build pattern. Use its Metal client/server API on
the same device as wgpu. Prove import/export lifetime and GPU synchronization
before relying on native texture handles. A GPU copy into a retained texture is
acceptable; avoid CPU readback in the native Syphon path. Its publishing API may
copy a texture internally, so do not advertise literal end-to-end zero-copy.
Reuse native readback only where the WebView preview/Canvas backend needs pixels.
See [Syphon](https://syphon.info/), its
[Metal server](https://github.com/Syphon/Syphon-Framework/blob/main/SyphonMetalServer.h),
[Metal client](https://github.com/Syphon/Syphon-Framework/blob/main/SyphonMetalClient.h)
and [wgpu native texture import](https://docs.rs/wgpu/29.0.3/wgpu/struct.Device.html#method.create_texture_from_hal).

**Preview and fallbacks:** reuse the source interface, but do not reuse the
file decoder's multi-frame playback queue for live input. Deliver only the latest
version through bounded binary pixels when WebView transfer is necessary, with
one read in flight. Preserve RGBA; the existing JPEG camera bridge cannot carry
alpha. Measure full-resolution and Canvas paths explicitly; do not silently
downscale transmitted output to pass the 1080p target. Background throttling of
the WebView/mirror is a release test, not an assumed solved case.

**Recovery:** keep discovery identity separate from display names; handle
duplicate names, removed/restarted senders, resolution/rate changes and permission
denial. Exclude this instance's own senders from source selection to prevent
immediate self-feedback. On source loss, report Disconnected, hold the last frame
briefly, then output a transparent frame and retry with bounded backoff; make
the exact timeout a named shared policy. Destroying or switching sessions must
invalidate late callbacks and join/stop workers safely.

### Transparency Contract

Use one documented alpha convention internally and explicit conversion at each
boundary. NDI BGRA/RGBA is **straight alpha**, as defined in its
[frame types](https://docs.ndi.video/all/developing-with-ndi/sdk/frame-types).
Verify Syphon conventions with independent clients; handle WebView premultiplication
explicitly. Never infer transparency from black pixels.

Opaque sources keep today's visual result. For sources with alpha, preserve
coverage through sampling, geometric mapping, glyph/background composition,
transitions and feedback history. Effects may add their own coverage, as requested;
do not clip the entire result to the original source mask. Do not accidentally
make all output opaque because of a presentation clear or background fill.
Keep media coverage, glyph intensity, effect coverage and transition opacity
distinct. Composite over a preview background only at presentation time; send
the unflattened result to NDI/Syphon. Existing supported local formats preserve
alpha where their decoder supplies it; adding new alpha codecs is separate work.

### Controls and Policy

- Add NDI and, on macOS, Syphon to the source chooser with a source list,
  refresh/reconnect and compact connection status. Do not expose the unrelated
  development ASCILINE Stream source or add seek controls to live inputs.
- Add independent NDI/Syphon output toggles, one shared output name, resolution
  and frame rate. Start with 720p/1080p and 30/60 output choices; preserve incoming
  rational timing and test 29.97/59.94 sources. Remember configuration but leave
  sharing disabled on fresh launch. Unsupported platforms must not offer Syphon.
- Show connection/error state separately from the user-owned Stats Overlay;
  frame rate, stale drops and transport timing can extend its bounded diagnostics.
  Keep source names, IP addresses and raw media out of uploaded reports.
- Treat enabled NDI as an explicit user-directed LAN-media exception to the
  current offline policy. Native SDK networking does not require broadening the
  WebView CSP or enabling network protocols in bundled FFmpeg. Preserve narrow,
  main-window-only commands and validate sizes, strides, names and allocation
  limits in Rust. Keep LAN access off when transports are off.
- Add an accurate macOS local-network usage description and verify Bonjour
  declarations for the pinned SDK. Test permission denial/recovery under stable
  Dev and production identities. Verify Windows firewall behavior and Linux
  Avahi/service dependencies in installed packages. Apple's
  [local-network guidance](https://developer.apple.com/documentation/technotes/tn3179-understanding-local-network-privacy)
  and NDI's [platform requirements](https://docs.ndi.video/all/developing-with-ndi/sdk/platform-considerations)
  inform those checks.

### Packaging and Acceptance

NDI's current [licensing page](https://docs.ndi.video/all/developing-with-ndi/sdk/licensing)
describes the SDK as royalty-free subject to its terms/exclusions and points to
the 6.3.2 SDK agreement. Review that exact agreement and third-party terms before
redistribution; the SDK archive/agreement has not been acquired in this planning
pass. Implement required in-app/documentation links and trademark attribution;
bundle permitted runtime components, not NDI Tools. Preserve Syphon's BSD notice
and the repository's existing license. Pin hashes and architecture/deployment
targets, validate dynamic-library paths, sign nested Mac code, and include runtime
files in installers and updater archives. Preserve the macOS 13 deployment floor
unless a separately agreed change is necessary. Do not weaken library validation
just to accommodate legacy HX1 decoding.

The implementation should change these existing owners and add only the small
native transport/bridge modules and focused test fixtures:

| Area | Owners |
| --- | --- |
| Source/output controls and lifecycle | `app.js`, `index.html`, `style.css`, `renderers/desktop/tauri-adapter.js`, `renderers/gpu/media-source.js` |
| Native frames, offscreen output and transports | `src-tauri/src/native_output.rs`, `src-tauri/src/native_output/gpu.rs`, `src-tauri/src/media_engine/ffmpeg.rs`, `src-tauri/src/desktop_bridge.rs`, new `src-tauri/src/video_io/`, narrow bridge under `src-tauri/native/` |
| Shared coverage/rendering | `renderers/shared/`, `renderers/gpu/ascii/renderer/`, existing Canvas renderers, native shared shader integration |
| Commands, dependencies and artifacts | `src-tauri/src/lib.rs`, `src-tauri/build.rs`, `src-tauri/Cargo.toml`, capability/permission files, Tauri configs, `Info.plist`, existing build/release checks and workflows |
| Durable docs | User Guide, Rendering Engine, Security, Performance, Testing, Contributors and Releasing; version evidence in the release records once a candidate exists |

Acceptance must include:

- Unit/contract tests for bounded frames/queues, stride and channel order,
  session cancellation, source identity, resource release and alpha conversions.
  Compile unsupported-platform stubs without a Syphon dependency. Use transport
  doubles for lifecycle tests and real SDK tests for actual frame delivery.
- Pixel fixtures with opaque color bars, fully transparent frames, partial alpha,
  soft edges, black opaque content, orientation marks and frame counters.
  Composite received output over light and dark backgrounds. Exercise all 96
  presets, Canvas fallbacks, scenes/accents, trails and crossfades. Transparency
  and legitimate black must not trigger WTF visibility recovery incorrectly.
- Run existing targeted gates: `test:rust`, `test:media-source-policy`,
  `test:output-display`, `test:render-math`, `test:renderer-resources`,
  `test:spatial`, `smoke:primary-presets`, `smoke:native-output`, `smoke:ui-perf`
  and relevant static/alpha fixtures, then the maintained release gate.
- Independent peers: official NDI SDK examples/monitor tools, Syphon Simple
  Client/Server, [Resolume](https://resolume.com/support/NDI_inputs_and_outputs)
  and [OBS with DistroAV](https://github.com/DistroAV/DistroAV). Record exact app,
  plugin/runtime and OS versions; also test one real HX2/HX3 sender and one
  hardware NDI receiver before making hardware compatibility claims. Test NDI
  across each platform pair on a physical LAN, not just localhost or app loopback.
- Optimized-build 1080p60 soak for at least 30 minutes with input + all applicable
  outputs + main preview, with an external receiver frame counter. Measure actual
  delivered fps, frame-age/latency, UI response, stale drops, CPU/GPU and memory
  against transports-off baseline. Demand bounded memory/queues and no accumulating
  latency; publish limits by renderer/source/hardware rather than claiming every
  look runs at 60 fps. No hidden quality or resolution reductions.
- Disconnect/reconnect peers and network, resize/reformat input, switch sources
  and presets, toggle each destination, close/reopen Pop Out, background the app,
  sleep/wake and quit during transfer. Verify no stale frames from old sessions,
  leaked servers, camera ownership regressions, crash or deadlock. Confirm no
  transport audio is captured or sent and ordinary offline launch still works.
- Use actual packaged builds for macOS signing/notarization, Windows/Linux
  runtime loading, clean installs and a 1.2.0-to-candidate updater hop. CI, local
  renderer results and physical interoperability remain separate evidence in the
  eventual release record. Unavailable hardware is recorded as untested.
