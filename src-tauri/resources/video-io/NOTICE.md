# Native video components

ASCII VJ Remix includes the NDI runtime from the standard NDI SDK 6.3.2.
NDI software is proprietary, copyright NDI, Inc. and its licensors, and is
licensed separately from this application's source. NDI® is a registered
trademark of Vizrt NDI AB. Learn about NDI at <https://ndi.video/>.
SDK terms: <https://docs.ndi.video/all/developing-with-ndi/sdk/licensing>.
The complete runtime third-party notices are staged unchanged from the SDK as
`<platform>/NDI-THIRD-PARTY-LICENSES.txt` and included in every app package.

The following terms apply to the bundled NDI components and their protocols:
modification, reverse engineering, disassembly, recompilation, attempts to derive
protocols, circumvention of technical limitations, and removal or alteration of
proprietary notices are prohibited. NDI and its licensors provide these components
without warranties and, to the extent permitted by applicable law, disclaim
liability for direct, indirect, incidental, and consequential damages from use
of the product. Users must comply with applicable United States export laws and
regulations. Third-party developers building products using these components
must obtain and comply with the NDI SDK license, maintain current and complete
NDI compatibility, and include the SDK agreement's section 3(d) requirements in
their end-user license. These restrictions apply to NDI components, not to code
independently developed for ASCII VJ Remix.

macOS builds also include Syphon Framework, copyright 2010 bangnoise
(Tom Butterworth) and vade (Anton Marini), under its BSD license. The complete
notice is in SYPHON-LICENSE.txt. Source: <https://syphon.info/>.

Only runtime libraries are included. SDK headers, sample applications, and NDI
Tools are not distributed with this application. Dependencies are staged at
build time from pinned official sources; see provenance.json.
