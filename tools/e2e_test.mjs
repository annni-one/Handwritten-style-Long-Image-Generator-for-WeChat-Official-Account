// 端到端测试：模拟网页完整流程（分节 → 生成 → 校验 PNG）
import fs from "node:fs";
import path from "node:path";

const BASE = "http://127.0.0.1:5399";

// 1) 首页可访问
const home = await fetch(BASE + "/");
console.log("GET / =>", home.status, (await home.text()).slice(0, 30).replace(/\n/g, " ") + "…");

// 2) 分节
const text = fs.readFileSync("assets/sample_text.txt", "utf8");
const seg = await fetch(BASE + "/api/segment", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ text, sectionSize: 2 }),
});
const segJ = await seg.json();
console.log("POST /api/segment =>", seg.status, "节数:", segJ.sections?.length,
  segJ.sections?.map((s) => s.title).join(" / "));

// 3) 生成（用上传图 + 模拟"网页编辑后的分节"）
const imgB64 = fs.readFileSync("assets/sample_botanical.png").toString("base64");
console.log("生成中（约10~30秒）…");
const gen = await fetch(BASE + "/api/generate", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    image: imgB64,
    sections: segJ.sections,
    title: "植物手记",
    subtitle: "JOURNAL · 手账长图",
    en: "Botanical Journal",
    mode: "image",
    scale: 1,
  }),
});
const genJ = await gen.json();
console.log("POST /api/generate =>", gen.status, JSON.stringify(genJ).slice(0, 300));
if (!gen.ok) process.exit(1);

// 4) 下载校验
const png = await fetch(BASE + genJ.url);
const buf = Buffer.from(await png.arrayBuffer());
const ok = buf[0] === 0x89 && buf[1] === 0x50;
console.log("GET", genJ.url, "=>", png.status, buf.length, "bytes, PNG头:", ok);
if (!ok) process.exit(1);

fs.copyFileSync(path.join("out", path.basename(genJ.url)), "out/e2e_result.png");
console.log("已保存测试结果: out/e2e_result.png");
