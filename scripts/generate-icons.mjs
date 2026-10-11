// Erzeugt die PNG-App-Icons (PWA-Installation, iOS-Startbildschirm) aus dem
// Logo frontend/public/icons/oncoplan.svg – ohne externe Werkzeuge.
// Das Logo besteht nur aus achsenparallelen Rechtecken; die werden hier mit
// Kantenglättung gerastert und als PNG (zlib aus Node) geschrieben.
// Aufruf aus der Projektwurzel: `node scripts/generate-icons.mjs`
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { deflateSync } from 'node:zlib';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const iconDir = path.join(root, 'frontend', 'public', 'icons');
const svg = readFileSync(path.join(iconDir, 'oncoplan.svg'), 'utf8');

const viewBox = Number(/viewBox="0 0 (\d+) \d+"/.exec(svg)?.[1]);
const attr = (tag, name, fallback) => {
  const m = new RegExp(`\\b${name}="([^"]+)"`).exec(tag);
  return m ? m[1] : fallback;
};
const rects = [...svg.matchAll(/<rect\b[^>]*>/g)].map(([tag]) => {
  const hex = attr(tag, 'fill', '#000000').slice(1);
  return {
    x: Number(attr(tag, 'x', '0')),
    y: Number(attr(tag, 'y', '0')),
    w: Number(attr(tag, 'width', '0')),
    h: Number(attr(tag, 'height', '0')),
    rgb: [0, 2, 4].map((i) => parseInt(hex.slice(i, i + 2), 16)),
  };
});
if (!viewBox || rects.length === 0) throw new Error('oncoplan.svg konnte nicht gelesen werden');

/** Anteil des Pixels [px, px+1) × [py, py+1), den das Rechteck (in Pixeln) bedeckt */
const coverage = (r, px, py) =>
  Math.max(0, Math.min(px + 1, r.x + r.w) - Math.max(px, r.x)) *
  Math.max(0, Math.min(py + 1, r.y + r.h) - Math.max(py, r.y));

function render(size) {
  const s = size / viewBox;
  const scaled = rects.map((r) => ({ ...r, x: r.x * s, y: r.y * s, w: r.w * s, h: r.h * s }));
  const rgba = Buffer.alloc(size * size * 4);
  for (let py = 0; py < size; py++) {
    for (let px = 0; px < size; px++) {
      let color = [0, 0, 0];
      let alpha = 0;
      for (const r of scaled) {
        const a = coverage(r, px, py);
        if (a === 0) continue;
        color = color.map((c, i) => c * (1 - a) + r.rgb[i] * a);
        alpha = alpha * (1 - a) + a;
      }
      const o = (py * size + px) * 4;
      color.forEach((c, i) => (rgba[o + i] = Math.round(alpha ? c / alpha : 0)));
      rgba[o + 3] = Math.round(alpha * 255);
    }
  }
  return encodePng(size, rgba);
}

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
const crc32 = (buf) => {
  let c = 0xffffffff;
  for (const b of buf) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};
function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}
function encodePng(size, rgba) {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(size, 0);
  header.writeUInt32BE(size, 4);
  header[8] = 8; // Bittiefe
  header[9] = 6; // RGBA
  const raw = Buffer.alloc(size * (size * 4 + 1));
  for (let y = 0; y < size; y++) rgba.copy(raw, y * (size * 4 + 1) + 1, y * size * 4, (y + 1) * size * 4);
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

// Das Logo ist vollflächig und das Motiv liegt mittig in der "Safe Zone",
// daher taugen dieselben Bilder auch als maskierbare Android-Icons.
for (const [file, size] of [
  ['icon-192.png', 192],
  ['icon-512.png', 512],
  ['apple-touch-icon.png', 180],
  ['favicon-32.png', 32],
]) {
  writeFileSync(path.join(iconDir, file), render(size));
  console.log(`✔ frontend/public/icons/${file} (${size}×${size})`);
}
