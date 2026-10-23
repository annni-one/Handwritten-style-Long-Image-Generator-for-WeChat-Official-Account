// 诊断 keepLargeComponents 为何保留底部残字
import path from "node:path";
import sharp from "sharp";
import fs from "node:fs";

// 直接复用 cutout 的中间产物不可行（不落盘），改为完整复刻 union 后打印连通域信息
// 这里简化：读取最终 sticker 的 alpha，反推残字连通域 vs 主体连通域的 bbox 关系
const st = await sharp("out/sticker.png").ensureAlpha().raw().toBuffer({ resolveWithObject: true });
const w = st.info.width, h = st.info.height;
const binary = Buffer.alloc(w * h);
for (let i = 0; i < w * h; i++) binary[i] = st.data[i * 4 + 3] > 128 ? 255 : 0;

const label = new Int32Array(w * h).fill(-1);
const comps = [];
const stack = [];
for (let s = 0; s < w * h; s++) {
  if (!binary[s] || label[s] !== -1) continue;
  const id = comps.length;
  let size = 0, minX = w, minY = h, maxX = 0, maxY = 0;
  label[s] = id; stack.push(s);
  while (stack.length) {
    const i = stack.pop();
    size++;
    const x = i % w, y = (i / w) | 0;
    if (x < minX) minX = x; if (x > maxX) maxX = x;
    if (y < minY) minY = y; if (y > maxY) maxY = y;
    const nb = [];
    if (x > 0) nb.push(i - 1);
    if (x < w - 1) nb.push(i + 1);
    if (y > 0) nb.push(i - w);
    if (y < h - 1) nb.push(i + w);
    for (const j of nb) if (binary[j] && label[j] === -1) { label[j] = id; stack.push(j); }
  }
  comps.push({ id, size, minX, minY, maxX, maxY });
}
comps.sort((a, b) => b.size - a.size);
console.log("sticker 连通域数:", comps.length);
for (const c of comps.slice(0, 8)) {
  console.log(`  #${c.id} size=${c.size} bbox=(${c.minX},${c.minY})-(${c.maxX},${c.maxY})`);
}
