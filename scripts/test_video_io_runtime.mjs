// Synthetic SDK round trip. No physical device or installed-app acceptance.
import { spawn } from 'node:child_process';
import path from 'node:path';

const runtime = process.platform === 'darwin'
  ? 'src-tauri/frameworks/libndi.dylib'
  : process.platform === 'win32'
    ? 'src-tauri/resources/video-io/windows-x86_64/Processing.NDI.Lib.x64.dll'
    : 'src-tauri/resources/video-io/linux-x86_64/libndi.so.6';
const child = spawn(process.execPath, [
  'scripts/cargo_env.mjs', 'run', '--manifest-path', 'src-tauri/Cargo.toml',
  '--example', 'video_io_probe', '--', path.resolve(runtime)
], { stdio: 'inherit' });
child.on('error', error => { console.error(error); process.exitCode = 1; });
child.on('exit', code => { process.exitCode = code ?? 1; });
