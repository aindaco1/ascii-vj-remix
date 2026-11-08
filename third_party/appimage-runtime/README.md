# AppImage runtime and packaging provenance

`inputs.json` pins runtime/AppImageKit commits and source hashes, the amd64
Alpine build image, and the packaging tools used by the locked Tauri CLI.
Moving tool downloads must match the recorded digest; changes fail for review.
No tool binary is committed or included in the source offer.

Run `node scripts/stage_appimage_runtime.mjs` on Ubuntu with Docker. Local
verification can select an existing Podman connection with
`--podman-connection NAME`; it never changes or restarts the shared VM.
The builder reuses the pinned upstream Makefile, libfuse patch and dependency
recipe with checked libfuse/squashfuse archives. It records the linker map and
collects the actual Alpine source recipes, patches, checksum-verified archives
and notices for static musl, zstd, zlib, mimalloc and libgcc. The source bundle
contains the complete pinned upstream sources and the local build recipe.

The launcher is AppImageKit's original shell AppRun, staged in Tauri's cache.
It replaces the opaque old prebuilt AppRun. Generated GTK wrappers are captured
as source alongside the packaged executables and libraries.

Set `LDAI_RUNTIME_FILE` to the absolute path of
`.compliance/appimage-runtime/runtime-x86_64` for both bundling passes. The
existing linuxdeploy output plugin passes it to appimagetool's `--runtime-file`.
Desktop PR CI and release CI perform this setup. Default local development
packaging remains available; it does not replace the distribution gate.

Generated evidence, notices, runtime and source archives stay in `.compliance/`.
Linux source staging and the final artifact check share a verifier that rejects
changed inputs, missing static sources, altered source archives and a runtime
prefix differing from the source-built executable. The sole permitted change is
the 16-byte `.digest_md5` format checksum written by
[the pinned appimagetool](https://github.com/AppImage/appimagetool/blob/8c8c91f/src/appimagetool.c#L1011).
Its location comes from the hashed source-built ELF; all code and other metadata
remain byte-identical. The complete installer is hashed and updater-signed.
After verification, the runtime extracts its own squashfs payload for inspection;
Ubuntu's p7zip-compatible command lacks that decoder. Other installer formats
use the existing configured 7-Zip command.
The native source archive
also covers ELF helpers without `.so` names, distro sources and launcher scripts.
The final payload is verified again after notices are bundled.

Release records identify actual package acceptance. Source capture does not
claim byte-for-byte reproducible binaries or physical Linux acceptance.
