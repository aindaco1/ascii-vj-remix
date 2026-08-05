const ASCII_CHARS = " .'`^\":;Il!i><~+_-?][}{1)(|/tfjrxnuvczXYUJCLQ0OZmwqpdbkhao*#MW&8%B@$";

const BASE_CHARACTER_SETS = [
    { id: 'point-click', label: 'Point & Click', chars: ASCII_CHARS },
    { id: 'classic-camera', label: 'Classic Camera', chars: ' .,:;i1tfLCG08@' },
    { id: 'asciline', label: 'ASCILINE', chars: ' .:-=+*#%@' },
    { id: 'blocks', label: 'Blocks', chars: ' ░▒▓█' }
];

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
    source: 'ascii.today'
}));

const CHARACTER_SETS = Object.freeze([
    ...BASE_CHARACTER_SETS.map((characterSet) => Object.freeze(characterSet)),
    ...ASCII_TODAY_CHARACTER_SETS
]);
const CHARACTER_SET_BY_ID = new Map(CHARACTER_SETS.map((characterSet) => [characterSet.id, characterSet]));
const CHARACTER_SET_OPTIONS = Object.freeze(
    CHARACTER_SETS.map(({ id, label }) => Object.freeze([id, label]))
);
const CHARACTER_SET_IDS = Object.freeze(CHARACTER_SET_OPTIONS.map(([id]) => id));

function characterSetChars(id) {
    return CHARACTER_SET_BY_ID.get(String(id || ''))?.chars || ASCII_CHARS;
}

export {
    ASCII_CHARS,
    ASCII_TODAY_CHARACTER_SETS,
    CHARACTER_SETS,
    CHARACTER_SET_IDS,
    CHARACTER_SET_OPTIONS,
    characterSetChars
};
