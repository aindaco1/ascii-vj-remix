const ASCII_CHARS = " .'`^\":;Il!i><~+_-?][}{1)(|/tfjrxnuvczXYUJCLQ0OZmwqpdbkhao*#MW&8%B@$";

const BASE_CHARACTER_SETS = [
    { id: 'point-click', label: 'Point & Click', chars: ASCII_CHARS, coverage: 'ascii' },
    { id: 'classic-camera', label: 'Classic Camera', chars: ' .,:;i1tfLCG08@', coverage: 'ascii' },
    { id: 'asciline', label: 'ASCILINE', chars: ' .:-=+*#%@', coverage: 'ascii' },
    { id: 'blocks', label: 'Blocks', chars: ' ░▒▓█', coverage: 'blocks' }
];

const MAX_GLYPH_RAMP_SCALARS = 96;

const GLYPH_COVERAGE_RANGES = Object.freeze([
    Object.freeze({ id: 'ascii', start: 0x0020, end: 0x007e }),
    Object.freeze({ id: 'latin-1', start: 0x00a0, end: 0x00ff }),
    Object.freeze({ id: 'latin-extended', start: 0x0100, end: 0x024f }),
    Object.freeze({ id: 'greek', start: 0x0370, end: 0x03ff }),
    Object.freeze({ id: 'cyrillic', start: 0x0400, end: 0x052f }),
    Object.freeze({ id: 'arrows', start: 0x2190, end: 0x21ff }),
    Object.freeze({ id: 'math', start: 0x2200, end: 0x22ff }),
    Object.freeze({ id: 'technical', start: 0x2300, end: 0x23ff }),
    Object.freeze({ id: 'box-drawing', start: 0x2500, end: 0x257f }),
    Object.freeze({ id: 'blocks', start: 0x2580, end: 0x259f }),
    Object.freeze({ id: 'shapes', start: 0x25a0, end: 0x25ff }),
    Object.freeze({ id: 'braille', start: 0x2800, end: 0x28ff }),
    Object.freeze({ id: 'cjk-radicals', start: 0x2e80, end: 0x2fdf }),
    Object.freeze({ id: 'cjk-punctuation', start: 0x3000, end: 0x303f }),
    Object.freeze({ id: 'hiragana', start: 0x3040, end: 0x309f }),
    Object.freeze({ id: 'katakana', start: 0x30a0, end: 0x30ff }),
    Object.freeze({ id: 'cjk-basic', start: 0x4e00, end: 0x9fff }),
    Object.freeze({ id: 'hangul', start: 0xac00, end: 0xd7af })
]);

function scalarString(start, end, limit = MAX_GLYPH_RAMP_SCALARS) {
    const length = end - start + 1;
    if (length <= limit) {
        return Array.from({ length }, (_, index) => String.fromCodePoint(start + index)).join('');
    }
    return Array.from({ length: limit }, (_, index) => (
        String.fromCodePoint(start + Math.round(index * (length - 1) / (limit - 1)))
    )).join('');
}

function brailleDensityRamp() {
    return Array.from({ length: 256 }, (_, dots) => ({
        codePoint: 0x2800 + dots,
        density: dots.toString(2).replace(/0/g, '').length
    }))
        .sort((a, b) => a.density - b.density || a.codePoint - b.codePoint)
        .filter((_entry, index, entries) => (
            index === 0 ||
            index === entries.length - 1 ||
            index % Math.ceil(entries.length / MAX_GLYPH_RAMP_SCALARS) === 0
        ))
        .slice(0, MAX_GLYPH_RAMP_SCALARS - 1)
        .concat({ codePoint: 0x28ff, density: 8 })
        .map(({ codePoint }) => String.fromCodePoint(codePoint))
        .join('');
}

const UNICODE_CHARACTER_SETS = Object.freeze([
    Object.freeze({ id: 'braille', label: 'Braille', chars: brailleDensityRamp(), coverage: 'braille' }),
    Object.freeze({ id: 'box-drawing', label: 'Box Drawing', chars: scalarString(0x2500, 0x255f), coverage: 'box-drawing' }),
    Object.freeze({ id: 'shapes', label: 'Geometric Shapes', chars: scalarString(0x25a0, 0x25ff), coverage: 'shapes' }),
    Object.freeze({ id: 'arrows', label: 'Arrows', chars: scalarString(0x2190, 0x21ff), coverage: 'arrows' }),
    Object.freeze({ id: 'mathematical', label: 'Mathematical', chars: scalarString(0x2200, 0x22ff), coverage: 'math' }),
    Object.freeze({ id: 'technical', label: 'Technical Symbols', chars: scalarString(0x2300, 0x23ff), coverage: 'technical' }),
    Object.freeze({ id: 'latin-extended', label: 'Latin Extended', chars: scalarString(0x0100, 0x024f), coverage: 'latin-extended' }),
    Object.freeze({ id: 'greek', label: 'Greek', chars: scalarString(0x0370, 0x03ff), coverage: 'greek' }),
    Object.freeze({ id: 'cyrillic', label: 'Cyrillic', chars: scalarString(0x0400, 0x052f), coverage: 'cyrillic' }),
    Object.freeze({ id: 'cjk-marks', label: 'CJK Marks / Radicals', chars: `${scalarString(0x3000, 0x303f, 32)}${scalarString(0x2e80, 0x2fdf, 64)}`, coverage: 'cjk-radicals' }),
    Object.freeze({ id: 'hiragana', label: 'Hiragana', chars: scalarString(0x3041, 0x3096), coverage: 'hiragana' }),
    Object.freeze({ id: 'katakana', label: 'Katakana', chars: scalarString(0x30a1, 0x30fa), coverage: 'katakana' }),
    Object.freeze({ id: 'cjk-basic', label: 'CJK Unified', chars: scalarString(0x4e00, 0x9fff), coverage: 'cjk-basic' }),
    Object.freeze({ id: 'hangul', label: 'Hangul', chars: scalarString(0xac00, 0xd7a3), coverage: 'hangul' }),
    Object.freeze({ id: 'custom', label: 'Custom Ramp', chars: '', coverage: 'custom' })
]);

// These are compact luminance ramps derived from the printable drawing-symbol
// vocabulary of ascii.today's curated FIGlet fonts. The original multiline
// FIGlet font data is not bundled; the ramps fit this app's cell renderer and
// remain compatible with its fixed native glyph atlas.
const ASCII_TODAY_CHARACTER_SETS = [
    { id: 'ascii-today-broadway-kb', label: 'Broadway KB', author: 'myflix', chars: " ',><~+-)(|\\/*@" },
    { id: 'ascii-today-computer', label: 'Computer', author: 'Mike Rosulek', chars: " .'\"><_|\\/d8" },
    { id: 'ascii-today-contessa', label: 'Contessa', author: 'Christopher Joseph Pirillo', chars: ' .:,><+_-[)|\\o*' },
    { id: 'ascii-today-cricket', label: 'Cricket', author: 'Leslie Bates', chars: " .':l><_-1)|\\/Y" },
    { id: 'ascii-today-doom', label: 'Doom', author: 'Frans P. de Vries', chars: " .'^,><_-)(|\\/" },
    { id: 'ascii-today-line-blocks', label: 'Line Blocks', author: 'Bateau', chars: " '\",>~_]}1(/*8@" },
    { id: 'ascii-today-fire-font-k', label: 'Fire Font-k', author: 'MJP', chars: ' .,!><-)(\\/xC0*' },
    { id: 'ascii-today-ghost', label: 'Ghost', author: 'myflix', chars: ' .:,;<_)(|/xC0O' },
    { id: 'ascii-today-larry-3d', label: 'Larry 3D', author: 'Larry Gelberg', chars: " .',><_|\\/xL" },
    { id: 'ascii-today-mini', label: 'Mini', author: 'Glenn Chappell', chars: " .'><_-)(|\\/COo" },
    { id: 'ascii-today-modular', label: 'Modular', author: 'MJP', chars: ' ><~_}{|\\/*&%@' },
    { id: 'ascii-today-nancyj', label: 'Nancyj', author: 'Eamon Daly', chars: " .'\":Ydbao#8" },
    { id: 'ascii-today-pepper', label: 'Pepper', author: 'Juan Car', chars: " .',;><_-)(|\\/X" },
    { id: 'ascii-today-rounded', label: 'Rounded', author: 'Nick Miners', chars: ' _)(|\\/nXUO' },
    { id: 'ascii-today-script', label: 'Script', author: 'Glenn Chappell', chars: " ',><+_)(|\\/Oo*" },
    { id: 'ascii-today-soft', label: 'Soft', author: 'myflix', chars: ' .:,<_)(|/xCLOo' },
    { id: 'ascii-today-stampatello', label: 'Stampatello', author: 'Marco Bodrato', chars: " '\",>~_[{(\\vYO*" },
    { id: 'ascii-today-standard', label: 'Standard', author: 'Glenn Chappell & Ian Chai', chars: " 'I_]1(/XUC0oWB" },
    { id: 'ascii-today-thick', label: 'Thick', author: 'Randall Ransom', chars: " .'\"Ymwdbo8" },
    { id: 'ascii-today-wavy', label: 'Wavy', author: 'Brian Krog', chars: " .'I_-1(|\\/XCOo" },
    { id: 'ascii-today-univers', label: 'Univers', author: 'Glenn Chappell', chars: ' .\",I_[)(YmdbM8' },
    { id: 'ascii-today-3d-diagonal', label: '3D Diagonal', author: 'nabis, LG Beard, Markus Gebhard and others', chars: " '\",;~+-\\/JC0*@" },
    { id: 'ascii-today-doh', label: 'Doh', author: 'Curtis Wanner', chars: ' :!~])tnzCZdaW$' }
].map((characterSet) => Object.freeze({
    ...characterSet,
    source: 'ascii.today',
    coverage: 'ascii'
}));

const CHARACTER_SETS = Object.freeze([
    ...BASE_CHARACTER_SETS.map((characterSet) => Object.freeze(characterSet)),
    ...ASCII_TODAY_CHARACTER_SETS,
    ...UNICODE_CHARACTER_SETS
]);
const CHARACTER_SET_BY_ID = new Map(CHARACTER_SETS.map((characterSet) => [characterSet.id, characterSet]));
const CHARACTER_SET_OPTIONS = Object.freeze(
    CHARACTER_SETS.map(({ id, label }) => Object.freeze([id, label]))
);
const CHARACTER_SET_IDS = Object.freeze(CHARACTER_SET_OPTIONS.map(([id]) => id));

function isSupportedGlyphCodePoint(codePoint) {
    return Number.isInteger(codePoint) && GLYPH_COVERAGE_RANGES.some(({ start, end }) => (
        codePoint >= start && codePoint <= end
    ));
}

function sanitizeGlyphRamp(value, options = {}) {
    const maxScalars = Math.max(1, Math.min(
        MAX_GLYPH_RAMP_SCALARS,
        Math.round(Number(options.maxScalars) || MAX_GLYPH_RAMP_SCALARS)
    ));
    const supportedOnly = options.supportedOnly !== false;
    const out = [];
    for (const scalar of String(value || '')) {
        const codePoint = scalar.codePointAt(0);
        if (!Number.isInteger(codePoint) || codePoint === 0x7f || codePoint < 0x20) continue;
        if (codePoint >= 0xd800 && codePoint <= 0xdfff) continue;
        if (supportedOnly && !isSupportedGlyphCodePoint(codePoint)) continue;
        out.push(scalar);
        if (out.length >= maxScalars) break;
    }
    return out.join('');
}

function characterSetChars(id, customRamp = '') {
    if (String(id || '') === 'custom') {
        return sanitizeGlyphRamp(customRamp) || ASCII_CHARS;
    }
    return CHARACTER_SET_BY_ID.get(String(id || ''))?.chars || ASCII_CHARS;
}

function activeGlyphRamp(params = {}) {
    let scalars = [...characterSetChars(params.charset, params.customGlyphRamp)];
    if (!scalars.length) scalars = [...ASCII_CHARS];
    const depth = Math.max(1, Math.min(
        scalars.length,
        Math.round(Number(params.glyphDepth) || MAX_GLYPH_RAMP_SCALARS)
    ));
    const maxOffset = Math.max(0, scalars.length - depth);
    const offset = Math.max(0, Math.min(maxOffset, Math.round(Number(params.glyphOffset) || 0)));
    scalars = scalars.slice(offset, offset + depth);
    if (params.glyphReverse) scalars.reverse();
    return scalars.join('');
}

export {
    ASCII_CHARS,
    ASCII_TODAY_CHARACTER_SETS,
    CHARACTER_SETS,
    CHARACTER_SET_IDS,
    CHARACTER_SET_OPTIONS,
    GLYPH_COVERAGE_RANGES,
    MAX_GLYPH_RAMP_SCALARS,
    UNICODE_CHARACTER_SETS,
    activeGlyphRamp,
    characterSetChars,
    isSupportedGlyphCodePoint,
    sanitizeGlyphRamp
};
