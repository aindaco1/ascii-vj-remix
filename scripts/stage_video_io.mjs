import { readFile, writeFile, mkdir, cp, access, rm } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import os from 'node:os';

const root = process.cwd();
if (!['darwin', 'win32', 'linux'].includes(process.platform) || process.arch !== (process.platform === 'darwin' ? 'arm64' : 'x64')) throw new Error('Video I/O builds support macOS arm64, Windows x64 and Linux x64');
const target = process.platform === 'darwin' ? 'macos-aarch64' : process.platform === 'win32' ? 'windows-x86_64' : 'linux-x86_64';
const resources = path.join(root, 'src-tauri/resources/video-io');
const pins = JSON.parse(await readFile(path.join(resources, 'provenance.json'), 'utf8'));
const cache = process.env.ASCII_VIDEO_SDK_CACHE || path.join(os.tmpdir(), 'ascii-video-io-sdk-pinned');
await mkdir(cache, { recursive: true });
const exists = async file => { try { await access(file); return true; } catch { return false; } };
const hash = async file => createHash('sha256').update(await readFile(file)).digest('hex');
function run(program, args, options = {}) {
    const result = spawnSync(program, args, { stdio: 'inherit', ...options });
    if (result.error || result.status !== 0) throw new Error(`${program} failed (${result.status}): ${result.error?.message || ''}`);
}
async function archive(pin, name) {
    const file = path.join(cache, name);
    if (!await exists(file)) { const response = await fetch(pin.url); if (!response.ok) throw new Error(`SDK download failed: ${response.status}`); await writeFile(file, new Uint8Array(await response.arrayBuffer())); }
    if (await hash(file) !== pin.archiveSha256) throw new Error(`SDK checksum mismatch: ${name}. Review the upstream version before updating provenance.json.`);
    return file;
}
const pin = pins.ndi[target];
let runtime, thirdPartyNotices;
if (process.platform === 'darwin') {
    const pkg = await archive(pin, 'ndi-apple.pkg'), expanded = path.join(cache, 'ndi-apple');
    if (!await exists(expanded)) run('pkgutil', ['--expand-full', pkg, expanded]);
    runtime = path.join(expanded, 'NDI_SDK_Component.pkg/Payload/NDI SDK for Apple/lib/macOS/libndi.dylib');
    thirdPartyNotices = path.join(path.dirname(runtime), 'libndi_licenses.txt');
} else if (process.platform === 'win32') {
    const exe = await archive(pin, 'ndi-windows.exe'), expanded = path.join(cache, 'ndi-windows');
    if (!await exists(path.join(expanded, 'Bin/x64/Processing.NDI.Lib.x64.dll'))) run(exe, ['/VERYSILENT', '/SUPPRESSMSGBOXES', '/NORESTART', `/DIR=${expanded}`]);
    runtime = path.join(expanded, 'Bin/x64/Processing.NDI.Lib.x64.dll');
    thirdPartyNotices = path.join(path.dirname(runtime), 'Processing.NDI.Lib.Licenses.txt');
} else {
    const tar = await archive(pin, 'ndi-linux.tar.gz');
    const expanded = path.join(cache, 'NDI SDK for Linux');
    if (!await exists(expanded)) {
        run('tar', ['-xzf', tar, '-C', cache]);
        run('sh', [path.join(cache, 'Install_NDI_SDK_v6_Linux.sh')], { cwd: cache, input: 'y\n', env: { ...process.env, PAGER: 'cat' }, stdio: ['pipe', 'inherit', 'inherit'] });
    }
    runtime = path.join(expanded, 'lib/x86_64-linux-gnu/libndi.so.6.3.2');
    thirdPartyNotices = path.join(expanded, 'licenses/libndi_licenses.txt');
}
if (await hash(runtime) !== pin.runtimeSha256) throw new Error('NDI runtime checksum mismatch');
const destination = path.join(resources, target);
await mkdir(destination, { recursive: true });
const name = process.platform === 'darwin' ? 'libndi.dylib' : process.platform === 'win32' ? 'Processing.NDI.Lib.x64.dll' : 'libndi.so.6';
const runtimeDestination = process.platform === 'darwin' ? path.join(root, 'src-tauri/frameworks', name) : path.join(destination, name);
await mkdir(path.dirname(runtimeDestination), { recursive: true });
await cp(runtime, runtimeDestination);
await cp(thirdPartyNotices, path.join(destination, 'NDI-THIRD-PARTY-LICENSES.txt'));

if (process.platform === 'darwin') {
    const tar = await archive(pins.syphon, 'syphon.tar.gz');
    const source = path.join(cache, `Syphon-Framework-${pins.syphon.revision}`);
    if (!await exists(source)) run('tar', ['-xzf', tar, '-C', cache]);
    // Xcode 26+ distributes the Metal compiler separately.
    if (spawnSync('xcrun', ['metal', '-v'], { stdio: 'ignore' }).status !== 0) run('xcodebuild', ['-downloadComponent', 'MetalToolchain']);
    const build = path.join(cache, 'syphon-build');
    run('xcodebuild', ['-project', path.join(source, 'Syphon.xcodeproj'), '-scheme', 'Syphon', '-configuration', 'Release', '-derivedDataPath', build, 'MACOSX_DEPLOYMENT_TARGET=13.0', 'ARCHS=arm64', 'CODE_SIGNING_ALLOWED=NO', 'build']);
    const framework = path.join(root, 'src-tauri/frameworks/Syphon.framework');
    await rm(framework, { recursive: true, force: true }); await mkdir(path.dirname(framework), { recursive: true });
    run('ditto', [path.join(build, 'Build/Products/Release/Syphon.framework'), framework]);
}
await writeFile(path.join(destination, 'manifest.json'), JSON.stringify({ target, version: pins.ndi.version, library: name, sha256: await hash(runtimeDestination), noticesSha256: await hash(thirdPartyNotices), syphon: process.platform === 'darwin' ? pins.syphon.revision : null }, null, 2) + '\n');
console.log(`Staged native video runtime: ${target}`);
