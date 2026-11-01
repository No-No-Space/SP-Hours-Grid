// Build the installable plugin ZIP. No dependencies — Node 18+.
//   node scripts/build.mjs   →   dist/plugin/*  and  dist/sp-timesheets-<version>.zip
// Super Productivity loads index.html into an iframe that cannot fetch sibling files,
// so the calculation core is inlined into index.html here.
import { readFileSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { deflateRawSync } from 'node:zlib';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const src = join(root, 'src');
const dist = join(root, 'dist');
const out = join(dist, 'plugin');

const manifest = JSON.parse(readFileSync(join(src, 'manifest.json'), 'utf8'));
const core = readFileSync(join(src, 'timesheet-core.js'), 'utf8');
const tag = '<script src="./timesheet-core.js"></script>';
let html = readFileSync(join(src, 'index.html'), 'utf8');
if (!html.includes(tag)) throw new Error(`index.html must contain ${tag}`);
html = html.replace(tag, () => `<script>\n${core}\n</script>`);

rmSync(dist, { recursive: true, force: true });
mkdirSync(out, { recursive: true });
const files = {
  'manifest.json': JSON.stringify(manifest, null, 2) + '\n',
  'index.html': html,
  'icon.svg': readFileSync(join(src, 'icon.svg'), 'utf8'),
};
for (const [name, body] of Object.entries(files)) writeFileSync(join(out, name), body);

// ---- minimal ZIP writer (deflate, files at the archive root) ----
const CRC = new Uint32Array(256).map((_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
const crc32 = (buf) => {
  let c = 0xffffffff;
  for (const b of buf) c = CRC[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};
function zip(entries) {
  const locals = [], centrals = [];
  let offset = 0;
  const now = new Date();
  const dosTime = (now.getHours() << 11) | (now.getMinutes() << 5) | (now.getSeconds() >> 1);
  const dosDate = ((now.getFullYear() - 1980) << 9) | ((now.getMonth() + 1) << 5) | now.getDate();
  for (const [name, body] of Object.entries(entries)) {
    const data = Buffer.from(body, 'utf8');
    const comp = deflateRawSync(data);
    const nameBuf = Buffer.from(name, 'utf8');
    const crc = crc32(data);
    const lh = Buffer.alloc(30);
    lh.writeUInt32LE(0x04034b50, 0); lh.writeUInt16LE(20, 4); lh.writeUInt16LE(0x0800, 6);
    lh.writeUInt16LE(8, 8); lh.writeUInt16LE(dosTime, 10); lh.writeUInt16LE(dosDate, 12);
    lh.writeUInt32LE(crc, 14); lh.writeUInt32LE(comp.length, 18); lh.writeUInt32LE(data.length, 22);
    lh.writeUInt16LE(nameBuf.length, 26); lh.writeUInt16LE(0, 28);
    locals.push(lh, nameBuf, comp);
    const ch = Buffer.alloc(46);
    ch.writeUInt32LE(0x02014b50, 0); ch.writeUInt16LE(20, 4); ch.writeUInt16LE(20, 6);
    ch.writeUInt16LE(0x0800, 8); ch.writeUInt16LE(8, 10); ch.writeUInt16LE(dosTime, 12);
    ch.writeUInt16LE(dosDate, 14); ch.writeUInt32LE(crc, 16); ch.writeUInt32LE(comp.length, 20);
    ch.writeUInt32LE(data.length, 24); ch.writeUInt16LE(nameBuf.length, 28);
    ch.writeUInt32LE(offset, 42);
    centrals.push(ch, nameBuf);
    offset += lh.length + nameBuf.length + comp.length;
  }
  const cd = Buffer.concat(centrals);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(Object.keys(entries).length, 8); end.writeUInt16LE(Object.keys(entries).length, 10);
  end.writeUInt32LE(cd.length, 12); end.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, cd, end]);
}

const zipName = `sp-timesheets-${manifest.version}.zip`;
writeFileSync(join(dist, zipName), zip(files));
console.log(`Built dist/${zipName} (${Object.keys(files).join(', ')})`);
