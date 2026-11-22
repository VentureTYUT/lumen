import test from 'node:test';
import assert from 'node:assert/strict';
import zlib from 'node:zlib';
import { encodePNG } from '../src/png.js';

function parseChunks(buf) {
  assert.deepEqual([...buf.subarray(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10]);
  const chunks = [];
  let off = 8;
  while (off < buf.length) {
    const len = buf.readUInt32BE(off);
    const type = buf.toString('ascii', off + 4, off + 8);
    const data = buf.subarray(off + 8, off + 8 + len);
    chunks.push({ type, data });
    off += 12 + len;
  }
  return chunks;
}

test('PNG signature, IHDR and IEND are well-formed', () => {
  const w = 2;
  const h = 2;
  const rgb = new Uint8Array([255, 0, 0, 0, 255, 0, 0, 0, 255, 255, 255, 255]);
  const png = encodePNG(w, h, rgb);
  const chunks = parseChunks(png);
  assert.deepEqual(chunks.map((c) => c.type), ['IHDR', 'IDAT', 'IEND']);
  const ihdr = chunks[0].data;
  assert.equal(ihdr.readUInt32BE(0), w);
  assert.equal(ihdr.readUInt32BE(4), h);
  assert.equal(ihdr[8], 8); // bit depth
  assert.equal(ihdr[9], 2); // truecolor
});

test('IDAT decompresses to exactly the source rows', () => {
  const w = 3;
  const h = 2;
  const rgb = new Uint8Array(w * h * 3);
  for (let i = 0; i < rgb.length; i++) rgb[i] = (i * 37) & 255;
  const png = encodePNG(w, h, rgb);
  const idat = parseChunks(png).find((c) => c.type === 'IDAT').data;
  const raw = zlib.inflateSync(idat);
  assert.equal(raw.length, h * (1 + w * 3));
  const rowLen = w * 3;
  for (let y = 0; y < h; y++) {
    const rowStart = y * (1 + rowLen);
    assert.equal(raw[rowStart], 0); // filter type none
    const got = raw.subarray(rowStart + 1, rowStart + 1 + rowLen);
    const want = rgb.subarray(y * rowLen, (y + 1) * rowLen);
    assert.deepEqual([...got], [...want]);
  }
});

test('PNG chunk CRCs are valid', () => {
  const rgb = new Uint8Array(4 * 3).fill(128);
  const png = encodePNG(2, 2, rgb);
  // Recompute CRC for every chunk; a mismatch would mean a corrupt file.
  const table = (() => {
    const t = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      t[n] = c >>> 0;
    }
    return t;
  })();
  const crc = (bytes) => {
    let c = 0xffffffff;
    for (const b of bytes) c = table[(c ^ b) & 0xff] ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
  };
  let off = 8;
  while (off < png.length) {
    const len = png.readUInt32BE(off);
    const typeAndData = png.subarray(off + 4, off + 8 + len);
    const stored = png.readUInt32BE(off + 8 + len);
    assert.equal(crc(typeAndData), stored);
    off += 12 + len;
  }
});
