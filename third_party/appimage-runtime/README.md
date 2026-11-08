# AppImage runtime provenance — pending

The ELF launcher before the squashfs filesystem is not covered by collecting
`.so` files. The current AppImage type-2 runtime statically links musl, libfuse,
squashfuse, zstd and zlib; its MIT notice does not replace those licenses.
See [upstream license](https://github.com/AppImage/type2-runtime/blob/main/LICENSE)
and [build instructions](https://github.com/AppImage/type2-runtime/blob/main/BUILD.md).
These moving links explain the requirement; they are not a source pin.

Before the next Linux release, pin the **actual** runtime and packaging tools
selected by the locked Tauri CLI. Collect the exact runtime source, all linked
dependency sources, patches, configuration, build/link scripts and notices.
Verify rebuilding/modifying that runtime is possible. Do not substitute an
arbitrary current upstream archive or omit static libfuse's LGPL obligations.

Record the reviewed result in `evidence.json` with `runtimeSha256` (the exact
bytes before `--appimage-offset`), `sourceSha256`, upstream commits, dependency
versions, build commands and reviewer/date. Put original notices in `notices/`
and the complete reviewed source/build archive at
`.compliance/runtime-sources.tar.gz`. Generated archives stay out of Git.

`stage_linux_sources.mjs` fails closed until these inputs exist and match the
packaged runtime. It then includes them in the versioned Linux native source
archive. Linux packaging has not been accepted on this macOS development host.
