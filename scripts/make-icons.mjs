// 生成 PWA 图标（纯 Node，无第三方依赖）。
// 图形：松绿圆角方块 + 琥珀胶囊 + 米白对勾，16px 下仍可辨认。
import { deflateSync } from "node:zlib";
import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const outDir = join(root, "public", "icons");
mkdirSync(outDir, { recursive: true });

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

function encodePNG(width, height, rgba) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  const raw = Buffer.alloc((width * 4 + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (width * 4 + 1)] = 0;
    rgba.copy(raw, y * (width * 4 + 1) + 1, y * width * 4, (y + 1) * width * 4);
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

const hex = (h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
const PINE_TOP = hex("#12705C");
const PINE_BOT = hex("#062B23");
const AMBER_A = hex("#F5CE86");
const AMBER_B = hex("#E0912A");
const CREAM = hex("#FFFCF5");

function sdRoundRect(px, py, cx, cy, hw, hh, r) {
  const dx = Math.abs(px - cx) - (hw - r);
  const dy = Math.abs(py - cy) - (hh - r);
  const ax = Math.max(dx, 0);
  const ay = Math.max(dy, 0);
  return Math.min(Math.max(dx, dy), 0) + Math.hypot(ax, ay) - r;
}

function sdSegment(px, py, ax, ay, bx, by) {
  const vx = bx - ax;
  const vy = by - ay;
  const wx = px - ax;
  const wy = py - ay;
  const t = Math.max(0, Math.min(1, (wx * vx + wy * vy) / (vx * vx + vy * vy)));
  return Math.hypot(px - (ax + vx * t), py - (ay + vy * t));
}

const clamp01 = (v) => Math.max(0, Math.min(1, v));
const mix = (a, b, t) => a + (b - a) * t;

function render(size, { maskable = false } = {}) {
  const SS = 3;
  const W = size * SS;
  const acc = new Float64Array(size * size * 4);
  const pad = maskable ? 0.16 : 0.045;
  const tileHalf = 0.5 - pad;
  const radius = maskable ? 0.1 : 0.2;

  // 胶囊：从左下到右上
  const capAx = 0.3;
  const capAy = 0.68;
  const capBx = 0.66;
  const capBy = 0.32;
  const capR = 0.115;
  // 对勾
  const c1x = 0.4;
  const c1y = 0.55;
  const c2x = 0.5;
  const c2y = 0.66;
  const c3x = 0.72;
  const c3y = 0.4;
  const checkR = 0.052;

  for (let y = 0; y < W; y++) {
    const ny = (y + 0.5) / W;
    for (let x = 0; x < W; x++) {
      const nx = (x + 0.5) / W;
      const dTile = sdRoundRect(nx, ny, 0.5, 0.5, tileHalf, tileHalf, radius);
      const tileA = clamp01(0.5 - dTile * W);
      if (tileA <= 0) continue;

      const g = clamp01((ny - pad) / (1 - pad * 2));
      let r = mix(PINE_TOP[0], PINE_BOT[0], g);
      let gg = mix(PINE_TOP[1], PINE_BOT[1], g);
      let b = mix(PINE_TOP[2], PINE_BOT[2], g);

      // 左上柔光
      const glow = clamp01(1 - Math.hypot(nx - 0.26, ny - 0.2) / 0.72) ** 2 * 0.22;
      r = mix(r, 95, glow);
      gg = mix(gg, 191, glow);
      b = mix(b, 166, glow);

      const dCap = sdSegment(nx, ny, capAx, capAy, capBx, capBy) - capR;
      const capA = clamp01(0.5 - dCap * W);
      if (capA > 0) {
        const t = clamp01(((nx - capAx) * (capBx - capAx) + (ny - capAy) * (capBy - capAy)) / 0.26);
        const cr = mix(AMBER_A[0], AMBER_B[0], t);
        const cg = mix(AMBER_A[1], AMBER_B[1], t);
        const cb = mix(AMBER_A[2], AMBER_B[2], t);
        r = mix(r, cr, capA);
        gg = mix(gg, cg, capA);
        b = mix(b, cb, capA);
        // 胶囊上半高光
        const hl = clamp01(1 - Math.abs(dCap + capR * 0.45) / (capR * 0.5)) * 0.28;
        r = mix(r, 255, hl * capA);
        gg = mix(gg, 250, hl * capA);
        b = mix(b, 235, hl * capA);
      }

      const dCheck = Math.min(sdSegment(nx, ny, c1x, c1y, c2x, c2y), sdSegment(nx, ny, c2x, c2y, c3x, c3y)) - checkR;
      const checkA = clamp01(0.5 - dCheck * W);
      if (checkA > 0) {
        r = mix(r, CREAM[0], checkA);
        gg = mix(gg, CREAM[1], checkA);
        b = mix(b, CREAM[2], checkA);
      }

      const ox = Math.floor(x / SS);
      const oy = Math.floor(y / SS);
      const idx = (oy * size + ox) * 4;
      const w = tileA / (SS * SS);
      acc[idx] += r * w;
      acc[idx + 1] += gg * w;
      acc[idx + 2] += b * w;
      acc[idx + 3] += 255 * w;
    }
  }

  const rgba = Buffer.alloc(size * size * 4);
  for (let i = 0; i < size * size; i++) {
    const a = acc[i * 4 + 3];
    const norm = a ? 255 / a : 0;
    rgba[i * 4] = Math.round(acc[i * 4] * norm);
    rgba[i * 4 + 1] = Math.round(acc[i * 4 + 1] * norm);
    rgba[i * 4 + 2] = Math.round(acc[i * 4 + 2] * norm);
    rgba[i * 4 + 3] = Math.round(a);
  }
  return encodePNG(size, size, rgba);
}

const targets = [
  ["icon-192.png", 192, {}],
  ["icon-512.png", 512, {}],
  ["maskable-512.png", 512, { maskable: true }],
  ["apple-touch-icon.png", 180, {}],
];

for (const [name, size, opts] of targets) {
  writeFileSync(join(outDir, name), render(size, opts));
  console.log(`生成 public/icons/${name} (${size}×${size})`);
}