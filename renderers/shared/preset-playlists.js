const PLAYLIST_SCHEMA_VERSION = 1;
const MAX_PLAYLISTS = 24;
const MAX_PLAYLIST_ITEMS = 128;
const MIN_HOLD_SECONDS = 1;
const MAX_HOLD_SECONDS = 3600;
const DEFAULT_HOLD_SECONDS = 15;

function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
}

function cleanName(value, fallback = 'Untitled Playlist') {
    const name = String(value || '').trim().replace(/\s+/g, ' ').slice(0, 60);
    return name || fallback;
}

function cleanId(value, fallback) {
    const id = String(value || '')
        .trim()
        .replace(/[^A-Za-z0-9_-]/g, '-')
        .replace(/-+/g, '-')
        .slice(0, 80);
    return id || fallback;
}

function nextPlaylistName(playlists) {
    const names = new Set((Array.isArray(playlists) ? playlists : [])
        .map((playlist) => String(playlist?.name || '').trim().toLocaleLowerCase())
        .filter(Boolean));
    let number = 1;
    while (names.has(`playlist ${number}`)) number += 1;
    return `Playlist ${number}`;
}

function sanitizePresetPlaylist(value, index = 0, options = {}) {
    const source = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
    const validPresetIds = options.validPresetIds instanceof Set ? options.validPresetIds : null;
    const fallbackId = `playlist-${index + 1}`;
    const presetIds = (Array.isArray(source.presetIds) ? source.presetIds : [])
        .map((id) => String(id || '').trim().slice(0, 120))
        .filter((id) => id && (!validPresetIds || validPresetIds.has(id)))
        .slice(0, MAX_PLAYLIST_ITEMS);
    const holdSeconds = Number(source.holdSeconds);
    return {
        id: cleanId(source.id, fallbackId),
        name: cleanName(source.name, `Playlist ${index + 1}`),
        holdSeconds: clamp(
            Number.isFinite(holdSeconds) ? holdSeconds : DEFAULT_HOLD_SECONDS,
            MIN_HOLD_SECONDS,
            MAX_HOLD_SECONDS
        ),
        playbackMode: source.playbackMode === 'random' ? 'random' : 'sequential',
        presetIds
    };
}

function sanitizePresetPlaylists(value, options = {}) {
    const source = Array.isArray(value) ? value : value?.playlists;
    const usedIds = new Set();
    const playlists = (Array.isArray(source) ? source : [])
        .slice(0, MAX_PLAYLISTS)
        .map((playlist, index) => {
            const clean = sanitizePresetPlaylist(playlist, index, options);
            const baseId = clean.id;
            let id = baseId;
            let suffix = 2;
            while (usedIds.has(id)) id = `${baseId}-${suffix++}`.slice(0, 80);
            usedIds.add(id);
            return { ...clean, id };
        });
    return { version: PLAYLIST_SCHEMA_VERSION, playlists };
}

function movePlaylistItem(presetIds, fromIndex, toIndex) {
    const items = Array.isArray(presetIds) ? [...presetIds] : [];
    const from = Number(fromIndex);
    const to = Number(toIndex);
    if (!Number.isInteger(from) || !Number.isInteger(to)) return items;
    if (from < 0 || from >= items.length || to < 0 || to >= items.length || from === to) return items;
    const [item] = items.splice(from, 1);
    items.splice(to, 0, item);
    return items;
}

function nextPlaylistIndex({
    length,
    currentIndex = -1,
    mode = 'sequential',
    random = Math.random,
    excludedIndices = []
} = {}) {
    const count = Math.max(0, Math.floor(Number(length) || 0));
    if (count === 0) return -1;
    const excluded = new Set(
        [...excludedIndices]
            .map((index) => Math.floor(Number(index)))
            .filter((index) => Number.isInteger(index) && index >= 0 && index < count)
    );
    const eligible = Array.from({ length: count }, (_, index) => index)
        .filter((index) => !excluded.has(index));
    if (!eligible.length) return -1;
    const rawCurrent = Math.floor(Number(currentIndex));
    const current = Number.isInteger(rawCurrent) && rawCurrent >= 0 && rawCurrent < count
        ? rawCurrent
        : -1;
    if (mode !== 'random') {
        for (let offset = 1; offset <= count; offset++) {
            const candidate = (current + offset + count) % count;
            if (!excluded.has(candidate)) return candidate;
        }
        return -1;
    }
    const draw = clamp(Number(random?.()) || 0, 0, 0.999999999);
    const nonRepeating = eligible.filter((index) => index !== current);
    const candidates = nonRepeating.length ? nonRepeating : eligible;
    return candidates[Math.floor(draw * candidates.length)];
}

export {
    DEFAULT_HOLD_SECONDS,
    MAX_HOLD_SECONDS,
    MAX_PLAYLISTS,
    MAX_PLAYLIST_ITEMS,
    MIN_HOLD_SECONDS,
    PLAYLIST_SCHEMA_VERSION,
    movePlaylistItem,
    nextPlaylistName,
    nextPlaylistIndex,
    sanitizePresetPlaylist,
    sanitizePresetPlaylists
};
