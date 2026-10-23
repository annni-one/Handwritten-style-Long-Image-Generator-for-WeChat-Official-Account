// 管线入口：图片 + 文案 → 手账风长图 PNG
// CLI: node src/pipeline.mjs --img <图片> --text <文案> [--mode image|gradient] [--title 标题] [--out out/long.png]
// 程序: run({ imageBuffer | img, sections | text, ... }) 供 server.mjs 调用
// 选项: sticker:false → 快速模式不抠图（用相框卡装饰替代）；stickerPath 按图片哈希落盘缓存
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import sharp from "sharp";
import { pathToFileURL } from "node:url";
import { analyzePalette } from "./analyze.mjs";
import { cutout } from "./cutout.mjs";
import { segmentText } from "./segment.mjs";
import { buildHtml } from "./layout.mjs";
import { renderHtml, closeRender } from "./render.mjs";

function parseArgs(argv) {
  const args = {};
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith("--")) {
      const key = a.slice(2);
      const next = argv[i + 1];
      if (next && !next.startsWith("--")) { args[key] = next; i++; }
      else args[key] = true;
    }
  }
  return args;
}

async function toDataUri(p, { maxWidth = 1400, jpeg = true } = {}) {
  let img = sharp(p);
  const meta = await img.metadata();
  if (meta.width > maxWidth) img = img.resize({ width: maxWidth });
  const buf = jpeg && meta.format !== "png"
    ? await img.jpeg({ quality: 82 }).toBuffer()
    : await img.toBuffer();
  const mime = buf[0] === 0x89 ? "image/png" : "image/jpeg";
  return `data:${mime};base64,${buf.toString("base64")}`;
}

// 抠图：先查磁盘缓存（同一张图不重复抠），未命中才跑模型
async function cutoutCached(imgPath, workDir) {
  const stickerPath = path.join(workDir, "sticker.png");
  const cacheDir = path.join(workDir, ".cache");
  const hash = crypto.createHash("sha1")
    .update(fs.readFileSync(imgPath))
    .update("cutout-v1")
    .digest("hex").slice(0, 16);
  const cacheFile = path.join(cacheDir, `${hash}.png`);

  if (fs.existsSync(cacheFile)) {
    fs.copyFileSync(cacheFile, stickerPath);
    return { stickerPath, method: "缓存命中" };
  }
  const t0 = Date.now();
  const r = await cutout(imgPath, stickerPath);
  fs.mkdirSync(cacheDir, { recursive: true });
  fs.copyFileSync(stickerPath, cacheFile);
  return { stickerPath, method: `${r.method} · ${Date.now() - t0}ms` };
}

/**
 * @param {object} opts
 *   imageBuffer?: Buffer   原始图片字节（与 img 二选一）
 *   img?: string           图片文件路径
 *   text?: string          文案文件路径（CLI 用）
 *   textString?: string    文案原文
 *   sections?: Array<{title,text}>  已分节（网页编辑后传入，优先于自动分节）
 *   title/subtitle/en      封面文案
 *   mode: "image" | "gradient"
 *   sticker?: boolean      false = 快速模式，不抠图（默认 true）
 *   out?: string           输出 PNG 路径
 *   workDir?: string       中间产物目录（不传则用 out/）
 *   scale?: number         截图倍率（1=900px 宽, 2=1800px 宽）
 *   sectionSize?: number   自动分节粒度
 */
export async function run(opts) {
  const tAll = Date.now();
  const step = (t) => `${Date.now() - t}ms`;

  // —— 输入图片 ——
  let imgPath = opts.img ? path.resolve(opts.img) : null;
  const workDir = path.resolve(opts.workDir || "out");
  fs.mkdirSync(workDir, { recursive: true });
  if (!imgPath && opts.imageBuffer) {
    imgPath = path.join(workDir, `source_${crypto.randomUUID().slice(0, 8)}.png`);
    await sharp(opts.imageBuffer).png().toFile(imgPath);
  }
  if (!imgPath || !fs.existsSync(imgPath)) throw new Error("缺少图片");

  // —— 文案 / 分节 ——
  let sections = Array.isArray(opts.sections) && opts.sections.length
    ? opts.sections.map((s) => ({ title: String(s.title || "手记"), text: String(s.text || "") }))
    : null;
  if (!sections) {
    const text = opts.text ? fs.readFileSync(path.resolve(opts.text), "utf8") : opts.textString;
    if (!text) throw new Error("缺少文案");
    sections = segmentText(text, { sectionSize: Number(opts.sectionSize) || 2 });
  }

  const mode = opts.mode === "gradient" ? "gradient" : "image";
  const useSticker = opts.sticker !== false;
  const outPath = path.resolve(opts.out || path.join(workDir, "long.png"));
  fs.mkdirSync(path.dirname(outPath), { recursive: true });

  let t = Date.now();
  console.log("[1/5] 提取主色调…");
  const palette = await analyzePalette(imgPath);
  console.log(`      主色 ${palette.dominant} 点缀 ${palette.accent} 文字 ${palette.ink} · ${step(t)}`);

  t = Date.now();
  console.log(`[2/5] 主体抠图${useSticker ? "" : "（快速模式已跳过）"}…`);
  let stickerPath = null, cut = { method: "未抠图（快速模式）" };
  if (useSticker) {
    const r = await cutoutCached(imgPath, workDir);
    stickerPath = r.stickerPath;
    cut = { method: r.method };
    console.log(`      方法: ${r.method} · ${step(t)}`);
  }

  t = Date.now();
  console.log("[3/5] 文案分节…");
  sections.forEach((s, i) => console.log(`      ${String(i + 1).padStart(2, "0")} / ${s.title}（${s.text.length}字）`));
  console.log(`      ${step(t)}`);

  t = Date.now();
  console.log(`[4/5] 生成手账模板（背景模式: ${mode}）…`);
  const html = buildHtml({
    title: opts.title || sections[0]?.title || "手账",
    subtitle: opts.subtitle || "JOURNAL · 手账长图",
    en: opts.en || "",
    sections,
    palette: [palette.accent, palette.palette[1] || palette.dominant, palette.dominant, palette.palette[3] || palette.dominant],
    accent: palette.accent,
    ink: palette.ink,
    imgSrc: await toDataUri(imgPath, { maxWidth: 1200, jpeg: true }),
    stickerSrc: stickerPath ? await toDataUri(stickerPath, { jpeg: false }) : "",
    mode,
  });
  const htmlPath = path.join(workDir, "preview.html");
  fs.writeFileSync(htmlPath, html, "utf8");
  console.log(`      ${step(t)}`);

  t = Date.now();
  console.log(`[5/5] 渲染长图（宽 900 × ${opts.scale || 1}x）…`);
  await renderHtml(htmlPath, outPath, {
    width: 900,
    scale: Number(opts.scale) || 1,
  });
  const meta = await sharp(outPath).metadata();
  console.log(`      截图 ${step(t)} · 合计 ${step(tAll)}`);
  console.log(`完成: ${outPath}  ${meta.width}x${meta.height}`);
  return { outPath, htmlPath, stickerPath, sections, palette, method: cut.method, ms: Date.now() - tAll };
}

const invokedDirectly = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (invokedDirectly) {
  run(parseArgs(process.argv))
    .catch((e) => {
      console.error("失败:", e);
      process.exitCode = 1;
    })
    .finally(() => closeRender()); // 关掉常驻浏览器，让 CLI 正常退出
}
