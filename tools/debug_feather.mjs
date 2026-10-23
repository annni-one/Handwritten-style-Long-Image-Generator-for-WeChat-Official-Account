// 单测 feather：二值剪影 → blur → 重映射
import path from "node:path";
import sharp from "sharp";

const imgPath = path.resolve("assets/sample_botanical.png");
const { data, info } = await sharp(imgPath).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
const w = info.width, h = info.height, ch = info.channels;
// 泛洪
const tolerance = 42, tol2 = tolerance * tolerance * 3;
const visited = new Uint8Array(w * h), bg = new Uint8Array(w * h);
const stack = [];
const near = (i, j) => {
  const dr = data[i * ch] - data[j * ch], dg = data[i * ch + 1] - data[j * ch + 1], db = data[i * ch + 2] - data[j * ch + 2];
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
const binary = Buffer.alloc(w * h);
for (let i = 0; i < w * h; i++) binary[i] = bg[i] ? 0 : 255;

console.log("binary center(240,300):", binary[300 * w + 240], "fg:", (100 * binary.reduce((s, v) => s + (v > 128 ? 1 : 0), 0) / (w * h)).toFixed(1) + "%");

const blurred = await sharp(binary, { raw: { width: w, height: h, channels: 1 } }).blur(1.1).raw().toBuffer();
console.log("blurred len:", blurred.length, "center:", blurred[300 * w + 240], "corner:", blurred[10 * w + 10]);

const remapped = Buffer.alloc(w * h);
for (let i = 0; i < w * h; i++) {
  const v = blurred[i];
  remapped[i] = v < 70 ? 0 : v > 205 ? 255 : Math.round(((v - 70) / 135) * 255);
}
console.log("remapped center:", remapped[300 * w + 240], "fg:", (100 * remapped.reduce((s, v) => s + (v > 128 ? 1 : 0), 0) / (w * h)).toFixed(1) + "%");
await sharp(remapped, { raw: { width: w, height: h, channels: 1 } }).png().toFile("out/dbg_feather_solo.png");
