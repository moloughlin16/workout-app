// Generates solid-color PNG icons for the PWA, using only Node built-ins.
// No npm packages required. PNG is constructed by hand using zlib.
//
// Output:
//   public/icon-192.png  (Android home screen, manifest)
//   public/icon-512.png  (large source, manifest, splash)
//   public/apple-icon-180.png  (iOS Safari "Add to Home Screen")
//
// Design: solid Tailwind green-600 background with a white circle in the
// middle so the icon doesn't look like a featureless block. Replace later
// with a real designed icon if you want.

const fs = require("fs");
const path = require("path");
const zlib = require("zlib");

// Tailwind green-600
const BG = { r: 0x16, g: 0xa3, b: 0x4a };
const FG = { r: 0xff, g: 0xff, b: 0xff };

// ---- PNG building blocks ---------------------------------------------------

function crc32(buf) {
  if (!crc32.table) {
    const t = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) {
        c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      }
      t[n] = c >>> 0;
    }
    crc32.table = t;
  }
  let crc = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    crc = (crc >>> 8) ^ crc32.table[(crc ^ buf[i]) & 0xff];
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const typeBuf = Buffer.from(type, "ascii");
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
  return Buffer.concat([len, typeBuf, data, crc]);
}

function makeIcon(size) {
  // Filled rectangle background, white disc in middle (radius = 30% of size).
  const cx = size / 2;
  const cy = size / 2;
  const r = size * 0.3;
  const r2 = r * r;

  const rowStride = size * 3 + 1; // +1 filter byte per row
  const raw = Buffer.alloc(rowStride * size);

  for (let y = 0; y < size; y++) {
    raw[y * rowStride] = 0; // filter type: none
    for (let x = 0; x < size; x++) {
      const dx = x - cx + 0.5;
      const dy = y - cy + 0.5;
      const inside = dx * dx + dy * dy <= r2;
      const c = inside ? FG : BG;
      const o = y * rowStride + 1 + x * 3;
      raw[o] = c.r;
      raw[o + 1] = c.g;
      raw[o + 2] = c.b;
    }
  }

  // PNG signature
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

  // IHDR chunk
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8;  // bit depth
  ihdr[9] = 2;  // color type: RGB
  ihdr[10] = 0; // compression
  ihdr[11] = 0; // filter
  ihdr[12] = 0; // interlace

  const idat = zlib.deflateSync(raw);

  return Buffer.concat([
    sig,
    chunk("IHDR", ihdr),
    chunk("IDAT", idat),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

// ---- Write files -----------------------------------------------------------

const outDir = path.join(__dirname, "..", "public");
const targets = [
  { name: "icon-192.png", size: 192 },
  { name: "icon-512.png", size: 512 },
  { name: "apple-icon-180.png", size: 180 },
];

for (const t of targets) {
  const buf = makeIcon(t.size);
  fs.writeFileSync(path.join(outDir, t.name), buf);
  console.log(`wrote ${t.name} (${buf.length} bytes)`);
}
