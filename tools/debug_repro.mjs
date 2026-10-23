// 复现 cutout 流程，逐步打印统计
import path from "node:path";
import sharp from "sharp";
import { cutout } from "../src/cutout.mjs";

// 直接调用内部逻辑不便，这里改为读取中间产物：重新实现关键步骤统计
const imgPath = path.resolve("assets/sample_botanical.png");
const meta = await sharp(imgPath).metadata();
const ow = meta.width, oh = meta.height;

// 1) flood
const { data, info } = await sharp(imgPath).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
const { width: w, height: h, channels: ch } = info;
const tolerance = 42, tol2 = tolerance * tolerance * 3;
const visited = new Uint8Array(w * h);
const bg = new Uint8Array(w * h);
const stack = [];
const near = (i, j) => {
  const dr = data[i * ch] - data[j * ch];
  const dg = data[i * ch + 1] - data[j * ch + 1];
  const db = data[i * ch + 2] - data[j * ch + 2];
  return dr * dr + dg * dg + db * db <= tol2;
};
const tryPush = (i, ref) => { if (!visited[i] && near(i, ref)) { visited[i] = 1; stack.push([i, ref]); } };
for (let x = 0; x < w; x++) for (const y of [0, h - 1]) { const i = y * w + x; if (!visited[i]) { visited[i] = 1; stack.push([i, i]); } }
for (let y = 0; y < h; y++) for (const x of [0, w - 1]) { const i = y * w + x; if (!visited[i]) { visited[i] = 1; stack.push([i, i]); } }
while (stack.length) {
  const [i, ref] = stack.pop();
  bg[i] = 1;
  const x = i % w, y = (i / w) | 0;
  if (x > 0) tryPush(i - 1, ref);
  if (x < w - 1) tryPush(i + 1, ref);
  if (y > 0) tryPush(i - w, ref);
  if (y < h - 1) tryPush(i + w, ref);
}
const flood = Buffer.alloc(w * h);
let fg = 0;
for (let i = 0; i < w * h; i++) { flood[i] = bg[i] ? 0 : 255; if (bg[i] === 0) fg++; }
console.log("flood fg:", (100 * fg / (w * h)).toFixed(1) + "%", "center:", flood[300 * w + 240]);
