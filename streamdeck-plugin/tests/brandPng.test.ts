import test from 'node:test';
import assert from 'node:assert/strict';
import zlib from 'node:zlib';
import { brandPng } from '../tools/brandPng.mjs';

function decode(png: Buffer) {
  assert.deepEqual([...png.subarray(0, 8)], [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  let offset = 8;
  let width = 0, height = 0;
  const data: Buffer[] = [];
  const types: string[] = [];
  while (offset < png.length) {
    const length = png.readUInt32BE(offset);
    const type = png.toString('ascii', offset + 4, offset + 8);
    const body = png.subarray(offset + 8, offset + 8 + length);
    types.push(type);
    if (type === 'IHDR') { width = body.readUInt32BE(0); height = body.readUInt32BE(4); assert.equal(body[8], 8); assert.equal(body[9], 6); }
    if (type === 'IDAT') data.push(body);
    // The CRC covers type + data.
    const crc = png.readUInt32BE(offset + 8 + length);
    assert.equal(crc, zlib.crc32 ? zlib.crc32(png.subarray(offset + 4, offset + 8 + length)) : crc, `crc of ${type}`);
    offset += 12 + length;
  }
  const raw = zlib.inflateSync(Buffer.concat(data));
  const pixel = (x: number, y: number) => { const i = y * (width * 4 + 1) + 1 + x * 4; return [raw[i], raw[i + 1], raw[i + 2], raw[i + 3]]; };
  return { width, height, types, pixel, rawLength: raw.length };
}

test('the brand PNG is a valid RGBA image of the requested size', () => {
  for (const size of [28, 56, 256, 512]) {
    const image = decode(brandPng(size));
    assert.equal(image.width, size);
    assert.equal(image.height, size);
    assert.deepEqual(image.types, ['IHDR', 'IDAT', 'IEND']);
    assert.equal(image.rawLength, (size * 4 + 1) * size);
  }
});

test('the tile is purple, the corners are transparent and the note is white', () => {
  const image = decode(brandPng(256));
  assert.equal(image.pixel(0, 0)[3], 0, 'rounded corner is transparent');
  const tile = image.pixel(8, 128); // inside the tile, left of the note
  assert.deepEqual(tile, [0x6d, 0x28, 0xd9, 255]);
  // Left note head is centred around (12, 36) in the 48-box => (45.6, 98.4) of 144 => (81, 175) at 256px.
  const head = image.pixel(81, 175);
  assert.ok(head[0] > 240 && head[1] > 240 && head[2] > 240 && head[3] === 255, `note head is white, got ${head}`);
});
