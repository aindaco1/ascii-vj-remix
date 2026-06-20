import assert from 'node:assert/strict';
import {
  forbiddenMacosDependencies,
  isAllowedMacosDependency,
  parseOtoolDependencies
} from './lib/ffmpeg_resource_policy.mjs';

const sampleOtool = `/app/resources/ffmpeg/macos-aarch64/bin/ffmpeg:
\t@loader_path/../lib/libavcodec.62.dylib (compatibility version 62.0.0, current version 62.28.101)
\t@executable_path/../Frameworks/libfoo.dylib (compatibility version 1.0.0, current version 1.0.0)
\t@rpath/libbar.dylib (compatibility version 1.0.0, current version 1.0.0)
\t/System/Library/Frameworks/Foundation.framework/Versions/C/Foundation (compatibility version 300.0.0, current version 4424.1.255)
\t/usr/lib/libSystem.B.dylib (compatibility version 1.0.0, current version 1356.0.0)
\t/opt/homebrew/opt/x264/lib/libx264.165.dylib (compatibility version 0.0.0, current version 0.0.0)
\t/usr/local/opt/openssl@3/lib/libssl.3.dylib (compatibility version 3.0.0, current version 3.0.0)
`;

assert.deepEqual(parseOtoolDependencies(sampleOtool), [
  '@loader_path/../lib/libavcodec.62.dylib',
  '@executable_path/../Frameworks/libfoo.dylib',
  '@rpath/libbar.dylib',
  '/System/Library/Frameworks/Foundation.framework/Versions/C/Foundation',
  '/usr/lib/libSystem.B.dylib',
  '/opt/homebrew/opt/x264/lib/libx264.165.dylib',
  '/usr/local/opt/openssl@3/lib/libssl.3.dylib'
]);

assert.equal(isAllowedMacosDependency('/System/Library/Frameworks/AppKit.framework/AppKit'), true);
assert.equal(isAllowedMacosDependency('/usr/lib/libz.1.dylib'), true);
assert.equal(isAllowedMacosDependency('@loader_path/../lib/libavutil.60.dylib'), true);
assert.equal(isAllowedMacosDependency('@executable_path/../Frameworks/libssl.3.dylib'), true);
assert.equal(isAllowedMacosDependency('@rpath/libcrypto.3.dylib'), true);
assert.equal(isAllowedMacosDependency('/opt/homebrew/opt/x265/lib/libx265.216.dylib'), false);
assert.equal(isAllowedMacosDependency('/usr/local/opt/libvpx/lib/libvpx.12.dylib'), false);

assert.deepEqual(forbiddenMacosDependencies(sampleOtool), [
  '/opt/homebrew/opt/x264/lib/libx264.165.dylib',
  '/usr/local/opt/openssl@3/lib/libssl.3.dylib'
]);

console.log('FFmpeg resource policy test passed.');
