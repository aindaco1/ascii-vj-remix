import assert from 'node:assert/strict';
import {
  movePlaylistItem,
  nextPlaylistName,
  nextPlaylistIndex,
  sanitizePresetPlaylists
} from '../renderers/shared/preset-playlists.js';

const validPresetIds = new Set(['classic', 'saved', 'glitch']);
const state = sanitizePresetPlaylists({
  playlists: [{
    id: 'show/set',
    name: '  Main   Set  ',
    holdSeconds: 0,
    playbackMode: 'random',
    presetIds: ['classic', 'missing', 'saved', 'classic']
  }]
}, { validPresetIds });

assert.deepEqual(state, {
  version: 1,
  playlists: [{
    id: 'show-set',
    name: 'Main Set',
    holdSeconds: 1,
    playbackMode: 'random',
    presetIds: ['classic', 'saved', 'classic']
  }]
});
assert.deepEqual(movePlaylistItem(['a', 'b', 'c'], 2, 0), ['c', 'a', 'b']);
assert.equal(nextPlaylistName([]), 'Playlist 1');
assert.equal(nextPlaylistName([{ name: 'Playlist 1' }, { name: 'playlist 3' }]), 'Playlist 2');
assert.equal(nextPlaylistIndex({ length: 3, currentIndex: -1 }), 0);
assert.equal(nextPlaylistIndex({ length: 3, currentIndex: 2 }), 0);
assert.equal(nextPlaylistIndex({ length: 3, currentIndex: -1, mode: 'random', random: () => 0 }), 0);
assert.equal(nextPlaylistIndex({ length: 3, currentIndex: 1, mode: 'random', random: () => 0 }), 0);
assert.equal(nextPlaylistIndex({ length: 3, currentIndex: 1, mode: 'random', random: () => 0.99 }), 2);
assert.equal(nextPlaylistIndex({ length: 3, currentIndex: 0, excludedIndices: [0] }), 1);
assert.equal(nextPlaylistIndex({ length: 3, currentIndex: 1, excludedIndices: [1] }), 2);
assert.equal(nextPlaylistIndex({ length: 3, currentIndex: 2, excludedIndices: [2] }), 0);
assert.equal(nextPlaylistIndex({ length: 3, currentIndex: 1, mode: 'random', random: () => 0, excludedIndices: [0, 1] }), 2);
assert.equal(nextPlaylistIndex({ length: 3, currentIndex: 1, mode: 'random', random: () => 0.99, excludedIndices: [1, 2] }), 0);
assert.equal(nextPlaylistIndex({ length: 2, currentIndex: 0, excludedIndices: [0, 1] }), -1);
assert.equal(nextPlaylistIndex({ length: 0 }), -1);

console.log('Preset playlist contract checks passed.');
