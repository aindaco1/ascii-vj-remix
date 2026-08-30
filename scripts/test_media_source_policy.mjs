#!/usr/bin/env node
import assert from 'node:assert/strict';
import {
  BUNDLED_DEMO_VIDEO_URLS,
  bundledDemoVideoUrl,
  isBundledDemoVideoUrl
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

console.log('Media source platform policy tests passed.');
