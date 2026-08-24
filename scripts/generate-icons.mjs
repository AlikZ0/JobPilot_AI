/**
 * Generates the extension icon set as PNGs with zero dependencies.
 * Run: node scripts/generate-icons.mjs
 */
import { deflateSync } from 'node:zlib';
import { writeFileSync, mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const OUT = resolve(dirname(fileURLToPath(import.meta.url)), '../public/icons');
mkdirSync(OUT, { recursive: true });

const crcTable = (() => {
  const t = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c;
  }
  return t;
})();

function crc32(buf) {
  let c = -1;
  for (const b of buf) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

function png(size, pixel) {
  const raw = Buffer.alloc(size * (size * 4 + 1));
  let p = 0;
  for (let y = 0; y < size; y++) {
    raw[p++] = 0; // filter: none
    for (let x = 0; x < size; x++) {
      const [r, g, b, a] = pixel(x, y, size);
      raw[p++] = r;
      raw[p++] = g;
      raw[p++] = b;
      raw[p++] = a;
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

/** Rounded square badge with a stylised upward "pilot" chevron. */
function pixel(x, y, size) {
  const s = size;
  const r = s * 0.22;
  const inset = s * 0.04;
  const min = inset;
  const max = s - inset;
  const cx = Math.min(Math.max(x + 0.5, min + r), max - r);
  const cy = Math.min(Math.max(y + 0.5, min + r), max - r);
  const d = Math.hypot(x + 0.5 - cx, y + 0.5 - cy);
  if (d > r) return [0, 0, 0, 0];
  // Vertical brand gradient (indigo -> violet).
  const t = y / s;
  const bg = [
    Math.round(79 + (124 - 79) * t),
    Math.round(70 + (58 - 70) * t),
    Math.round(229 + (237 - 229) * t),
    255,
  ];
  // Chevron mark.
  const nx = (x + 0.5) / s;
  const ny = (y + 0.5) / s;
  const arm = Math.abs(nx - 0.5);
  const target = 0.66 - arm * 0.95;
  const thickness = 0.1;
  const inChevron = arm < 0.3 && Math.abs(ny - target) < thickness / 2;
  const inDot = Math.hypot(nx - 0.5, ny - 0.3) < 0.075;
  if (inChevron || inDot) return [255, 255, 255, 255];
  return bg;
}

for (const size of [16, 32, 48, 128]) {
  writeFileSync(resolve(OUT, `icon${size}.png`), png(size, pixel));
}
console.log('icons written to', OUT);
