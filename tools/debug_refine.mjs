// 诊断 refineMask 各步结果
import path from "node:path";
import fs from "node:fs";
import sharp from "sharp";
import ort from "onnxruntime-node";

const imgPath = path.resolve("assets/sample_botanical.png");
const modelPath = path.resolve("models/isnet-general-use.onnx");
const session = await ort.InferenceSession.create(modelPath);
const inputName = session.inputNames[0];
const H = 1024, W = 1024;
const { data: rgb } = await sharp(imgPath).resize(W, H, { fit: "fill" }).removeAlpha().raw().toBuffer({ resolveWithObject: true });
const MEAN = [0.485, 0.456, 0.406], STD = [0.229, 0.224, 0.225];
const chw = new Float32Array(3 * H * W);
for (let i = 0, p = 0; i < H * W; i++)
  for (let c = 0; c < 3; c++) chw[c * H * W + i] = (rgb[p++] / 255 - MEAN[c]) / STD[c];
const results = await session.run({ [inputName]: new ort.Tensor("float32", chw, [1, 3, H, W]) });
const out = results[session.outputNames[0]];
const m = out.data;
let mn = Infinity, mx = -Infinity;
for (let i = 0; i < m.length; i++) { if (m[i] < mn) mn = m[i]; if (m[i] > mx) mx = m[i]; }
const span = mx - mn || 1;
const alpha = Buffer.alloc(m.length);
for (let i = 0; i < m.length; i++) alpha[i] = Math.round(((m[i] - mn) / span) * 255);

// 统计阈值分布
const hist = new Array(10).fill(0);
for (let i = 0; i < alpha.length; i++) hist[Math.min(9, (alpha[i] / 25.6) | 0)]++;
console.log("直方图(0-25,26-51,...):", hist.map((v) => (100 * v / alpha.length).toFixed(1) + "%").join(" "));

// fillHoles
const w = W, h = H, STRONG = 90;
const bg = new Uint8Array(w * h);
const stack = [];
const tryPush = (i) => { if (!bg[i] && alpha[i] < STRONG) { bg[i] = 1; stack.push(i); } };
for (let x = 0; x < w; x++) { tryPush(x); tryPush((h - 1) * w + x); }
for (let y = 0; y < h; y++) { tryPush(y * w); tryPush(y * w + w - 1); }
while (stack.length) {
  const i = stack.pop();
  const x = i % w, y = (i / w) | 0;
  if (x > 0) tryPush(i - 1);
  if (x < w - 1) tryPush(i + 1);
  if (y > 0) tryPush(i - w);
  if (y < h - 1) tryPush(i + w);
}
let bgCount = 0; for (let i = 0; i < w * h; i++) bgCount += bg[i];
console.log("bg 占比:", (100 * bgCount / (w * h)).toFixed(1) + "%");
const solid = Buffer.alloc(w * h);
for (let i = 0; i < w * h; i++) solid[i] = bg[i] ? 0 : 255;
let fgCount = w * h - bgCount;
console.log("fg(solid) 占比:", (100 * fgCount / (w * h)).toFixed(1) + "%");
await sharp(solid, { raw: { width: w, height: h, channels: 1 } }).resize(480, 480).png().toFile("out/dbg_solid.png");

// keepLargeComponents
const label = new Int32Array(w * h).fill(-1);
const sizes = [];
const st2 = [];
for (let s = 0; s < w * h; s++) {
  if (!solid[s] || label[s] !== -1) continue;
  const id = sizes.length; let size = 0; label[s] = id; st2.push(s);
  while (st2.length) {
    const i = st2.pop(); size++;
    const x = i % w, y = (i / w) | 0;
    const nb = [];
    if (x > 0) nb.push(i - 1);
    if (x < w - 1) nb.push(i + 1);
    if (y > 0) nb.push(i - w);
    if (y < h - 1) nb.push(i + w);
    for (const j of nb) if (solid[j] && label[j] === -1) { label[j] = id; st2.push(j); }
  }
  sizes.push(size);
}
sizes.sort((a, b) => b - a);
console.log("连通域数:", sizes.length, "前5大小:", sizes.slice(0, 5).join(","), "最大占比:", (100 * sizes[0] / (w * h)).toFixed(1) + "%");
