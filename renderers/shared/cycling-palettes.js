// Original color recipes. Each group is ordered independently for index cycling.
const ramp = (from, to) => Array.from({ length: 8 }, (_, i) =>
    from.map((value, c) => Math.round(value + (to[c] - value) * i / 7)));

const families = [
    ['tidal-glass', 'Tidal Glass', [[6, 15, 27], [59, 66, 84], [15, 65, 84], [128, 195, 189], [39, 80, 133], [156, 192, 220], [93, 88, 99], [238, 220, 181]], 1.4, 0.65],
    ['ember-grotto', 'Ember Grotto', [[15, 9, 21], [56, 40, 63], [85, 28, 34], [225, 125, 54], [121, 62, 28], [247, 204, 110], [38, 58, 73], [163, 182, 173]], 1.8, 0.9],
    ['fern-after-rain', 'Fern After Rain', [[8, 18, 19], [51, 58, 44], [25, 65, 48], [149, 180, 100], [29, 74, 80], [129, 190, 171], [104, 88, 54], [223, 218, 157]], 0.8, 0.45],
    ['violet-dusk', 'Violet Dusk', [[17, 12, 32], [64, 46, 75], [68, 51, 113], [169, 136, 184], [110, 64, 108], [224, 153, 153], [67, 95, 126], [220, 220, 200]], 0.7, 0.4]
];

export const CYCLING_PALETTE_DEFINITIONS = Object.freeze(families.map(([id, label, stops, rate, secondRate]) => ({
    id, label,
    colors: [0, 2, 4, 6].flatMap((i) => ramp(stops[i], stops[i + 1])),
    cycleRanges: [{ start: 8, end: 15, rate, direction: 1 }, { start: 16, end: 23, rate: secondRate, direction: -1 }]
})));
