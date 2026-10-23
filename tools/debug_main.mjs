// 查看主体连通域 #1 在底部区域的分布，定位残字连接原因
import sharp from "sharp";

const st = await sharp("out/sticker.png").ensureAlpha().raw().toBuffer({ resolveWithObject: true });
const w = st.info.width, h = st.info.height;
const bin = (i) => st.data[i * 4 + 3] > 128;

const label = new Int32Array(w * h).fill(-1);
const stack = [];
label[0] = -2; // placeholder
// 找 size 最大连通域（复刻）
let bestId = -1, bestSize = 0;
const sizes = [];
for (let s = 0; s < w * h; s++) {
  if (!bin(s) || label[s] !== -1) continue;
  const id = sizes.length;
  let size = 0;
  label[s] = id; stack.push(s);
  while (stack.length) {
    const i = stack.pop();
    size++;
    const x = i % w, y = (i / w) | 0;
    const nb = [];
    if (x > 0) nb.push(i - 1);
    if (x < w - 1) nb.push(i + 1);
    if (y > 0) nb.push(i - w);
    if (y < h - 1) nb.push(i + w);
    for (const j of nb) if (bin(j) && label[j] === -1) { label[j] = id; stack.push(j); }
  }
  sizes.push(id === 0 || size > bestSize ? id : -1);
  if (size > bestSize) { bestSize = size; bestId = id; }
}
console.log("main id:", bestId, "size:", bestSize);

// 打印主体在 y=560..649 的每行 x 分布
for (let y = 560; y < h; y += 6) {
  let minX = -1, maxX = -1, count = 0;
  for (let x = 0; x < w; x++) {
    if (label[y * w + x] === bestId) {
      if (minX < 0) minX = x;
      maxX = x;
      count++;
    }
  }
  console.log(`y=${y} count=${count} x=[${minX}..${maxX}]`);
}
