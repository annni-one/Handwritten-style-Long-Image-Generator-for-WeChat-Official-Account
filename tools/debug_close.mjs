// 验证：闭运算(膨胀→补洞→收缩) 对线稿类图的效果
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

async function blurBuf(buf, r) {
  return sharp(buf, { raw: { width: W, height: H, channels: 1 } }).blur(r).raw().toBuffer();
}

function floodBg(binary, W2, H2, isWeak) {
  const bg = new Uint8Array(W2 * H2);
  const stack = [];
  const tryPush = (i) => { if (!bg[i] && isWeak(i)) { bg[i] = 1; stack.push(i); } };
  for (let x = 0; x < W2; x++) { tryPush(x); tryPush((H2 - 1) * W2 + x); }
  for (let y = 0; y < H2; y++) { tryPush(y * W2); tryPush(y * W2 + W2 - 1); }
  while (stack.length) {
    const i = stack.pop();
    const x = i % W2, y = (i / W2) | 0;
    if (x > 0) tryPush(i - 1);
    if (x < W2 - 1) tryPush(i + 1);
    if (y > 0) tryPush(i - W2);
    if (y < H2 - 1) tryPush(i + W2);
  }
  return bg;
}

for (const R of [8, 12, 18]) {
  const DILATE_TH = 40;
  const blurred = await blurBuf(alpha, R);
  const dilated = Buffer.alloc(W * H);
  for (let i = 0; i < W * H; i++) dilated[i] = blurred[i] > DILATE_TH ? 255 : 0;

  // 补洞：从边界泛洪弱区(==0)
  const bg = floodBg(dilated, W, H, (i) => dilated[i] === 0);
  const solid = Buffer.alloc(W * H);
  let fg = 0;
  for (let i = 0; i < W * H; i++) { solid[i] = bg[i] ? 0 : 255; if (!bg[i]) fg++; }

  // 收缩回来：对 solid 模糊后取中阈值
  const blurred2 = await blurBuf(solid, R);
  const eroded = Buffer.alloc(W * H);
  for (let i = 0; i < W * H; i++) eroded[i] = blurred2[i] > 120 ? 255 : 0;

  const at = (buf, x, y) => buf[y * W + x];
  console.log(`R=${R} solid_fg=${(100 * fg / (W * H)).toFixed(1)}%  oval=${at(solid, 512, 456)} petal=${at(solid, 512, 130)} ribbon=${at(solid, 512, 830)} bg=${at(solid, 40, 40)} | eroded_oval=${at(eroded, 512, 456)} eroded_bg=${at(eroded, 40, 40)}`);
  await sharp(eroded, { raw: { width: W, height: H, channels: 1 } }).png().toFile(`out/dbg_closed_${R}.png`);
}
