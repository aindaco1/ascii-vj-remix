/**
 * Decode the Python-generated test vectors with the SHIPPED codec.js and verify
 * every frame matches the ground-truth framebuffer byte-for-byte.
 *
 * This exercises the real cross-language risk surface: zlib (Python) ->
 * DecompressionStream (JS), little-endian delta indices, and delta patching.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadShippedCodec } from './load_codec.mjs';

const codec = loadShippedCodec();
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const vectorRoot = process.argv[2]
  ? path.resolve(process.argv[2])
  : path.join(__dirname, 'vectors');

function readChunks(buf) {
  const out = [];
  let off = 0;
  while (off + 4 <= buf.length) {
    const len = buf.readUInt32BE(off); off += 4;
    out.push(new Uint8Array(buf.subarray(off, off + len))); off += len;
  }
  return out;
}

async function checkDir(dir) {
  const name = path.basename(dir);
  const meta = JSON.parse(fs.readFileSync(path.join(dir, 'meta.json')));
  const msgs = readChunks(fs.readFileSync(path.join(dir, 'adaptive.bin')));
  const truth = readChunks(fs.readFileSync(path.join(dir, 'truth.bin')));
  const dec = codec.makeDecoder(meta.cellBytes);

  let mismatches = 0, firstBad = null;
  for (let i = 0; i < msgs.length; i++) {
    const { frame } = await dec.decode(msgs[i]);
    const want = truth[i];
    if (frame.length !== want.length) { mismatches++; firstBad ??= [i, 'len', want.length, frame.length]; continue; }
    for (let j = 0; j < want.length; j++) {
      if (frame[j] !== want[j]) { mismatches++; firstBad ??= [i, 'byte@' + j, want[j], frame[j]]; break; }
    }
  }
  const pct = (100 * meta.adaptiveBytes / meta.legacyBytes).toFixed(1);
  const status = mismatches === 0 ? 'PASS bit-exact' : `FAIL (${mismatches})`;
  console.log(
    `${name.padEnd(20)} ${String(msgs.length).padStart(3)} frames  ` +
    `${status.padEnd(16)} wire ${pct}% of legacy` +
    (firstBad ? `  firstBad=${JSON.stringify(firstBad)}` : '')
  );
  return mismatches === 0;
}

(async () => {
  const names = fs.readdirSync(vectorRoot)
    .map((name) => path.join(vectorRoot, name))
    .filter((dir) => fs.statSync(dir).isDirectory() && fs.existsSync(path.join(dir, 'meta.json')))
    .sort();
  if (names.length === 0) {
    throw new Error(`${vectorRoot} does not contain vector fixtures. Run experiments/gen_vectors.py first.`);
  }
  console.log('Decoding with codec.js, comparing to ground truth:\n');
  let allPass = true;
  for (const n of names) allPass = (await checkDir(n)) && allPass;
  console.log('\n' + (allPass ? 'ALL VECTORS BIT-EXACT' : 'SOME VECTORS FAILED'));
  process.exit(allPass ? 0 : 1);
})().catch((e) => { console.error(e); process.exit(2); });
