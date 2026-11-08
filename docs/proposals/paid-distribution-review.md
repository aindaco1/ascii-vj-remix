# Paid distribution: draft terms, Entitle eligibility, and release obligations

Reviewed November 4, 2026 against ASCII VJ Remix
`eebf5bdca6c88c66a04cacd9a2a8256112880fdb` and published version 1.3.2.
Publisher: **Fumblers LLC dba Dust Wave**.

Status: proposed customer language and a source/artifact investigation. These
terms are not published, accepted by customers, or a replacement for the root
[LICENSE](../../LICENSE). No application, license, installer, or live Store
configuration was changed. This is not a legal opinion or complete legal
clearance of every dependency; custom wording and final terms need legal review.

The intended offer covers future official builds, updates, and support through
Store. It includes monthly/annual subscriptions, complimentary access, and
one-time term/major-version/lifetime update policies. Normal subscription expiry
does not disable installed functionality. The existing use restriction remains.

## 1. Draft customer language

### Product page and checkout disclosure

> **Use restriction: no advertising or sponsored content.** ASCII VJ Remix
> includes software under an MIT-derived license with an Anti-Advertisement
> Restriction. Do not use the application to create, process, deliver, or display
> material for digital advertising, sponsored content, or commercial promotion.
> This includes promotional brand visuals, sponsor placements, advertising
> displays, and marketing videos. Buying the application, updates, or support
> does not remove this restriction. Read the full software license and the
> prohibited-use examples before purchasing.

Editorial note: “create” and “process” describe our conservative application of
the inherited restriction to content intended for prohibited delivery/display.
Those verbs are not additional words in the upstream clause. Do not present
these examples as a rightsholder-approved interpretation or a new license.

### Full prohibited-use notice

> **Publisher and scope.** Fumblers LLC dba Dust Wave provides official ASCII VJ
> Remix builds, updates, and support. Access to those services is separate from
> the software licenses included with the application. Your purchase does not
> grant an exception to the inherited Anti-Advertisement Restriction.
>
> **Prohibited uses.** Do not use ASCII VJ Remix, or inherited code covered by
> that restriction, for advertising, sponsored content, or commercial marketing
> directed to end users. Examples include:
>
> - Creating or processing visuals intended for digital advertisements,
>   promotional videos, product launches, or marketing campaigns.
> - Displaying promotional brand or product visuals in retail signage,
>   trade-show booths, sponsored installations, or other advertising displays.
> - Delivering sponsor messages, paid brand placements, or promotional overlays
>   during performances, livestreams, broadcasts, or recorded content.
> - Using the application for self-promotion or client promotion when the
>   purpose is commercial marketing.
> - Incorporating covered application code into an advertising-delivery system,
>   marketing service, or ad-supported interface that displays advertisements
>   to its users.
>
> These examples are illustrative, not exhaustive. Routing output through
> another application, recording it first, or having someone else deliver it
> does not establish an exception for an advertising or marketing workflow.
> A paid engagement or ticketed performance is not, by itself, enough to decide
> whether a use is prohibited; the purpose and content of the particular use
> matter. We do not promise that every commercial creative project is allowed.
>
> **Uncertain uses.** If your proposed use may involve advertising, sponsorship,
> or commercial promotion, do not rely on the purchase as authorization. Obtain
> clarification or a separate permission from the relevant rightsholder before
> using the application for that purpose. Dust Wave does not grant an exception
> to restrictions imposed by another rightsholder.
>
> **Expiry and license conditions.** Expiration of update or support coverage
> does not disable an already installed build. It does not remove the software's
> license conditions. The inherited license provides for immediate termination
> upon a prohibited use; continued technical operation is not permission to use
> the software after its license has terminated.
>
> **Preserved rights and separate components.** This notice explains the
> inherited application restriction. It does not replace the complete license,
> retract rights already granted by it, or impose this restriction on the
> independent use of separately licensed components. Those components retain
> their own licenses, notices, and source-code rights. Dust Wave's update/support
> terms do not restrict rights granted by those component licenses. Support
> purchased from Dust Wave is provided by Dust Wave, not by upstream authors.

Do not add a blanket ban on copying, modification, reverse engineering, or
redistribution to this draft. Such language could conflict with the retained
project license and LGPL/MPL components. Any NDI restrictions must be expressly
limited to the proprietary NDI components and applicable protocols.

### Short in-app wording

Keep legal/settings text factual; do not add marketing or purchase prompts.

> Updates and support: covered through [date].
>
> Coverage has ended. This installed version remains available for use subject
> to its software licenses. [View coverage] [Software licenses]
>
> Advertising, sponsored-content, and commercial-marketing uses are restricted.
> [Read use restrictions]

Use only the applicable coverage sentence, replacing the bracketed date/links
with actual state and destinations. Major-version and lifetime offers need
their corresponding factual coverage description. Do not promise continued
use after a license-condition breach, only after ordinary coverage expiry.

### Placement and record

Show the short disclosure on the software product page and beside the software
line in checkout, with the full license and notice accessible before payment.
In a mixed merch/ticket/software order, associate the disclosure with the
software item; do not impose software restrictions on unrelated merchandise.
Record the accepted notice version and software offer in the existing order
snapshot/terms mechanism. Include a local copy with every installer and update,
and make it reachable offline. Do not invent a parallel legal-document service.

These disclosures cannot independently cure a prohibited product feature,
authorize a customer's prohibited use, or satisfy missing third-party notices.
They communicate the restriction; they are not a compliance guarantee or a
requirement to monitor customers' media.

## 2. Entitle publisher-use eligibility memo

Reviewed Entitle revision:
[`9bc5afe6a99b9e23cf41bb92042dddf15c6b8e54`](https://github.com/doublesharp/entitle/tree/9bc5afe6a99b9e23cf41bb92042dddf15c6b8e54).
Authority: [Elastic License 2.0](https://github.com/doublesharp/entitle/blob/9bc5afe6a99b9e23cf41bb92042dddf15c6b8e54/LICENSE),
[Publisher Use Permission 1.0](https://github.com/doublesharp/entitle/blob/9bc5afe6a99b9e23cf41bb92042dddf15c6b8e54/ADDITIONAL-PERMISSION.md),
and [NOTICE](https://github.com/doublesharp/entitle/blob/9bc5afe6a99b9e23cf41bb92042dddf15c6b8e54/NOTICE).

**Conclusion:** the confirmed product-control facts support treating ASCII VJ
Remix as Fumblers LLC's “Your Software” under section 2 and operating a dedicated
Entitle adaptation for it under section 1. This is a documented interpretation
of the published permission, not separate written approval from Doublesharp.
No Entitle fork/service has been created or deployed by this review.

The relevant maintained derivative is **ASCII VJ Remix**, the product being
licensed. Maintaining a derivative of **Entitle**, the licensing service, does
not itself establish publisher eligibility.

| Requirement | Recorded basis and scope |
| --- | --- |
| Product ownership or exclusive control of development and commercial terms | On November 4, 2026, the publisher confirmed that Dust Wave alone controls the official ASCII VJ Remix roadmap, release decisions, pricing, and support terms; no client or partner holds approval/control rights. This memo relies on the control route, without claiming ownership of all upstream code. |
| Maintained product, rather than third-party resale | ASCII VJ Remix has its own Tauri application, GPU/native rendering, MIDI/video integration, product identity, changelog, signed-release workflow, and support policy. These are documented in the [README](../../README.md), [architecture](../RENDERING_ENGINE.md), and [release guide](../RELEASING.md). It is not merely an unchanged ASCILINE distribution sold for another publisher. |
| Exclusive control concerns this official product | Upstream licenses constrain permitted conduct and others can make independent forks. They do not, on the confirmed facts, give another party control over Dust Wave's official roadmap, releases, pricing, or support. This is the interpretive basis; it is not a claim that the inherited software is exclusively owned or licensed. |
| Permitted service audience and functions | Section 1 permits buyer portals, checkout, licensing, activation, updates, downloads, and support for the publisher's own product. Customers are buyers of ASCII VJ Remix, not independent software publishers using our infrastructure for their products. |
| Infrastructure and contractor control | Proposed Cloudflare accounts, customer data, keys, and service administration remain under Fumblers LLC's control. Contractors act on its behalf. Section 3 does not authorize a contractor-operated shared publisher service. |
| Mixed Store payment | Store may sell the publisher's merch, tickets, and software together. The Entitle adaptation receives the software entitlement and necessary identity/payment references; it is not a marketplace or licensing service for other sellers. Payment-processing fees do not defeat eligibility under section 2. |
| Adaptation and pricing changes | Sections 4 and 6 permit the relevant product licensing/limit changes and public/private forks. Preserve required notices, identify the modified service prominently, and document departures from upstream behavior. |

For a future Entitle-derived repository, retain LICENSE, ADDITIONAL-PERMISSION.md,
NOTICE, upstream revision, and a modification notice identifying the Cloudflare
port and Store integration. Do not relabel server code MIT or move it into
Platform's MIT packages. Preserve separately applicable MIT example notices;
apply the additional 0BSD grant only to generated first-party integration code
actually covered by it. Neither grant covers third-party dependencies.

Reopen this eligibility review if another organization controls the product,
the infrastructure becomes a licensing platform for independent publishers,
or the license/version used changes. Section 7 excludes that independent
publisher service. Adding another genuinely Dust Wave-controlled product is
within the intended publisher model, but requires its own provenance review.

## 3. Distribution investigation

### Evidence and limits

Downloaded all seven substantive 1.3.2 installer/update artifacts directly from
the [published release](https://github.com/aindaco1/ascii-vj-remix/releases/tag/v1.3.2)
and matched each SHA-256 to GitHub's release asset digest. Inspected Mac DMG and
app archive, Windows NSIS and MSI payloads, and Linux deb, rpm, and AppImage
inventories without installing or running the application. MSI extracted names
are opaque cabinet identifiers; notice contents were identified by text/hash,
not inferred from those names.

The [evidence JSON](evidence/paid-distribution-2026-11-04.json) records artifact
digests, notice inventories, SDK pin, and dependency-license candidates. It is
an investigation record, not an SBOM or execution/signing acceptance report.
Embedded compressed assets were not comprehensively decoded; absence findings
refer to standalone packaged notices plus the inspected source/build paths.

| Component | Observed evidence | Obligation and action |
| --- | --- | --- |
| ASCILINE-derived application | No standalone copy of the root custom license found in the inspected artifacts. The MIT license that is present belongs to Platform. Build resource/copy lists omit the root license. | Package the unchanged root license, copyright, and restriction in every format; expose it offline. A Platform license cannot substitute for it. |
| Platform desktop primitives | Platform LICENSE and desktop-core NOTICE are present. | Preserve both at the pinned revision. Existing coverage is specific to Platform, not the rest of the dependency graph. |
| FFmpeg/ffprobe 8.1.2 | All targets have a short NOTICE and provenance, but no standalone full LGPL text. The 14 release assets contain no FFmpeg source bundle or source offer. Current staging writes only binaries, manifest, and the short notice. | Include full applicable license/copyright notices and offer complete corresponding source/build material for the exact distributed sidecars. The upstream archive URL and build script alone do not establish that delivery. See below. |
| GNU Unifont 17.0.05 glyph assets | Local repository has the dual-license explanation and OFL text; these are not explicitly packaged. The application converts glyphs into a neutral atlas. | Document use of the available OFL-1.1 path for font-derived assets, include actual copyright/author notices and OFL, retain provenance and applicable reserved-name rules. Do not use the generic placeholder copyright header as the only attribution. |
| VCR OSD Mono 1.001 UI font and derived assets | Bundled font metadata names MrManet, but has no copyright/license-name-table entry. Its author identifies commercial use as free on DaFont; no local distribution/embedding permission record was found. | Preserve the author statement and exact font provenance. Resolve bundled font-file/atlas redistribution scope with an adequate permission record or replace with an explicitly licensed alternative before relying on it for paid distribution. Do not label it MIT/OFL or infer public domain. |
| NDI SDK 6.3.2 runtime | Component notice and complete runtime third-party notices are present; source includes the nearby NDI link and trademark metadata. Pinned SDK agreement was independently downloaded, hash-verified, and read. | Preserve notices, required end-user terms, compatible current SDK, permitted runtime files, and trademark/link requirements. See NDI findings below. |
| Syphon | Complete framework license and attribution are present in Mac distribution. | Preserve its three-clause BSD notice/disclaimer and no-endorsement condition. It is not a two-clause license. |
| Rust/Tauri/JS dependencies | No comprehensive dependency notice collection found. macOS-target Cargo metadata resolves 417 packages including build/dev tools; MPL and several other license families are present. | Generate a reviewed, target-specific shipped-dependency inventory, notices and necessary source materials. Metadata counts are not proof that all packages are shipped. |
| AppImage bundled system/runtime libraries | 190 path entries contain .so, including version aliases, with WebKit/JavaScriptCore, GTK/GLib, GStreamer and other libraries. Ten distro copyright files are included; they do not establish complete coverage. | Inventory exact bundled versions and patches, include applicable license texts and provide required sources/replacement rights. Do not rely on the host to supply notices or source for libraries actually redistributed inside AppImage. |
| Demo/test media | All targets include demo-video-2.mp4/.webm and point-click-test.mp4/point-click-test-30s.mp4, including fixtures not normally exposed as demo choices. | Publisher clarified on November 4, 2026 that the identified footage is public domain. The attestation and exact filenames are retained in `media/PUBLIC-DOMAIN.md`. This is a publisher attestation, not independent chain-of-title review. Consider excluding unnecessary fixtures from production separately. |
| ascii.today-inspired character ramps | Source documents short symbol-vocabulary ramps and credits, not bundled original FIGlet font files. | Preserve provenance/credits. Reassess if original fonts or additional material are imported; do not assume the site license covers every original font. |

### FFmpeg and source availability

The inspected build script disables shared libraries, enables static FFmpeg
libraries, and does not enable GPL/nonfree/version3 options. The FFmpeg libraries
are linked into the ffmpeg/ffprobe sidecars; this is not evidence that ASCII VJ's
main executable statically links FFmpeg. Preserve the subprocess boundary.

[LGPL 2.1 sections 4–6](https://github.com/FFmpeg/FFmpeg/blob/n8.1.2/COPYING.LGPLv2.1)
govern source delivery and, where applicable, rebuilding/relinking and
modification/reverse-engineering rights. A practical path is a versioned source
bundle alongside the binary distribution: exact FFmpeg source, any patches,
configure/build scripts and needed inputs, full licenses, build manifest, and
instructions sufficient for the applicable rebuild/relink obligation. Retain
notices for enabled third-party code, including any required IJG acknowledgement
identified by [FFmpeg's license guide](https://github.com/FFmpeg/FFmpeg/blob/n8.1.2/LICENSE.md).
Do not introduce an automatic whole-app GPL conclusion from these sidecars.

For future Cloudflare distribution, keep compliance sources and notices
available without requiring a current paid subscription. Public immutable
compliance downloads are the simplest delivery policy; paid application bytes
can remain private. State the source location in the installer/legal view and
download page. A repository link or a filename containing a version is not
verification that the exact required materials are available. Do not promise a
three-year written source offer without implementing and retaining that offer.

The same review applies to currently distributed free builds: charging money
does not create these obligations. Plan additive compliance materials and a
corrected release through the normal process; do not silently replace signed
assets or invalidate existing updater signatures.

### Other source and notice obligations

The normal macOS dependency traversal includes MPL-2.0 candidates cssparser
0.36.0, selectors 0.36.1, dtoa-short 0.3.5, option-ext 0.2.0, and the
cssparser-macros 0.6.1 build-time macro candidate. Determine final inclusion;
do not count a macro package as distributed runtime code without evidence.
For covered distributed code, [MPL section 3](https://www.mozilla.org/en-US/MPL/2.0/)
requires available covered source and information telling recipients how to
obtain it. This is file-level coverage, not a requirement to relicense all
ASCII VJ code. Preserve source rights in any customer agreement.

The graph also contains MIT/Apache, BSD, ISC, Zlib, Unicode-3.0 and
CDLA-Permissive-2.0 notices. Some expressions are conjunctive, including ring's
Apache-2.0 AND ISC; choosing one license is only valid for an actual alternative
grant. Collect exact dependency notices, not just one generic MIT text. Resolve
Windows/Linux separately and include native libraries added by packaging.

[Unifont](https://www.unifoundry.com/unifont/) offers the font under OFL-1.1 as
well as GPL with a font exception. Use the documented font license route, not a
claim that all font tools are permissively licensed. The
[OFL](https://openfontlicense.org/open-font-license-official-text/) permits
bundling with software subject to its terms; preserve the font license and
reserved-name conditions for modified/converted assets. The VCR author's
[February 24, 2017 statement](https://www.dafont.com/font-comment.php?file=vcr_osd_mono)
supports commercial use, but does not expressly spell out app embedding or
redistribution of the font file.

AppImage needs special attention because it redistributes dependencies that
deb/rpm may obtain from the operating system. Review exact components against
their own licenses; [WebKit](https://webkit.org/licensing-webkit/) includes
LGPL/BSD material and [GStreamer](https://gstreamer.freedesktop.org/documentation/frequently-asked-questions/licensing.html)
describes its LGPL distribution model. Some included distro copyright files
refer to /usr/share/common-licenses, which is not present in the AppImage
inventory. Do not treat those references as bundled full license texts.

### NDI findings and end-user terms

The inspected Apple SDK archive matches the project's 6.3.2 SHA-256 pin. Its
agreement allows qualifying general-purpose desktop/laptop products and
contains exclusions for fixed-purpose hardware and restricted virtual/cloud
environments. Keep NDI video processing in the user's desktop application.
The licensing Worker should store/deliver opaque release bytes; this review
does not authorize an NDI renderer or streaming service on Cloudflare.

The SDK requires continued current/complete NDI compatibility and a current SDK
at distribution. Recheck the exact available version and terms at each release;
a historical hash match is not a permanent exemption. Preserve the runtime
third-party notices, no NDI Tools/SDK-header redistribution, nearby ndi.video
links, copyright and trademark attribution, and the no-endorsement rule.
The [vendor licensing page](https://docs.ndi.video/all/developing-with-ndi/sdk/licensing)
also leaves applicable codec patent licensing with the product publisher; a
royalty-free SDK is not a blanket codec-patent clearance.

The agreement's paragraph 3(d) requires end-user agreement terms addressing
NDI-only modification/reverse-engineering/protocol restrictions, circumvention
and notice protection, NDI/licensor warranty and liability disclaimers, US
export compliance, NDI copyright, and onward SDK obligations for developers.
The existing [component notice](../../src-tauri/resources/video-io/NOTICE.md)
substantially addresses these subjects. Incorporate the reviewed terms into the
actual customer-facing component agreement and make them locally accessible;
file presence alone does not establish the presentation/agreement requirement.
Confirm coverage against the pinned full agreement before release.

Do not extend these NDI-only restrictions to FFmpeg, MPL source, or all app
code. Record any applicable SDK registration/authorized-use documentation in
the publisher's private records; no vendor correspondence was inspected or sent.

## 4. Actionable remediation sequence

1. **Consumer documentation:** review the draft above, preserve the full root
   license, and version the accepted disclosure. Confirmed publisher/control
   and media-rights facts are recorded here; no replacement license is needed
   merely to charge for official builds/support.
2. **One legal resource collection:** create a consumer-owned licenses folder
   containing the app license, original component notices, copyright records,
   and a generated reviewed dependency index. Reuse it for installers and the
   offline legal view. Keep product terms out of Platform primitives.
3. **One compliance publication step:** produce matched source/notice bundles
   from the same locked build inputs. Cover FFmpeg, distributed MPL code and
   AppImage-native libraries, including applicable patches and rebuild inputs.
   Exclude proprietary NDI SDK source/tools and all credentials. Publish only
   the materials whose distribution is authorized and required.
4. **Resolve remaining rights evidence:** complete VCR font redistribution
   scope, actual Unifont attribution, the final per-target dependency/SBOM
   review, and NDI customer terms/SDK applicability. Preserve media permission
   evidence without committing private contracts.
5. **Artifact acceptance:** fail release if required notices or source links
   are missing. Inspect DMG/app updater, EXE/MSI, AppImage/deb/rpm after packaging;
   check actual bytes and accessible offline text, not only config entries.
   Verify sources remain available after subscription expiry and that an update
   preserves the legal resources. Test notice tampering/omission failures.
6. **Release and Store rollout:** repair existing distribution through the
   established release process, then enable paid offers only after the above
   findings are resolved or supported by a documented legal determination.
   Publish no unrestricted-commercial-use claim and no in-app advertising.

The implementation remains a separate task. This investigation does not alter
the public free release, sign new artifacts, publish terms, contact rightsholders,
or assert that the current packages have passed a full legal audit.


## Implementation update — November 4, 2026

Consumer-owned remediation is now implemented locally: bundled root/FFmpeg/
Unifont/NDI/Syphon/Platform notices, locked dependency license collection and
source archives, offline license display, archive hashes and release payload
checks. The demo-footage classification is public domain, as clarified by the
publisher. See [distribution procedure](../RELEASING.md#distribution-notices-and-corresponding-source).

The user chose to retain VCR OSD Mono pending explicit redistribution evidence.
Its notice records the actual commercial-use statement without inventing a
broader license. Paid distribution still requires that evidence. AppImage runtime
source provenance and Windows/Linux packaged acceptance also remain open;
local tooling is not proof that every release obligation is complete.
