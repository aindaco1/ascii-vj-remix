import path from 'node:path';

function isICloudWorkspace(cwd) {
  return process.platform === 'darwin' && String(cwd || '').includes('/Mobile Documents/');
}

function tauriTargetDir(root, env = process.env) {
  if (env.CARGO_TARGET_DIR) return path.resolve(env.CARGO_TARGET_DIR);
  if (env.ASCILINE_TAURI_TARGET_DIR) return path.resolve(env.ASCILINE_TAURI_TARGET_DIR);
  if (isICloudWorkspace(root)) return '/private/tmp/asciline-remix-tauri-target';
  return path.join(root, 'src-tauri', 'target');
}

function applyTauriTargetDir(root, env) {
  if (!env.CARGO_TARGET_DIR) env.CARGO_TARGET_DIR = tauriTargetDir(root, env);
  return env.CARGO_TARGET_DIR;
}

export {
  applyTauriTargetDir,
  tauriTargetDir
};
