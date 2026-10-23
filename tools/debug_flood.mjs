// 泛洪抠图在此图上的效果验证（背景为均匀条纹）
import path from "node:path";
import sharp from "sharp";

const imgPath = path.resolve("assets/sample_botanical.png");
const img = sharp(imgPath).ensureAlpha();
const { data, info } = await img.raw().toBuffer({ resolveWithObject: true });
const { width: w, height: h, channels: ch } = info;
console.log("size", w, h, "ch", ch);

for (const tolerance of [30, 42, 60]) {
  const tol2 = tolerance * tolerance * 3;
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
  // 种子：边界像素各自为参考色
  for (let x = 0; x < w; x++) { for (const y of [0, h - 1]) { const i = y * w + x; if (!visited[i]) { visited[i] = 1; stack.push([i, i]); } } }
  for (let y = 0; y < h; y++) { for (const x of [0, w - 1]) { const i = y * w + x; if (!visited[i]) { visited[i] = 1; stack.push([i, i]); } } }
  while (stack.length) {
    const [i, ref] = stack.pop();
    bg[i] = 1;
    const x = i % w, y = (i / w) | 0;
    if (x > 0) tryPush(i - 1, ref);
    if (x < w - 1) tryPush(i + 1, ref);
    if (y > 0) tryPush(i - w, ref);
    if (y < h - 1) tryPush(i + w, ref);
  }
  let fg = 0;
  const mask = Buffer.alloc(w * h);
  for (let i = 0; i < w * h; i++) { mask[i] = bg[i] ? 0 : 255; if (!bg[i]) fg++; }
  console.log(`tolerance=${tolerance} fg=${(100 * fg / (w * h)).toFixed(1)}%`);
  await sharp(mask, { raw: { width: w, height: h, channels: 1 } }).png().toFile(`out/dbg_flood_${tolerance}.png`);
}
