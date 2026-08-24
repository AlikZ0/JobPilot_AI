/**
 * Packages dist/ as dist.zip for the Chrome Web Store.
 * Uses the system `zip` binary when available and falls back to a minimal
 * store-only zip writer so the script works with no extra dependencies.
 */
import { spawnSync } from 'node:child_process';
import { deflateRawSync, crc32 } from 'node:zlib';
import { readdirSync, readFileSync, statSync, writeFileSync, rmSync, existsSync } from 'node:fs';
import { join, relative, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const DIST = join(ROOT, 'dist');
const OUT = join(ROOT, 'dist.zip');

if (!existsSync(join(DIST, 'manifest.json'))) {
  console.error('dist/manifest.json is missing — run `npm run build` first.');
  process.exit(1);
}

rmSync(OUT, { force: true });

const system = spawnSync('zip', ['-r', '-q', OUT, '.', '-x', '*.map'], { cwd: DIST });
if (system.status === 0) {
  console.log(`Wrote ${relative(ROOT, OUT)} (system zip)`);
  process.exit(0);
}

function collect(dir) {
  const out = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...collect(full));
    else if (!entry.endsWith('.map')) out.push(full);
  }
  return out;
}

const files = collect(DIST);
const chunks = [];
const central = [];
let offset = 0;

const dosTime = () => {
  // A fixed timestamp keeps builds reproducible.
  const date = new Date('2020-01-01T00:00:00Z');
  const time = ((date.getUTCHours() << 11) | (date.getUTCMinutes() << 5) | 0) & 0xffff;
  const day =
    (((date.getUTCFullYear() - 1980) << 9) | ((date.getUTCMonth() + 1) << 5) | date.getUTCDate()) &
    0xffff;
  return { time, day };
};
const { time, day } = dosTime();

for (const file of files) {
  const name = relative(DIST, file).split('\\').join('/');
  const content = readFileSync(file);
  const compressed = deflateRawSync(content, { level: 9 });
  const crc = crc32(content) >>> 0;
  const nameBytes = Buffer.from(name, 'utf8');

  const local = Buffer.alloc(30);
  local.writeUInt32LE(0x04034b50, 0);
  local.writeUInt16LE(20, 4);
  local.writeUInt16LE(0, 6);
  local.writeUInt16LE(8, 8);
  local.writeUInt16LE(time, 10);
  local.writeUInt16LE(day, 12);
  local.writeUInt32LE(crc, 14);
  local.writeUInt32LE(compressed.length, 18);
  local.writeUInt32LE(content.length, 22);
  local.writeUInt16LE(nameBytes.length, 26);
  chunks.push(local, nameBytes, compressed);

  const header = Buffer.alloc(46);
  header.writeUInt32LE(0x02014b50, 0);
  header.writeUInt16LE(20, 4);
  header.writeUInt16LE(20, 6);
  header.writeUInt16LE(0, 8);
  header.writeUInt16LE(8, 10);
  header.writeUInt16LE(time, 12);
  header.writeUInt16LE(day, 14);
  header.writeUInt32LE(crc, 16);
  header.writeUInt32LE(compressed.length, 20);
  header.writeUInt32LE(content.length, 24);
  header.writeUInt16LE(nameBytes.length, 28);
  header.writeUInt32LE(offset, 42);
  central.push(header, nameBytes);

  offset += local.length + nameBytes.length + compressed.length;
}

const centralBuffer = Buffer.concat(central);
const end = Buffer.alloc(22);
end.writeUInt32LE(0x06054b50, 0);
end.writeUInt16LE(files.length, 8);
end.writeUInt16LE(files.length, 10);
end.writeUInt32LE(centralBuffer.length, 12);
end.writeUInt32LE(offset, 16);

writeFileSync(OUT, Buffer.concat([...chunks, centralBuffer, end]));
console.log(`Wrote ${relative(ROOT, OUT)} (${files.length} files)`);
