#!/usr/bin/env bash
set -euo pipefail
trap 'chown -R "${OUTPUT_UID:-0}:${OUTPUT_GID:-0}" /output' EXIT

# Runs only inside the disposable amd64 build container. Inputs are read-only.
test "$(uname -m)" = x86_64
mkdir -p /work /output/sources/inputs /output/notices
# Packaging executables are build tools, not part of the runtime source payload.
cp /inputs/*.tar.* /inputs/inputs.json /output/sources/inputs/
cp /inputs/linuxdeploy-plugin-gtk.sh /inputs/*.txt /output/sources/inputs/
cp /inputs/*LICENSE.txt /output/notices/
tar -xf /inputs/type2-runtime.tar.gz -C /work
runtime=$(find /work -maxdepth 1 -type d -name 'type2-runtime-*')
test -n "$runtime"
cd "$runtime"

# Use the reviewed upstream commands and patches with the same checked archives.
# Retain the exact local-input substitution with the delivered source recipe.
python3 - <<'PY'
from pathlib import Path
p = Path('scripts/common/install-dependencies.sh')
s = p.read_text()
for name, command in [
    ('fuse-3.15.0.tar.xz', 'wget https://github.com/libfuse/libfuse/releases/download/fuse-3.15.0/fuse-3.15.0.tar.xz'),
    ('0.5.2.tar.gz', 'wget "https://github.com/vasi/squashfuse/archive/0.5.2.tar.gz"'),
]:
    assert s.count(command) == 1, 'Upstream dependency recipe changed'
    s = s.replace(command, f'cp /inputs/{name} .')
command = 'meson setup --prefix=/usr ..'
assert s.count(command) == 1
# Build-library installation needs no device node or setuid helper in a container.
s = s.replace(command, 'meson setup --prefix=/usr -Duseroot=false ..')
p.write_text(s)
PY
bash scripts/common/install-dependencies.sh
commit=$(python3 -c 'import json; print(json.load(open("/inputs/inputs.json"))["runtimeCommit"])')
printf 'https://github.com/AppImage/type2-runtime/commit/%s\n' "$commit" > src/runtime/version
# Preserve a linker map so the shipped static components can be audited.
printf '\nCFLAGS += -Wl,-Map=/output/runtime.map\n' >> src/runtime/Makefile
bash scripts/build-runtime.sh
cp out/runtime-x86_64 /output/
cp src/runtime/version /output/sources/runtime-version.txt
cp scripts/common/install-dependencies.sh /output/sources/install-dependencies-local.sh
cp /recipe/* /output/sources/
cp /inputs/Dockerfile /output/sources/Dockerfile
cp LICENSE /output/notices/type2-runtime-LICENSE
python3 /recipe/collect-sources.py
/output/runtime-x86_64 --appimage-version
printf 'Runtime and corresponding sources built successfully.\n'
