import { existsSync, readdirSync } from 'node:fs';
import path from 'node:path';
export function findChromiumExecutable({ preferInstalled = false } = {}) {
  if (process.env.CHROMIUM_EXECUTABLE && existsSync(process.env.CHROMIUM_EXECUTABLE)) {
    return process.env.CHROMIUM_EXECUTABLE;
  }

  const candidates = [];
  const addCandidate = (...parts) => {
    if (parts.every(Boolean)) candidates.push(path.join(...parts));
  };
  if (process.platform === 'darwin') {
    addCandidate('/Applications', 'Google Chrome.app', 'Contents', 'MacOS', 'Google Chrome');
    addCandidate('/Applications', 'Microsoft Edge.app', 'Contents', 'MacOS', 'Microsoft Edge');
  } else if (process.platform === 'win32') {
    addCandidate(process.env.PROGRAMFILES, 'Google', 'Chrome', 'Application', 'chrome.exe');
    addCandidate(process.env['PROGRAMFILES(X86)'], 'Google', 'Chrome', 'Application', 'chrome.exe');
    addCandidate(process.env.LOCALAPPDATA, 'Google', 'Chrome', 'Application', 'chrome.exe');
    addCandidate(process.env.PROGRAMFILES, 'Microsoft', 'Edge', 'Application', 'msedge.exe');
    addCandidate(process.env['PROGRAMFILES(X86)'], 'Microsoft', 'Edge', 'Application', 'msedge.exe');
  } else {
    candidates.push('/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser');
  }

  const cacheDir = process.platform === 'darwin'
    ? path.join(process.env.HOME || '', 'Library', 'Caches', 'ms-playwright')
    : process.platform === 'win32'
      ? path.join(process.env.LOCALAPPDATA || '', 'ms-playwright')
      : path.join(process.env.HOME || '', '.cache', 'ms-playwright');
  if (existsSync(cacheDir)) {
    const cacheCandidates = readdirSync(cacheDir)
      .filter((entry) => entry.startsWith('chromium_headless_shell-'))
      .sort()
      .reverse()
      .flatMap((entry) => {
        const entryRoot = path.join(cacheDir, entry);
        return [
          path.join(entryRoot, 'chrome-headless-shell-mac-arm64', 'chrome-headless-shell'),
          path.join(entryRoot, 'chrome-headless-shell-mac-x64', 'chrome-headless-shell'),
          path.join(entryRoot, 'chrome-headless-shell-win64', 'chrome-headless-shell.exe'),
          path.join(entryRoot, 'chrome-headless-shell-linux64', 'chrome-headless-shell')
        ];
      });
    if (preferInstalled) candidates.push(...cacheCandidates);
    else candidates.unshift(...cacheCandidates);
  }

  for (const candidate of candidates) {
    if (existsSync(candidate)) return candidate;
  }
  return null;
}
