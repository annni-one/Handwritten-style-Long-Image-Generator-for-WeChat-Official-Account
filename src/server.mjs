// 本地网页服务：提供前端页面 + 分节/生成两个接口
// 启动: npm run serve  （默认 http://127.0.0.1:5399）
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { run } from "./pipeline.mjs";
import { segmentText } from "./segment.mjs";
import { warmup } from "./cutout.mjs";
import { warmupRender } from "./render.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const PUBLIC = path.join(ROOT, "public");
const OUT = path.join(ROOT, "out");
const PORT = Number(process.env.PORT) || 5399;

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".svg": "image/svg+xml",
};

function send(res, status, body, headers = {}) {
  res.writeHead(status, { "Content-Type": "text/plain; charset=utf-8", ...headers });
  res.end(body);
}

function sendJson(res, status, obj) {
  const body = JSON.stringify(obj);
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  res.end(body);
}

function readBody(req, limit = 40 * 1024 * 1024) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on("data", (c) => {
      size += c.length;
      if (size > limit) {
        reject(new Error("请求体过大（超过 40MB）"));
        req.destroy();
        return;
      }
      chunks.push(c);
    });
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });
}

// 简单串行队列：同一时间只跑一次渲染（Edge 截图 + 模型推理吃资源）
let queue = Promise.resolve();
function enqueue(fn) {
  const next = queue.then(fn, fn);
  queue = next.catch(() => {});
  return next;
}

async function handleSegment(req, res) {
  const body = JSON.parse((await readBody(req)).toString("utf8"));
  const text = String(body.text || "").trim();
  if (!text) return sendJson(res, 400, { error: "文案为空" });
  const sectionSize = Number(body.sectionSize) || 2;
  const sections = segmentText(text, { sectionSize });
  sendJson(res, 200, { sections });
}

async function handleGenerate(req, res) {
  const body = JSON.parse((await readBody(req)).toString("utf8"));
  const imageBuffer = Buffer.from(String(body.image || ""), "base64");
  if (imageBuffer.length < 100) return sendJson(res, 400, { error: "请先上传图片" });
  const sections = Array.isArray(body.sections) ? body.sections : null;
  if (!sections || !sections.length) return sendJson(res, 400, { error: "请先分节并填写内容" });

  const result = await enqueue(() => run({
    imageBuffer,
    sections,
    title: body.title || sections[0]?.title || "手账",
    subtitle: body.subtitle || "",
    en: body.en || "",
    mode: body.mode === "gradient" ? "gradient" : "image",
    sticker: body.sticker !== false,   // false = 快速模式，不抠图
    scale: Number(body.scale) || 1,
    out: path.join(OUT, `long_${Date.now()}.png`),
    workDir: OUT,
  }));

  const sharp = (await import("sharp")).default;
  const meta = await sharp(result.outPath).metadata();
  sendJson(res, 200, {
    url: `/files/${path.basename(result.outPath)}`,
    width: meta.width,
    height: meta.height,
    method: result.method,
    palette: result.palette,
  });
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || "127.0.0.1"}`);
  try {
    if (req.method === "GET" && url.pathname === "/") {
      const html = fs.readFileSync(path.join(PUBLIC, "index.html"));
      return send(res, 200, html, { "Content-Type": MIME[".html"] });
    }
    if (req.method === "POST" && url.pathname === "/api/segment") return await handleSegment(req, res);
    if (req.method === "POST" && url.pathname === "/api/generate") return await handleGenerate(req, res);

    if (req.method === "GET" && url.pathname.startsWith("/files/")) {
      const name = path.basename(url.pathname.slice("/files/".length));
      const fp = path.join(OUT, name);
      if (!fp.startsWith(OUT) || !fs.existsSync(fp)) return send(res, 404, "not found");
      return send(res, 200, fs.readFileSync(fp), { "Content-Type": "image/png" });
    }
    if (req.method === "GET" && url.pathname.startsWith("/public/")) {
      const fp = path.join(PUBLIC, path.normalize(url.pathname.slice("/public/".length)));
      if (!fp.startsWith(PUBLIC) || !fs.existsSync(fp)) return send(res, 404, "not found");
      return send(res, 200, fs.readFileSync(fp), { "Content-Type": MIME[path.extname(fp)] || "application/octet-stream" });
    }
    send(res, 404, "not found");
  } catch (e) {
    console.error("[server]", e);
    sendJson(res, 500, { error: e.message || String(e) });
  }
});

server.listen(PORT, "127.0.0.1", () => {
  console.log(`\n  Annie的公众号长图排版 · 本地工具已启动`);
  console.log(`  打开浏览器访问: http://127.0.0.1:${PORT}\n`);
  // 预热：后台提前加载抠图模型 + 拉起截图浏览器，首图不卡
  warmup().then(
    () => console.log("[warmup] 抠图模型已就绪"),
    (e) => console.log("[warmup] 模型预热失败（不影响快速模式）:", e.message),
  );
  warmupRender().then(
    () => console.log("[warmup] 截图浏览器已就绪"),
    (e) => console.log("[warmup] 浏览器预热失败:", e.message),
  );
});
