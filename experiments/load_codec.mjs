import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

export function loadShippedCodec() {
  if (!globalThis.Blob || !globalThis.Response || !globalThis.DecompressionStream) {
    throw new Error('Node runtime must provide Blob, Response, and DecompressionStream.');
  }

  const codecPath = fileURLToPath(new URL('../codec.js', import.meta.url));
  const source = readFileSync(codecPath, 'utf8');
  const module = { exports: {} };
  const sandbox = {
    module,
    exports: module.exports,
    Blob: globalThis.Blob,
    Response: globalThis.Response,
    DecompressionStream: globalThis.DecompressionStream,
    Uint8Array: globalThis.Uint8Array,
    DataView: globalThis.DataView,
    ArrayBuffer: globalThis.ArrayBuffer,
    console
  };
  sandbox.globalThis = sandbox;
  sandbox.self = {};
  sandbox.window = sandbox.self;

  vm.runInNewContext(source, sandbox, { filename: codecPath });
  return module.exports;
}
