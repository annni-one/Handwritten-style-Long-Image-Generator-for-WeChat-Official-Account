// 精确复现 cutout() 内部逐步统计
import path from "node:path";
import sharp from "sharp";

const imgPath = path.resolve("assets/sample_botanical.png");
const mod = await import("../src/cutout.mjs");

// cutout 不暴露中间量，这里复制其逻辑并逐打印
const { default: _ } = { };
const meta = await sharp(imgPath).metadata();
const ow = meta.width, oh = meta.height;

// 读取已生成的 sticker，检查 keepLargeComponents/feather 的输入输出
// 直接重算 final = max(model, flood)
const fs = await import("node:fs");
const sticker = await sharp("out/sticker.png").ensureAlpha().raw().toBuffer({ resolveWithObject: true });
const { data: sa } = sticker.data ? sticker : sticker;
let nonZero = 0;
for (let i = 3; i < sticker.data.length; i += 4) if (sticker.data[i] > 0) nonZero++;
console.log("sticker 非零 alpha:", (100 * nonZero / (ow * oh)).toFixed(1) + "%");

// 检查 flood mask 与 sticker 的对应关系
const { data, info } = await sharp(imgPath).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
const w = info.width, h = info.height, ch = info.channels;
const tolerance = 42, tol2 = tolerance * tolerance * 3;
const visited = new Uint8Array(w * h), bg = new Uint8Array(w * h);
const stack = [];
const near = (i, j) => {
  const dr = data[i * ch] - data[j * ch], dg = data[i * ch + 1] - data[j * ch + 1], db = data[i * ch + 2] - data[j * ch + 2];
  return dr * dr + dg * dg + db * db <= tol2;
};
const tryPush = (i, ref) => { if (!visited[i] && near(i, ref)) { visited[i] = 1; stack.push([i, ref]); } };
for (let x = 0; x < w; x++) for (const y of [0, h - 1]) { const i = y * w + x; if (!visited[i]) { visited[i] = 1; stack.push([i, i]); } }
for (let y = 0; y < h; y++) for (let x = 0; x < 1; x++) { const i = y * w + x; if (!visited[i]) { visited[i] = 1; stack.push([i, i]); } }
while (stack.length) {
  const [i, ref] = stack.pop();
  bg[i] = 1;
  const x = i % w, y = (i / w) | 0;
  if (x > 0) tryPush(i - 1, ref);
  if (x < w - 1) tryPush(i + 1, ref);
  if (y > 0) tryPush(i - w, ref);
  if (y < h - 1) tryPush(i + w, ref);
}
let agree = 0, floodOnly = 0, stickerOnly = 0, bothZero = 0;
for (let i = 0; i < w * h; i++) {
  const f = !bg[i], s = sticker.data[i * 4 + 3] > 128;
  if (f && s) agree++;
  else if (f && !s) floodOnly++;
  else if (!f && s) stickerOnly++;
  else bothZero++;
}
const n = w * h;
console.log(`flood有sticker无: ${(100 * floodOnly / n).toFixed(1)}%  sticker有flood无: ${(100 * stickerOnly / n).toFixed(1)}%  都有: ${(100 * agree / n).toFixed(1)}%`);
