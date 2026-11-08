"""Capture the exact Alpine source recipes and archives for static runtime code."""
import hashlib
import json
import os
import re
from pathlib import Path
import shutil
import subprocess
import tarfile
import urllib.request

out = Path('/output')
source = out / 'sources'
notices = out / 'notices'
archives = sorted(set(re.findall(r'([^\s()]+\.a)(?:\(|\s)', (out / 'runtime.map').read_text())))
allowed = {'libc.a', 'libm.a', 'libpthread.a', 'libssp_nonshared.a', 'libgcc.a', 'libgcc_eh.a',
           'libsquashfuse.a', 'libsquashfuse_ll.a', 'libfuse3.a', 'libzstd.a', 'libz.a', 'libmimalloc.a'}
assert archives, 'Empty static linker inventory'
assert all(Path(p).name in allowed for p in archives), f'Unrecorded static library: {archives}'
installed = {}
for record in Path('/lib/apk/db/installed').read_text().split('\n\n'):
    fields = dict(line.split(':', 1) for line in record.splitlines() if ':' in line)
    if 'P' in fields:
        installed[fields['P']] = fields

# These static archives are selected by the pinned runtime Makefile and clang.
# gcc includes the libgcc runtime exception as well as its complete sources.
packages = [('musl', '/usr/lib/libc.a'), ('zstd', '/usr/lib/libzstd.a'),
            ('zlib', '/usr/lib/libz.a'), ('mimalloc', '/usr/lib/libmimalloc.a'),
            ('gcc', next(p for p in archives if Path(p).name == 'libgcc.a'))]
records = []
for component, library in packages:
    owner = subprocess.check_output(['apk', 'info', '-W', library], text=True).split(' is owned by ', 1)[1].strip()
    fields = next(p for p in installed.values() if p['P'] + '-' + p['V'] == owner)
    binary = fields['P']
    origin, commit = fields['o'], fields['c']
    folder = source / 'alpine' / origin
    folder.mkdir(parents=True)
    url = f'https://codeload.github.com/alpinelinux/aports/tar.gz/{commit}'
    archive = Path('/work') / f'aports-{commit}.tar.gz'
    urllib.request.urlretrieve(url, archive)
    with tarfile.open(archive) as tar:
        matches = [m for m in tar.getmembers() if m.name.endswith(f'/{origin}/APKBUILD')]
        assert len(matches) == 1, f'Ambiguous source recipe: {origin}'
        prefix = matches[0].name.rsplit('/', 1)[0] + '/'
        for member in tar.getmembers():
            if member.isfile() and member.name.startswith(prefix):
                relative = member.name[len(prefix):]
                assert '..' not in Path(relative).parts
                target = folder / relative
                target.parent.mkdir(parents=True, exist_ok=True)
                target.write_bytes(tar.extractfile(member).read())
    archive.unlink()
    dist = folder / 'distfiles'
    dist.mkdir()
    env = {**os.environ, 'SRCDEST': str(dist)}
    subprocess.run(['abuild', '-F', 'fetch', 'verify'], cwd=folder, env=env, check=True)
    records.append({'component': component, 'binary': binary, 'version': fields['V'], 'origin': origin,
                    'aportsCommit': commit, 'license': fields['L'], 'recipeUrl': url})

# The complete downloaded archives are retained above; copy their original
# license/copyright files into the offline notices panel as well.
for archive in [*(source / 'inputs').glob('*.tar.*'), *(source / 'alpine').glob('*/distfiles/*.tar.*')]:
    if not archive.name.endswith(('.tar.gz', '.tar.xz', '.tar.bz2', '.tar.lz')):
        continue
    with tarfile.open(archive) as tar:
        for member in tar.getmembers():
            leaf = Path(member.name).name.lower()
            if not member.isfile() or member.size > 2 * 1024 * 1024:
                continue
            if not (leaf.startswith(('license', 'licence', 'copying', 'copyright')) or leaf == 'zlib.h'):
                continue
            # Retain paths to avoid overwriting component-specific notices.
            relative = Path(member.name)
            assert not relative.is_absolute() and '..' not in relative.parts
            target = notices / archive.name / relative
            target.parent.mkdir(parents=True, exist_ok=True)
            target.write_bytes(tar.extractfile(member).read())

kit = source / 'inputs' / 'AppImageKit.tar.gz'
with tarfile.open(kit) as tar:
    script = next(m for m in tar.getmembers() if m.name.endswith('/resources/AppRun'))
    (out / 'AppRun-x86_64').write_bytes(tar.extractfile(script).read())
    (out / 'AppRun-x86_64').chmod(0o755)

subprocess.run(['apk', 'info', '-vv'], stdout=(source / 'installed-packages.txt').open('w'), check=True)
(source / 'static-packages.json').write_text(json.dumps(records, indent=2) + '\n')
(source / 'static-linker-inputs.json').write_text(json.dumps(archives, indent=2) + '\n')
shutil.copy2(out / 'runtime.map', source / 'runtime.map')
shutil.copytree(notices, source / 'notices')
(source / 'README.md').write_text('''# AppImage runtime corresponding source

Original complete source archives, Alpine APKBUILD recipes/patches and checksum-verified
distfiles are included. The runtime is built from the pinned type2-runtime commit;
libfuse and squashfuse use its exact upstream recipe and patch. Alpine source records
identify the actual installed static musl, zstd, zlib, mimalloc and libgcc packages.
The AppRun launcher is the original shell script from the pinned AppImageKit source.

To rebuild or modify: install Docker, put inputs/* and Dockerfile in an input directory,
build this Dockerfile with build-runtime.sh and collect-sources.py in its context
and --build-arg RUNTIME_BASE set to the image in inputs/inputs.json,
then run the resulting amd64 container with that input directory mounted read-only at
/inputs and an empty writable directory at /output. Original source archives can be
modified before building; update their checksums when using the outer staging command.
The upstream BUILD.md, dependency scripts, Makefile, patches and the local substitution
recipe are retained. Alpine packages are build inputs; their preferred sources and
patches are supplied for rebuilding the corresponding static libraries. The runtime
linker map and exact installed package versions record the resulting composition.
This is a source/rebuild record, not a claim of byte-for-byte reproducible binaries.
''')
