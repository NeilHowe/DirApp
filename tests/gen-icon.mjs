// 生成图标：32x32、128x128、256x256 PNG 和 icon.ico
// icon.ico 必须是经典 3.00 格式（DIB，32 位 BGRA），Windows 资源编译器 rc.exe 不接受 PNG 条目
import { writeFileSync } from 'node:fs';
import { deflateSync } from 'node:zlib';

const PNG = (w, rgba) => {
  const crc = buf => { let c = ~0; for (const b of buf) { c ^= b; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; } return ~c >>> 0; };
  const chunk = (type, data) => { const b = Buffer.concat([Buffer.from(type), data]), l = Buffer.alloc(4); l.writeUInt32BE(data.length); const c = Buffer.alloc(4); c.writeUInt32BE(crc(b)); return Buffer.concat([l, b, c]); };
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(w, 4); ihdr[8] = 8; ihdr[9] = 6;
  const raw = Buffer.alloc(w * (w * 4 + 1));
  for (let y = 0; y < w; y++) { raw[y * (w * 4 + 1)] = 0; rgba.copy(raw, y * (w * 4 + 1) + 1, y * w * 4, (y + 1) * w * 4); }
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
};
// BITMAPINFOHEADER + 自下而上的 BGRA 像素 + AND 掩码（全 0，透明度走 alpha 通道）
const DIB = (w, rgba) => {
  const head = Buffer.alloc(40); head.writeUInt32LE(40, 0); head.writeInt32LE(w, 4); head.writeInt32LE(w * 2, 8); head.writeUInt16LE(1, 12); head.writeUInt16LE(32, 14);
  const xor = Buffer.alloc(w * w * 4);
  for (let y = 0; y < w; y++) for (let x = 0; x < w; x++) { const s = ((w - 1 - y) * w + x) * 4, d = (y * w + x) * 4; xor[d] = rgba[s + 2]; xor[d + 1] = rgba[s + 1]; xor[d + 2] = rgba[s]; xor[d + 3] = rgba[s + 3]; }
  return Buffer.concat([head, xor, Buffer.alloc(Math.ceil(w / 32) * 4 * w)]);
};
const ICO = imgs => {
  const head = Buffer.alloc(6); head.writeUInt16LE(1, 2); head.writeUInt16LE(imgs.length, 4);
  const entries = [], data = []; let off = 6 + 16 * imgs.length;
  for (const [w, buf] of imgs) {
    const e = Buffer.alloc(16); e[0] = w >= 256 ? 0 : w; e[1] = e[0]; e.writeUInt16LE(1, 2); e.writeUInt16LE(32, 6); e.writeUInt32LE(buf.length, 8); e.writeUInt32LE(off, 12);
    entries.push(e); data.push(buf); off += buf.length;
  }
  return Buffer.concat([head, ...entries, ...data]);
};
// 圆角矩形 + 三层地层线，和界面左上角的标志一致
const render = size => {
  const px = Buffer.alloc(size * size * 4), r = size * 0.25;
  const put = (x, y, c, a) => { const i = (y * size + x) * 4; const A = a / 255, o = px[i + 3] / 255, na = A + o * (1 - A); if (!na) return; for (let k = 0; k < 3; k++) px[i + k] = Math.round((c[k] * A + px[i + k] * o * (1 - A)) / na); px[i + 3] = Math.round(na * 255); };
  const inRound = (x, y) => { const d = v => v < r ? r - v : v > size - r ? v - (size - r) : 0, dx = d(x), dy = d(y); return dx || dy ? Math.hypot(dx, dy) <= r : true; };
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    if (!inRound(x + .5, y + .5)) continue;
    const t = (x + y) / (2 * size);
    put(x, y, [Math.round(109 + (58 - 109) * t), Math.round(124 + (79 - 124) * t), Math.round(255 + (216 - 255) * t)], 255);
  }
  const dist = (x, y, x1, y1, x2, y2) => { const dx = x2 - x1, dy = y2 - y1, l2 = dx * dx + dy * dy, u = Math.max(0, Math.min(1, ((x - x1) * dx + (y - y1) * dy) / l2)); return Math.hypot(x - (x1 + u * dx), y - (y1 + u * dy)); };
  const stroke = (x1, y1, x2, y2, w, a) => {
    const m = w + 1;
    for (let y = Math.max(0, Math.floor(Math.min(y1, y2) - m)); y < Math.min(size, Math.ceil(Math.max(y1, y2) + m)); y++)
      for (let x = Math.max(0, Math.floor(Math.min(x1, x2) - m)); x < Math.min(size, Math.ceil(Math.max(x1, x2) + m)); x++) {
        const d = dist(x + .5, y + .5, x1, y1, x2, y2);
        if (d < w / 2 + .6) put(x, y, [255, 255, 255], Math.round(a * Math.max(0, Math.min(1, w / 2 + .5 - d))));
      }
  };
  const S = size / 32;
  stroke(8 * S, 11.5 * S, 16 * S, 7.5 * S, 2 * S, 255); stroke(16 * S, 7.5 * S, 24 * S, 11.5 * S, 2 * S, 255); stroke(8 * S, 11.5 * S, 16 * S, 15.5 * S, 2 * S, 255); stroke(16 * S, 15.5 * S, 24 * S, 11.5 * S, 2 * S, 255);
  stroke(8 * S, 16 * S, 16 * S, 20 * S, 2 * S, 200); stroke(16 * S, 20 * S, 24 * S, 16 * S, 2 * S, 200);
  stroke(8 * S, 20.5 * S, 16 * S, 24.5 * S, 2 * S, 128); stroke(16 * S, 24.5 * S, 24 * S, 20.5 * S, 2 * S, 128);
  return px;
};
const sizes = [32, 128, 256];
const pngs = sizes.map(s => PNG(s, render(s)));
writeFileSync('src-tauri/icons/32x32.png', pngs[0]);
writeFileSync('src-tauri/icons/128x128.png', pngs[1]);
writeFileSync('src-tauri/icons/128x128@2x.png', pngs[2]);
writeFileSync('src-tauri/icons/icon.png', pngs[2]);
writeFileSync('src-tauri/icons/icon.ico', ICO([[32, DIB(32, render(32))], [48, DIB(48, render(48))], [256, DIB(256, render(256))]]));
console.log('icons written');
