# GNU Unifont atlas source

ASCII VJ Remix 0.9.11 uses the pinned GNU Unifont 17.0.05 Plane 0 hexadecimal
source to generate its built-in neutral glyph atlas. The application does not
download fonts or glyphs at runtime.

- Source: `unifont-17.0.05.hex.gz`
- Source SHA-256: `2ae5311c8e123e9e85f5331cd012aa99757071df23243f1487fdbf8f3acd86be`
- Upstream: <https://www.unifoundry.com/unifont/index.html>
- License details: `LICENSE.txt`
- SIL Open Font License 1.1 text: `OFL-1.1.txt`

Regenerate the deterministic runtime pages with `npm run glyphs:generate`.
The generator includes only the Unicode ranges declared in
`renderers/shared/character-sets.js`. Glyph IDs are Unicode scalar values, so
all renderers share the same mapping without a second lookup table.
