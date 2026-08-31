#!/usr/bin/env node
import assert from 'node:assert/strict';
import {
  BUNDLED_DEMO_VIDEO_URLS,
  bundledDemoVideoNativeSource,
  bundledDemoVideoUrl,
  isBundledDemoVideoUrl,
  nativeVideoFallbackSource
} from '../renderers/gpu/media-source.js';

assert.equal(
  bundledDemoVideoUrl('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/620.1.1'),
  BUNDLED_DEMO_VIDEO_URLS.mp4
);
assert.equal(
  bundledDemoVideoUrl('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'),
  BUNDLED_DEMO_VIDEO_URLS.mp4
);
assert.equal(
  bundledDemoVideoUrl('Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/605.1.15'),
  BUNDLED_DEMO_VIDEO_URLS.webm
);
assert.equal(
  bundledDemoVideoUrl('Mozilla/5.0 (X11; Fedora; Linux x86_64) AppleWebKit/605.1.15'),
  BUNDLED_DEMO_VIDEO_URLS.webm
);
assert.equal(
  bundledDemoVideoUrl('Mozilla/5.0 (Linux; Android 15) AppleWebKit/537.36'),
  BUNDLED_DEMO_VIDEO_URLS.mp4
);

assert.equal(isBundledDemoVideoUrl(BUNDLED_DEMO_VIDEO_URLS.mp4), true);
assert.equal(isBundledDemoVideoUrl(BUNDLED_DEMO_VIDEO_URLS.webm), true);
assert.equal(isBundledDemoVideoUrl('media/point-click-test.mp4'), false);

assert.deepEqual(
  bundledDemoVideoNativeSource(BUNDLED_DEMO_VIDEO_URLS.webm),
  {
    id: 'bundled:media/demo-video-2.webm',
    provider: 'tauri-bundled',
    url: 'media/demo-video-2.webm',
    name: 'demo-video-2.webm',
    mediaType: 'video'
  }
);
assert.equal(bundledDemoVideoNativeSource('media/private.webm'), null);

const customNativeFile = {
  id: 'media-1',
  url: 'asset://localhost/custom.mp4',
  mediaType: 'video'
};
assert.equal(
  nativeVideoFallbackSource(
    { mediaType: 'video', mediaUrl: customNativeFile.url },
    customNativeFile
  ),
  customNativeFile
);
assert.equal(
  nativeVideoFallbackSource(
    { mediaType: 'video', mediaUrl: BUNDLED_DEMO_VIDEO_URLS.mp4 },
    customNativeFile
  )?.id,
  'bundled:media/demo-video-2.mp4'
);
assert.equal(
  nativeVideoFallbackSource(
    { mediaType: 'image', mediaUrl: BUNDLED_DEMO_VIDEO_URLS.mp4 },
    customNativeFile
  ),
  null
);
assert.equal(
  nativeVideoFallbackSource(
    { mediaType: 'video', mediaUrl: 'media/private.webm' },
    customNativeFile
  ),
  null
);

console.log('Media source platform policy tests passed.');
