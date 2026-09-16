import assert from 'node:assert/strict';
import {
  applyMacosDeploymentTarget,
  macosDeploymentIssues,
  macosDeploymentTarget
} from './lib/macos_deployment_target.mjs';

const buildCommand = (minimum, platform = '1') => `Load command 10
      cmd LC_BUILD_VERSION
  cmdsize 32
 platform ${platform}
    minos ${minimum}
      sdk 27.0
   ntools 1`;

assert.equal(macosDeploymentTarget, '13.0');
assert.deepEqual(macosDeploymentIssues(buildCommand('13.0')), []);
assert.deepEqual(macosDeploymentIssues(buildCommand('13.0.0', 'MACOS')), []);
assert.deepEqual(macosDeploymentIssues(buildCommand('11.0')), []);
assert.match(macosDeploymentIssues(buildCommand('26.0')).join(), /requires macOS 26.0/);
assert.match(macosDeploymentIssues(buildCommand('13.1')).join(), /requires macOS 13.1/);
assert.match(macosDeploymentIssues(buildCommand('13.0.1')).join(), /requires macOS 13.0.1/);
// Every architecture in a universal binary must satisfy the floor.
assert.match(macosDeploymentIssues(buildCommand('13.0') + '\n' + buildCommand('26.0')).join(), /26.0/);
assert.deepEqual(macosDeploymentIssues(`Load command 9
      cmd LC_VERSION_MIN_MACOSX
  cmdsize 16
  version 10.13
      sdk 27.0`), []);
assert.match(macosDeploymentIssues(buildCommand('13.0', '2')).join(), /no macOS/);
assert.match(macosDeploymentIssues('not a Mach-O binary').join(), /no macOS/);
assert.match(macosDeploymentIssues(buildCommand('invalid')).join(), /invalid macOS/);
const env = { MACOSX_DEPLOYMENT_TARGET: '27.0' };
applyMacosDeploymentTarget(env, 'darwin');
assert.equal(env.MACOSX_DEPLOYMENT_TARGET, '13.0');
const otherPlatform = {};
applyMacosDeploymentTarget(otherPlatform, 'linux');
assert.deepEqual(otherPlatform, {});
console.log('macOS deployment-target tests passed.');
