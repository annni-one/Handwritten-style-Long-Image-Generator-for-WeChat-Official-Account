// 主体抠图：优先 ONNX 模型（rembg 系列），无模型时回退到边缘泛洪算法
import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";
import ort from "onnxruntime-node";

const MODELS = {
  isnet: path.resolve("models/isnet-general-use.onnx"),
  u2net: path.resolve("models/u2net.onnx"),
  u2netp: path.resolve("models/u2netp.onnx"),
};

const MEAN = [0.485, 0.456, 0.406];
const STD = [0.229, 0.224, 0.225];

function pickModel() {
  for (const p of Object.values(MODELS)) {
    if (fs.existsSync(p) && fs.statSync(p).size > 1_000_000) return p;
  }
  return null;
}

function fillHoles(alpha, w, h, STRONG = 90) {
  const bg = new Uint8Array(w * h);
  const stack = [];
  const tryPush = (i) => {
    if (!bg[i] && alpha[i] < STRONG) { bg[i] = 1; stack.push(i); }
  };
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
  const out = Buffer.alloc(w * h);
  for (let i = 0; i < w * h; i++) out[i] = bg[i] ? 0 : 255;
  return out;
}

// 调试用：列出连通域（按大小降序，最多 10 个）
function componentReport(binary, w, h) {
  const label = new Int32Array(w * h).fill(-1);
  const comps = [];
  const stack = [];
  for (let s = 0; s < w * h; s++) {
    if (!binary[s] || label[s] !== -1) continue;
    const id = comps.length;
    let size = 0, minY = h, maxY = 0;
    label[s] = id; stack.push(s);
    while (stack.length) {
      const i = stack.pop();
      size++;
      const x = i % w, y = (i / w) | 0;
      if (y < minY) minY = y; if (y > maxY) maxY = y;
      const nb = [];
      if (x > 0) nb.push(i - 1);
      if (x < w - 1) nb.push(i + 1);
      if (y > 0) nb.push(i - w);
      if (y < h - 1) nb.push(i + w);
      for (const j of nb) if (binary[j] && label[j] === -1) { label[j] = id; stack.push(j); }
    }
    comps.push({ id, size, minY, maxY });
  }
  return comps.sort((a, b) => b.size - a.size).slice(0, 10);
}

// 找"主体下缘粘连的游离杂物"并从颈部整行裁掉（典型：底部连着一行小字）
// 策略：逐行统计墨量 → 在主体下半部找墨量谷底（细颈）→ 若颈下区域稀疏且占比小，视为文字类杂物
function splitTrailingJunk(mask, w, h) {
  const counts = new Int32Array(h);
  const ink = new Int32Array(h + 1); // 前缀和，用于快速算"颈下墨量"
  for (let y = 0; y < h; y++) {
    let c = 0;
    const row = y * w;
    for (let x = 0; x < w; x++) if (mask[row + x] > 127) c++;
    counts[y] = c;
    ink[y + 1] = ink[y] + c;
  }
  let top = -1, bottom = -1, maxCount = 0;
  for (let y = 0; y < h; y++) {
    if (counts[y] > 0) { if (top < 0) top = y; bottom = y; }
    if (counts[y] > maxCount) maxCount = counts[y];
  }
  const fail = { mask, cutRow: -1, removedRatio: 0 };
  if (top < 0 || maxCount < 30) return fail; // 空图/极细主体不动

  // 3 行平滑，抗锯齿噪点
  const sm = new Float32Array(h);
  for (let y = 0; y < h; y++) {
    let s = 0, n = 0;
    for (let k = Math.max(0, y - 1); k <= Math.min(h - 1, y + 1); k++) { s += counts[k]; n++; }
    sm[y] = s / n;
  }
  const th = Math.max(10, maxCount * 0.08);

  // 主体底部：从下往上第一个密行
  let mb = -1;
  for (let y = h - 1; y >= top; y--) if (sm[y] >= th) { mb = y; break; }
  if (mb < 0) return fail;

  // 在 [中部, 主体底部] 找谷底（细颈）
  const from = top + Math.floor((mb - top) * 0.45);
  let valley = -1, vmin = Infinity;
  for (let y = from; y < mb; y++) {
    if (sm[y] < vmin) { vmin = sm[y]; valley = y; }
  }
  if (valley < 0) return fail;

  const belowInk = ink[bottom + 1] - ink[valley + 1];
  const totalInk = ink[h];
  const belowArea = w * Math.max(1, bottom - valley);
  // 颈要足够细、下面的东西要足够少且稀疏（文字特征），否则可能是腿/枝干等正常结构，不裁
  const narrowNeck = vmin <= Math.max(8, maxCount * 0.08);
  const smallTail = belowInk / totalInk < 0.12;
  const sparseTail = belowInk / belowArea < 0.25;
  if (!(narrowNeck && smallTail && sparseTail)) return fail;

  const cutRow = Math.min(h - 1, valley + 3);
  const out = Buffer.alloc(w * h);
  const keepUntil = (cutRow + 1) * w;
  out.set(mask.subarray(0, keepUntil));
  return { mask: out, cutRow, removedRatio: belowInk / totalInk };
}

// 只保留与最大连通域贴近的连通块（去掉游离文字/碎渣，保留主体附属元素）
function keepLargeComponents(binary, w, h, keepRatio = 0.2) {
  const label = new Int32Array(w * h).fill(-1);
  const comps = [];
  const stack = [];
  for (let s = 0; s < w * h; s++) {
    if (!binary[s] || label[s] !== -1) continue;
    const id = comps.length;
    let size = 0, minX = w, minY = h, maxX = 0, maxY = 0;
    label[s] = id;
    stack.push(s);
    while (stack.length) {
      const i = stack.pop();
      size++;
      const x = i % w, y = (i / w) | 0;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
      const nb = [];
      if (x > 0) nb.push(i - 1);
      if (x < w - 1) nb.push(i + 1);
      if (y > 0) nb.push(i - w);
      if (y < h - 1) nb.push(i + w);
      for (const j of nb) if (binary[j] && label[j] === -1) { label[j] = id; stack.push(j); }
    }
    comps.push({ size, minX, minY, maxX, maxY });
  }
  if (!comps.length) return binary;
  let best = 0;
  comps.forEach((c, i) => { if (c.size > comps[best].size) best = i; });
  const b = comps[best];
  const MARGIN = 16; // 只保留紧贴主体的连通块（16px 内），远处的游离文字/碎渣丢弃
  const out = Buffer.alloc(w * h);
  for (let i = 0; i < w * h; i++) {
    const c = comps[label[i]];
    if (!binary[i] || !c) continue;
    const near = c.maxX >= b.minX - MARGIN && c.minX <= b.maxX + MARGIN
      && c.maxY >= b.minY - MARGIN && c.minY <= b.maxY + MARGIN;
    if (c.size >= b.size * keepRatio && near) out[i] = 255;
  }
  return out;
}

// 软边缘：二值 → 轻微模糊 → 重映射，得到干净且带羽化的免抠边缘
async function feather(binary, w, h) {
  const blurredRaw = await sharp(binary, { raw: { width: w, height: h, channels: 1 } })
    .blur(1.1)
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  // sharp blur 会把单通道提升为 3 通道，取第 0 通道还原
  const src = blurredRaw.info.channels === 1
    ? blurredRaw.data
    : await sharp(blurredRaw.data, { raw: { width: w, height: h, channels: blurredRaw.info.channels } })
        .extractChannel(0).raw().toBuffer();
  const out = Buffer.alloc(w * h);
  for (let i = 0; i < w * h; i++) {
    const v = src[i];
    out[i] = v < 70 ? 0 : v > 205 ? 255 : Math.round(((v - 70) / 135) * 255);
  }
  return out;
}

async function floodMask(imgPath, tolerance = 42) {
  const { data, info } = await sharp(imgPath).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const { width: w, height: h, channels: ch } = info;
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
  const mask = Buffer.alloc(w * h);
  let fg = 0;
  for (let i = 0; i < w * h; i++) { mask[i] = bg[i] ? 0 : 255; if (!bg[i]) fg++; }
  return { mask, fgRatio: fg / (w * h), width: w, height: h };
}

export async function cutout(imgPath, outPath) {
  const model = pickModel();
  const meta = await sharp(imgPath).metadata();
  const ow = meta.width, oh = meta.height;

  let modelMask = null; // 0-255，与原图同尺寸
  let method = "flood-fill";
  if (model) {
    try {
      modelMask = await onnxMask(imgPath, model, ow, oh);
      method = path.basename(model);
    } catch (e) {
      console.warn("[cutout] ONNX 失败:", e.message);
    }
  }

  const flood = await floodMask(imgPath);
  const floodPlausible = flood.fgRatio > 0.02 && flood.fgRatio < 0.85;

  let final;
  if (modelMask && floodPlausible) {
    // 并集：模型描出的细节 + 泛洪得到的完整剪影
    final = Buffer.alloc(ow * oh);
    for (let i = 0; i < ow * oh; i++) final[i] = Math.max(modelMask[i], flood.mask[i]);
    method += " + flood";
  } else if (modelMask) {
    final = modelMask;
  } else {
    final = flood.mask;
  }

  // 调试：打印 union 掩码连通域（诊断残字粘连）
  if (process.env.DEBUG_CUTOUT) {
    const info = componentReport(final, ow, oh);
    console.log("[dbg] final 连通域:", info.map((c) => `#${c.id}(${c.size},y${c.minY}-${c.maxY})`).join(" "));
  }

  // 清理"主体下缘粘连的游离杂物"（典型：主体底部连着一行小字）
  // 做法：在主体包围盒下半部找"墨量谷底行"（明显细于平均的颈部），
  // 若颈部以下区域稀疏（像文字而非实物），整行以下裁掉——不动其余细线细节
  const split = splitTrailingJunk(final, ow, oh);
  if (split.cutRow >= 0 && process.env.DEBUG_CUTOUT) {
    console.log("[dbg] 裁掉颈部以下杂物, cutRow:", split.cutRow, "占比:", split.removedRatio.toFixed(3));
  }

  const kept = keepLargeComponents(split.mask, ow, oh, 0.25);
  if (process.env.DEBUG_CUTOUT) {
    const stat = (b) => { let s = 0; for (let i = 0; i < b.length; i++) if (b[i] > 128) s++; return (100 * s / b.length).toFixed(1) + "%"; };
    console.log("[dbg] modelMask fg:", modelMask ? stat(modelMask) : "null", "| flood fg:", stat(flood.mask), flood.fgRatio.toFixed(3), "| final fg:", stat(final), "| kept fg:", stat(kept));
  }
  const feathered = await feather(kept, ow, oh);
  if (process.env.DEBUG_CUTOUT) {
    let s = 0; for (let i = 0; i < feathered.length; i++) if (feathered[i] > 128) s++;
    console.log("[dbg] feathered fg:", (100 * s / feathered.length).toFixed(1) + "%", "center:", feathered[300 * ow + Math.floor(ow / 2)], "len:", feathered.length, "expect:", ow * oh, "keptLen:", kept.length);
    await sharp(kept, { raw: { width: ow, height: oh, channels: 1 } }).png().toFile("out/dbg_kept.png");
    await sharp(feathered, { raw: { width: ow, height: oh, channels: 1 } }).png().toFile("out/dbg_feathered.png");
  }

  const { data: rgba } = await sharp(imgPath).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  for (let i = 0; i < ow * oh; i++) rgba[i * 4 + 3] = feathered[i];
  // 裁掉四周透明留白，方便排版定位
  const trimmed = await sharp(rgba, { raw: { width: ow, height: oh, channels: 4 } })
    .trim({ background: { r: 0, g: 0, b: 0, alpha: 0 }, threshold: 8 })
    .png()
    .toBuffer();
  await sharp(trimmed).toFile(outPath);
  return { out: outPath, method };
}

// 模型会话缓存：178MB 模型在进程内只加载一次（首次 ~1s，之后复用）
const sessionCache = new Map();
function getSession(modelPath) {
  if (!sessionCache.has(modelPath)) {
    const p = ort.InferenceSession.create(modelPath);
    sessionCache.set(modelPath, p);
    p.catch(() => sessionCache.delete(modelPath)); // 加载失败则清缓存，下次重试
  }
  return sessionCache.get(modelPath);
}

// 预热：服务启动时提前加载模型，用户第一次点生成就不必等模型
export function warmup() {
  const p = pickModel();
  return p ? getSession(p) : Promise.resolve(null);
}

// ONNX 掩码：模型输出 → min-max 归一化 → 补洞 → 缩放回原尺寸
async function onnxMask(imgPath, modelPath, ow, oh) {
  const session = await getSession(modelPath);
  const inputName = session.inputNames[0];

  let H = 320, W = 320;
  if (modelPath.includes("isnet")) { H = 1024; W = 1024; }
  if (modelPath.includes("u2netp") || modelPath.includes("u2net.")) { H = 320; W = 320; }

  const { data: rgb } = await sharp(imgPath)
    .resize(W, H, { fit: "fill" })
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const chw = new Float32Array(3 * H * W);
  for (let i = 0, p = 0; i < H * W; i++) {
    for (let c = 0; c < 3; c++) {
      chw[c * H * W + i] = (rgb[p++] / 255 - MEAN[c]) / STD[c];
    }
  }

  const results = await session.run({ [inputName]: new ort.Tensor("float32", chw, [1, 3, H, W]) });
  const out = results[session.outputNames[0]];
  const m = out.data;
  const [mh, mw] = out.dims.slice(-2);

  let mn = Infinity, mx = -Infinity;
  for (let i = 0; i < m.length; i++) { if (m[i] < mn) mn = m[i]; if (m[i] > mx) mx = m[i]; }
  const span = mx - mn || 1;
  const alpha = Buffer.alloc(mh * mw);
  for (let i = 0; i < m.length; i++) alpha[i] = Math.round(((m[i] - mn) / span) * 255);

  const solid = fillHoles(alpha, mw, mh);
  const resized = await sharp(solid, { raw: { width: mw, height: mh, channels: 1 } })
    .resize(ow, oh, { fit: "fill", kernel: "lanczos3" })
    .raw()
    .toBuffer();
  return resized;
}
