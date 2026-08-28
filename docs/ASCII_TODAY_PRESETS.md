# ascii.today Character Presets

ASCII VJ Remix includes 23 read-only character presets inspired by the
curated FIGlet fonts at [ascii.today](https://ascii.today/). Each preset is
named after its source character set and is also available in the compact
Character Set menu.

ascii.today's source material is made for multiline title banners. ASCII VJ
Remix instead maps one character to each video cell according to luminance. To
make the two models compatible, each preset uses a short light-to-dense ramp
derived from the source font's printable drawing-symbol vocabulary. The app
does not bundle the original `.flf` files, title renderer, or any online runtime
dependency.

## Included Presets

| Preset / character set | Credited font author |
| --- | --- |
| Broadway KB | myflix |
| Computer | Mike Rosulek |
| Contessa | Christopher Joseph Pirillo |
| Cricket | Leslie Bates |
| Doom | Frans P. de Vries |
| Line Blocks | Bateau |
| Fire Font-k | MJP |
| Ghost | myflix |
| Larry 3D | Larry Gelberg |
| Mini | Glenn Chappell |
| Modular | MJP |
| Nancyj | Eamon Daly |
| Pepper | Juan Car |
| Rounded | Nick Miners |
| Script | Glenn Chappell |
| Soft | myflix |
| Stampatello | Marco Bodrato |
| Standard | Glenn Chappell & Ian Chai |
| Thick | Randall Ransom |
| Wavy | Brian Krog |
| Univers | Glenn Chappell |
| 3D Diagonal | nabis, LG Beard, Markus Gebhard and others |
| Doh | Curtis Wanner |

Names and author credits come from ascii.today's curated
[`fonts.json`](https://github.com/lokesh/ascii-today/blob/master/src/data/fonts.json).
The site source is published at
[`lokesh/ascii-today`](https://github.com/lokesh/ascii-today). Individual
FIGlet source files can contain additional author or modification comments;
those files are not redistributed by ASCII VJ Remix.

## Renderer Contract

- Every ramp begins with a space and contains 8–15 unique printable ASCII
  characters ordered from lighter to denser marks.
- The shared catalog lives in `renderers/shared/character-sets.js`.
- Canvas2D preview, stream fallback, WTF anchors, MIDI character-set stepping,
  saved presets, and native Pop Out consume the same canonical character-set
  id.
- Native Pop Out receives the resolved ramp, bounds it to supported Unicode
  scalar ids, and draws only from the locally bundled neutral atlas. These
  ASCII ramps retain their stricter space-leading/unique catalog contract even
  though the general custom-ramp control also supports documented Unicode
  blocks.
- `npm run test:render-math` validates catalog ids, bounds, uniqueness, source
  metadata, and luminance lookup. Rust tests validate native ramp filtering.

## Selection Boundary

The pack favors source fonts whose drawing-symbol vocabularies produce useful
ramps with at least eight distinct luminance steps. Sparse or duplicate symbol
vocabularies are excluded because they do not provide a useful luminance ramp.
Prospective preset expansion belongs in the [Roadmap](ROADMAP.md).
