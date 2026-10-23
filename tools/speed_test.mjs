// 提速验证：对比 冷启动 / 热缓存 / 快速模式 三种生成耗时
import fs from "node:fs";

const BASE = "http://127.0.0.1:5399";
const imgB64 = fs.readFileSync("assets/sample_botanical.png").toString("base64");
const text = fs.readFileSync("assets/sample_text.txt", "utf8");

const segR = await fetch(BASE + "/api/segment", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ text }),
});
const { sections } = await segR.json();

async function gen(label, body) {
  const t0 = Date.now();
  const r = await fetch(BASE + "/api/generate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ image: imgB64, sections, ...body }),
  });
  const j = await r.json();
  const ms = Date.now() - t0;
  console.log(`${label.padEnd(34)} ${String(ms).padStart(6)} ms  ${r.ok ? `${j.width}x${j.height} · ${j.method}` : "FAIL " + j.error}`);
  return r.ok;
}

const base = { title: "植物手记", subtitle: "JOURNAL", en: "", mode: "image" };

const ok1 = await gen("① 精细抠图 · 冷启动", { ...base, sticker: true, scale: 1 });
const ok2 = await gen("② 精细抠图 · 第二次(热)", { ...base, sticker: true, scale: 1 });
const ok3 = await gen("③ 精细抠图 · 第三次(热)", { ...base, sticker: true, scale: 1 });
const ok4 = await gen("④ 快速模式 · 不抠图", { ...base, sticker: false, scale: 1 });
const ok5 = await gen("⑤ 快速模式 · 再来一次", { ...base, sticker: false, scale: 1 });

if (!(ok1 && ok2 && ok3 && ok4 && ok5)) process.exit(1);
console.log("全部通过");
