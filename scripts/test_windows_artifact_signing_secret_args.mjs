import assert from 'node:assert/strict';
import { parseArgs, validateArgs } from './set_windows_artifact_signing_secrets.mjs';

const base = [
  '--client-id', 'client-id',
  '--tenant-id', 'tenant-id',
  '--client-secret-file', 'azure-client-secret.txt',
  '--endpoint', 'https://eus.codesigning.azure.net/',
  '--account', 'signing-account',
  '--certificate-profile', 'public-trust-profile'
];

assert.deepEqual(parseArgs(base), {
  clientId: 'client-id',
  tenantId: 'tenant-id',
  clientSecretFile: 'azure-client-secret.txt',
  endpoint: 'https://eus.codesigning.azure.net/',
  account: 'signing-account',
  certificateProfile: 'public-trust-profile'
});

assert.equal(validateArgs(parseArgs(base)), true);
assert.equal(validateArgs(parseArgs([...base, '--description', 'ASCII VJ Remix'])), true);

assert.throws(
  () => validateArgs(parseArgs(base.slice(0, -2))),
  /--certificate-profile/
);

assert.throws(
  () => validateArgs(parseArgs([...base.slice(0, 6), '--endpoint', 'http://example.com', ...base.slice(8)])),
  /HTTPS URL/
);

console.log('Windows Artifact Signing secret argument tests passed.');
