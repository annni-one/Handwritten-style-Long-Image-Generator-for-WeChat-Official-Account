// 对比不同 STRONG 阈值的 fillHoles 结果
import path from "node:path";
import sharp from "sharp";
import ort from "onnxruntime-node";

const imgPath = path.resolve("assets/sample_botanical.png");
const modelPath = path.resolve("models/isnet-general-use.onnx");
const session = await ort.InferenceSession.create(modelPath);
const inputName = session.inputNames[0];
const W = 1024, H = 1024;
const { data: rgb } = await sharp(imgPath).resize(W, H, { fit: "fill" }).removeAlpha().raw().toBuffer({ resolveWithObject: true });
const MEAN = [0.485, 0.456, 0.406], STD = [0.229, 0.224, 0.225];
const chw = new Float32Array(3 * W * H);
for (let i = 0, p = 0; i < W * H; i++)
  for (let c = 0; c < 3; c++) chw[c * W * H + i] = (rgb[p++] / 255 - MEAN[c]) / STD[c];
const results = await session.run({ [inputName]: new ort.Tensor("float32", chw, [1, 3, W, H]) });
const out = results[session.outputNames[0]];
const m = out.data;
let mn = Infinity, mx = -Infinity;
for (let i = 0; i < m.length; i++) { if (m[i] < mn) mn = m[i]; if (m[i] > mx) mx = m[i]; }
const span = mx - mn || 1;
const alpha = Buffer.alloc(m.length);
for (let i = 0; i < m.length; i++) alpha[i] = Math.round(((m[i] - mn) / span) * 255);

function fillHoles(STRONG) {
  const w = W, h = H;
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
  const solid = Buffer.alloc(w * h);
  let fg = 0;
  for (let i = 0; i < w * h; i++) { solid[i] = bg[i] ? 0 : 255; if (!bg[i]) fg++; }
  return { solid, fgRatio: fg / (w * h) };
}

// 关键采样点：椭圆内部、花瓣、缎带、背景条纹
const pts = { ovalInterior: [512, 456], petal: [512, 130], ribbon: [512, 830], bgStripe: [40, 40] };
for (const STRONG of [20, 30, 40, 60, 90]) {
  const { solid, fgRatio } = fillHoles(STRONG);
  const at = (x, y) => solid[y * W + x];
  console.log(`STRONG=${STRONG} fg=${(100 * fgRatio).toFixed(1)}%  oval=${at(512, 456)} petal=${at(512, 130)} ribbon=${at(512, 830)} bg=${at(40, 40)}`);
  await sharp(solid, { raw: { width: W, height: H, channels: 1 } }).png().toFile(`out/dbg_solid_${STRONG}.png`);
}
