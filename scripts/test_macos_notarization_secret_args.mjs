import assert from 'node:assert/strict';
import { parseArgs, validateNotarizationArgs } from './set_macos_notarization_secrets.mjs';

const base = ['--certificate', 'cert.p12', '--certificate-password-file', 'cert-password.txt'];

assert.deepEqual(parseArgs([...base, '--api-key', 'KEY', '--api-issuer', 'ISSUER', '--api-key-file', 'AuthKey.p8']), {
  certificate: 'cert.p12',
  certificatePasswordFile: 'cert-password.txt',
  apiKey: 'KEY',
  apiIssuer: 'ISSUER',
  apiKeyFile: 'AuthKey.p8'
});

assert.deepEqual(validateNotarizationArgs(parseArgs([...base, '--api-key', 'KEY', '--api-issuer', 'ISSUER', '--api-key-file', 'AuthKey.p8'])), {
  usingApi: true
});

assert.deepEqual(validateNotarizationArgs(parseArgs([...base, '--apple-id-file', 'apple.txt', '--apple-password-file', 'password.txt', '--apple-team-id', 'TEAMID'])), {
  usingApi: false
});

assert.throws(
  () => validateNotarizationArgs(parseArgs(base)),
  /notarization credentials are required/
);

assert.throws(
  () => validateNotarizationArgs(parseArgs([...base, '--api-key', 'KEY', '--api-issuer', 'ISSUER'])),
  /App Store Connect API notarization is missing/
);

assert.throws(
  () => validateNotarizationArgs(parseArgs([...base, '--api-key', 'KEY', '--api-issuer', 'ISSUER', '--api-key-file', 'AuthKey.p8', '--apple-id-file', 'apple.txt'])),
  /choose either App Store Connect API options or Apple ID options/
);

console.log('macOS notarization secret argument tests passed.');
