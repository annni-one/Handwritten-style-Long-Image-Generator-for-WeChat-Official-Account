// 对比：泛洪掩码 vs 最终 sticker alpha
import path from "node:path";
import sharp from "sharp";

const imgPath = path.resolve("assets/sample_botanical.png");
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

const st = await sharp("out/sticker.png").ensureAlpha().raw().toBuffer({ resolveWithObject: true });
const map = (fn) => {
  const rows = [];
  for (let y = 0; y < h; y += 42) {
    let line = "";
    for (let x = 0; x < w; x += 12) line += fn(y * w + x) ? "#" : ".";
    rows.push(line);
  }
  return rows.join("\n");
};
console.log("== 泛洪掩码 (fg=非bg) ==\n" + map((i) => !bg[i]));
console.log("\n== sticker alpha>128 ==\n" + map((i) => st.data[i * 4 + 3] > 128));
