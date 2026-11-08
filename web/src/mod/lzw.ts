/**
 * lzw.ts
 *
 * Bytes packed as the DOS game's LZW files are (data/lzw.ts reads them):
 * the length, then 9-bit codes, each byte a code of its own, with a Clear
 * often enough that the codes never grow wider. No smaller than what it
 * packs, but it is what the engine expects to unpack.
 */

const CLEAR = 256;
const END = 257;
/** Codes after a Clear before the next: the table's next entry stays below 512, so codes stay 9 bits. */
const RUN = 250;

export function lzwPack(bytes: Uint8Array): Uint8Array {
  const out: number[] = [];
  let buffer = 0;
  let bits = 0;
  const put = (code: number): void => {
    buffer |= code << bits;
    bits += 9;
    while (bits >= 8) {
      out.push(buffer & 0xff);
      buffer >>>= 8;
      bits -= 8;
    }
  };
  for (let i = 0; i < bytes.length; i++) {
    if (i % RUN === 0) put(CLEAR);
    put(bytes[i]);
  }
  put(END);
  if (bits > 0) out.push(buffer & 0xff);
  const n = bytes.length;
  return new Uint8Array([n & 0xff, (n >> 8) & 0xff, (n >> 16) & 0xff, (n >>> 24) & 0xff, ...out]);
}
