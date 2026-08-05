#!/usr/bin/env node

import assert from 'node:assert/strict';
import {
  PRODUCTION_MACOS_BUNDLE_ID,
  PRODUCTION_MACOS_TEAM_ID,
  assertProductionMacosIdentity,
  assertSameDesignatedRequirement,
  parseCodesignDetails,
  parseDesignatedRequirement,
  validateProductionMacosIdentity
} from './lib/macos_app_identity.mjs';

const stableRequirement = `identifier "${PRODUCTION_MACOS_BUNDLE_ID}" and anchor apple generic and certificate 1[field.1.2.840.113635.100.6.2.6] /* exists */ and certificate leaf[field.1.2.840.113635.100.6.1.13] /* exists */ and certificate leaf[subject.OU] = ${PRODUCTION_MACOS_TEAM_ID}`;
const codesignText = `Identifier=${PRODUCTION_MACOS_BUNDLE_ID}
CodeDirectory v=20500 size=1 flags=0x10000(runtime) hashes=1+7 location=embedded
Signature size=8985
Authority=Developer ID Application: Volver Health LLC (${PRODUCTION_MACOS_TEAM_ID})
Authority=Developer ID Certification Authority
Authority=Apple Root CA
TeamIdentifier=${PRODUCTION_MACOS_TEAM_ID}
Runtime Version=26.5.0`;

const snapshot = {
  appPath: '/Applications/ASCII VJ Remix.app',
  bundleIdentifier: PRODUCTION_MACOS_BUNDLE_ID,
  codesign: parseCodesignDetails(codesignText),
  designatedRequirement: stableRequirement
};

assert.equal(parseDesignatedRequirement(`Executable=/tmp/app\ndesignated => ${stableRequirement}`), stableRequirement);
assert.equal(parseDesignatedRequirement('# designated => cdhash H"abc"'), 'cdhash H"abc"');
assert.equal(snapshot.codesign.hardenedRuntime, true);
assert.deepEqual(validateProductionMacosIdentity(snapshot), []);
assert.doesNotThrow(() => assertProductionMacosIdentity(snapshot));
assert.doesNotThrow(() => assertSameDesignatedRequirement(snapshot, { designatedRequirement: stableRequirement }));

const adhoc = {
  ...snapshot,
  codesign: parseCodesignDetails(`Identifier=${PRODUCTION_MACOS_BUNDLE_ID}\nSignature=adhoc\nTeamIdentifier=not set`),
  designatedRequirement: 'cdhash H"d40321851f046265338f51a01a6d89519bf397e4"'
};
assert.match(validateProductionMacosIdentity(adhoc).join('\n'), /ad-hoc signed/);
assert.match(validateProductionMacosIdentity(adhoc).join('\n'), /build-specific code hash/);

assert.throws(
  () => assertProductionMacosIdentity({ ...snapshot, bundleIdentifier: 'com.asciline.remix.dev' }),
  /bundle identifier/
);
assert.throws(
  () => assertProductionMacosIdentity({
    ...snapshot,
    codesign: { ...snapshot.codesign, teamIdentifier: 'WRONGTEAM1' }
  }),
  /TeamIdentifier/
);
assert.throws(
  () => assertSameDesignatedRequirement(snapshot, { designatedRequirement: `${stableRequirement} and info[test] = true` }),
  /designated requirement changed/
);

console.log('macOS app identity tests passed.');
