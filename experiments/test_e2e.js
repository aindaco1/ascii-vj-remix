/**
 * End-to-end correctness test across the Python<->JS boundary.
 *
 * Connects to the live ASCILINE server twice:
 *   1. /ws                 -> legacy raw frames (ground truth)
 *   2. /ws?codec=adaptive  -> adaptive frames, decoded with the SHIPPED codec.js
 *
 * Asserts every adaptive-decoded frame is byte-identical to the legacy frame,
 * and reports bytes-on-wire savings.
 *
 * Usage: node experiments/test_e2e.js <port> [maxFrames]
 */
import { loadShippedCodec } from './load_codec.mjs';

const codec = loadShippedCodec();

const PORT = process.argv[2] || '8011';
const MAX = parseInt(process.argv[3] || '60', 10);

function collect(url, { decode }) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(url);
    ws.binaryType = 'arraybuffer';
    const frames = new Map(); // frameIndex -> Uint8Array
    let wireBytes = 0, cellBytes = 4, decoder = null, chain = Promise.resolve();

    ws.onmessage = (ev) => {
      if (typeof ev.data === 'string') {
        if (ev.data.startsWith('INIT:')) {
          const p = ev.data.split(':');
          const pixel = p.length > 5 && parseInt(p[5]) === 1;
          cellBytes = pixel ? 3 : 4;
          if (decode) decoder = codec.makeDecoder(cellBytes);
        }
        return;
      }
      wireBytes += ev.data.byteLength;
      if (decode) {
        chain = chain.then(async () => {
          const { frameIndex, frame } = await decoder.decode(ev.data);
          if (frames.size < MAX) frames.set(frameIndex, frame);
          if (frames.size >= MAX) ws.close();
        });
      } else {
        const u = new Uint8Array(ev.data);
        const dv = new DataView(ev.data);
        const idx = dv.getUint32(0, false);
        if (frames.size < MAX) frames.set(idx, u.subarray(4)); // strip 4B header
        if (frames.size >= MAX) ws.close();
      }
    };
    ws.onclose = async () => { await chain; resolve({ frames, wireBytes }); };
    ws.onerror = (e) => reject(e.error || new Error('ws error'));
  });
}

(async () => {
  const base = `ws://localhost:${PORT}/ws`;
  console.log(`Collecting ${MAX} frames from each stream on port ${PORT}...`);
  const legacy = await collect(base, { decode: false });
  const adaptive = await collect(base + '?codec=adaptive', { decode: true });

  let compared = 0, mismatches = 0, firstBad = null;
  for (const [idx, legFrame] of legacy.frames) {
    const advFrame = adaptive.frames.get(idx);
    if (!advFrame) continue;
    compared++;
    if (legFrame.length !== advFrame.length) { mismatches++; firstBad ??= [idx, 'len', legFrame.length, advFrame.length]; continue; }
    for (let i = 0; i < legFrame.length; i++) {
      if (legFrame[i] !== advFrame[i]) { mismatches++; firstBad ??= [idx, 'byte', i, legFrame[i], advFrame[i]]; break; }
    }
  }

  const kb = (x) => (x / 1024).toFixed(0);
  console.log(`\nframes compared : ${compared}`);
  console.log(`mismatches      : ${mismatches}  ${mismatches === 0 ? 'PASS (bit-exact)' : 'FAIL'}`);
  if (firstBad) console.log(`first mismatch  : frame=${firstBad[0]} ${firstBad.slice(1).join(' ')}`);
  console.log(`\nwire bytes legacy   : ${kb(legacy.wireBytes)} KB`);
  console.log(`wire bytes adaptive : ${kb(adaptive.wireBytes)} KB  (${(100 * adaptive.wireBytes / legacy.wireBytes).toFixed(1)}% of legacy)`);
  process.exit(mismatches === 0 ? 0 : 1);
})().catch((e) => { console.error('ERROR', e); process.exit(2); });
