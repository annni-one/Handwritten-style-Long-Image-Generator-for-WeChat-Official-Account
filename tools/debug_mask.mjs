// 诊断：检查 ONNX 抠图掩码质量
import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";
import ort from "onnxruntime-node";

const imgPath = path.resolve("assets/sample_botanical.png");
const modelPath = path.resolve("models/isnet-general-use.onnx");
console.log("model size:", fs.statSync(modelPath).size);

const session = await ort.InferenceSession.create(modelPath);
const inputName = session.inputNames[0];
console.log("inputs:", session.inputNames, "outputs:", session.outputNames);
let dims = null;
try { dims = session.inputMetadata?.[inputName]?.dimensions; } catch (e) { console.log("meta err", e.message); }
console.log("input dims metadata:", JSON.stringify(dims));

const H = 1024, W = 1024;
const meta = await sharp(imgPath).metadata();
console.log("image:", meta.width, meta.height, meta.format);

const { data: rgb } = await sharp(imgPath).resize(W, H, { fit: "fill" }).removeAlpha().raw().toBuffer({ resolveWithObject: true });
const MEAN = [0.485, 0.456, 0.406], STD = [0.229, 0.224, 0.225];
const chw = new Float32Array(3 * H * W);
for (let i = 0, p = 0; i < H * W; i++)
  for (let c = 0; c < 3; c++) chw[c * H * W + i] = (rgb[p++] / 255 - MEAN[c]) / STD[c];

const t0 = Date.now();
const results = await session.run({ [inputName]: new ort.Tensor("float32", chw, [1, 3, H, W]) });
console.log("inference ms:", Date.now() - t0);

const out = results[session.outputNames[0]];
console.log("output:", session.outputNames[0], "dims:", JSON.stringify(out.dims), "type:", out.type);
const m = out.data;
let mn = Infinity, mx = -Infinity, sum = 0;
for (let i = 0; i < m.length; i++) { if (m[i] < mn) mn = m[i]; if (m[i] > mx) mx = m[i]; sum += m[i]; }
console.log("mask min/max/mean:", mn.toFixed(5), mx.toFixed(5), (sum / m.length).toFixed(5));

// 保存掩码可视化
const [mh, mw] = out.dims.slice(-2);
const alpha = Buffer.alloc(mh * mw);
const span = mx - mn || 1;
let over = 0;
for (let i = 0; i < m.length; i++) { const v = Math.round(((m[i] - mn) / span) * 255); alpha[i] = v; if (v > 128) over++; }
console.log("fg ratio (>128):", (over / m.length).toFixed(3));
await sharp(alpha, { raw: { width: mw, height: mh, channels: 1 } }).png().toFile("out/debug_mask.png");
console.log("saved out/debug_mask.png");
