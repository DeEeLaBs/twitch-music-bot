// Renders the brand icon (purple rounded tile with a white music note) as a PNG without any image library.
// Stream Deck requires PNG for the plugin and category icons; everything else in the plugin uses SVG.
import zlib from 'node:zlib';

const VIEW = 144; // same coordinate system as renderBrandIcon() in src/core/render.ts
const TILE = [0x6d, 0x28, 0xd9];
const NOTE = [0xfa, 0xfa, 0xfa];
const SCALE = 2.2;
const OFFSET = 72 - 24 * SCALE;
const map = ([x, y]) => [OFFSET + x * SCALE, OFFSET + y * SCALE];
const STEM = [[18, 36], [18, 10]].map(map);
const BEAM = [[18, 10], [40, 5]].map(map);
const STEM2 = [[40, 5], [40, 31]].map(map);
const HEADS = [[12, 36], [34, 31]].map(map);
const HALF_STROKE = 2 * SCALE;
const HEAD_RADIUS = 6 * SCALE;

function distanceToSegment(px, py, [[ax, ay], [bx, by]]) {
  const dx = bx - ax, dy = by - ay;
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy)));
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}

function insideTile(x, y) {
  const r = 26;
  const cx = Math.min(Math.max(x, r), VIEW - r);
  const cy = Math.min(Math.max(y, r), VIEW - r);
  return Math.hypot(x - cx, y - cy) <= r;
}

function insideNote(x, y) {
  return [STEM, BEAM, STEM2].some(segment => distanceToSegment(x, y, segment) <= HALF_STROKE)
    || HEADS.some(([hx, hy]) => Math.hypot(x - hx, y - hy) <= HEAD_RADIUS);
}

const crcTable = Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
function crc32(buffer) { let c = 0xffffffff; for (const byte of buffer) c = crcTable[(c ^ byte) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; }
function chunk(type, data) {
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const out = Buffer.alloc(body.length + 8);
  out.writeUInt32BE(data.length, 0);
  body.copy(out, 4);
  out.writeUInt32BE(crc32(body), body.length + 4);
  return out;
}

/** Returns a size x size RGBA PNG. */
export function brandPng(size) {
  const samples = 3; // 3x3 supersampling for smooth edges
  const stride = size * 4 + 1;
  const raw = Buffer.alloc(stride * size);
  for (let y = 0; y < size; y++) {
    raw[y * stride] = 0; // filter: none
    for (let x = 0; x < size; x++) {
      let tile = 0, note = 0;
      for (let sy = 0; sy < samples; sy++) for (let sx = 0; sx < samples; sx++) {
        const vx = ((x + (sx + 0.5) / samples) / size) * VIEW;
        const vy = ((y + (sy + 0.5) / samples) / size) * VIEW;
        if (insideTile(vx, vy)) { tile++; if (insideNote(vx, vy)) note++; }
      }
      const total = samples * samples;
      const alpha = tile / total;
      const mix = tile ? note / tile : 0;
      const offset = y * stride + 1 + x * 4;
      for (let c = 0; c < 3; c++) raw[offset + c] = Math.round(TILE[c] * (1 - mix) + NOTE[c] * mix);
      raw[offset + 3] = Math.round(alpha * 255);
    }
  }
  const header = Buffer.alloc(13);
  header.writeUInt32BE(size, 0); header.writeUInt32BE(size, 4);
  header[8] = 8; header[9] = 6; // 8 bit, RGBA
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', header), chunk('IDAT', zlib.deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0))
  ]);
}
