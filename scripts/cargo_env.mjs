import { spawn, spawnSync } from 'node:child_process';
import path from 'node:path';

function commandWorks(command, args = ['--version'], env = process.env) {
  const result = spawnSync(command, args, {
    encoding: 'utf8',
    env,
    shell: process.platform === 'win32'
  });
  return result.status === 0;
}

function rustupToolchainBin() {
  const result = spawnSync('rustup', ['which', 'cargo'], {
    encoding: 'utf8',
    shell: process.platform === 'win32'
  });
  if (result.status !== 0) return null;

  const cargoPath = result.stdout.trim();
  return cargoPath ? path.dirname(cargoPath) : null;
}

const env = { ...process.env };

if (!commandWorks('cargo', ['--version'], env)) {
  const toolchainBin = rustupToolchainBin();
  if (toolchainBin) {
    env.PATH = `${toolchainBin}${path.delimiter}${env.PATH || ''}`;
  }
}

const child = spawn('cargo', process.argv.slice(2), {
  stdio: 'inherit',
  env,
  shell: process.platform === 'win32'
});

child.on('exit', (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }
  process.exit(code ?? 1);
});
