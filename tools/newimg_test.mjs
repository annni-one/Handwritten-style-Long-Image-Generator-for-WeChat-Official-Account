// 新图片测试：造一张没抠过的变体图，测真实首次抠图耗时
import fs from "node:fs";
import sharp from "sharp";

const BASE = "http://127.0.0.1:5399";

// 造变体：裁掉一角 + 旋转，哈希必变
const variant = "out/variant_test.png";
await sharp("assets/sample_botanical.png")
  .rotate(7)
  .extract({ left: 20, top: 30, width: 430, height: 780 })
  .png()
  .toFile(variant);

const text = fs.readFileSync("assets/sample_text.txt", "utf8");
const { sections } = await (await fetch(BASE + "/api/segment", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ text }),
})).json();

async function gen(label, body) {
  const t0 = Date.now();
  const r = await fetch(BASE + "/api/generate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ image: fs.readFileSync(variant).toString("base64"), sections, ...body }),
  });
  const j = await r.json();
  console.log(`${label.padEnd(30)} ${String(Date.now() - t0).padStart(6)} ms  ${r.ok ? j.method : j.error}`);
}

await gen("新图A · 首次抠图", { title: "变体", mode: "image", sticker: true, scale: 1 });
await gen("新图A · 同图第二次", { title: "变体", mode: "image", sticker: true, scale: 1 });
await gen("新图A · 快速模式", { title: "变体", mode: "image", sticker: false, scale: 1 });

// 第二张新图：验证进程内第二次真实推理是否更快（排除首推理图优化开销）
await sharp("assets/sample_botanical.png")
  .flip()
  .extract({ left: 10, top: 50, width: 450, height: 760 })
  .png()
  .toFile("out/variant_test2.png");
async function gen2(label, body) {
  const t0 = Date.now();
  const r = await fetch(BASE + "/api/generate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ image: fs.readFileSync("out/variant_test2.png").toString("base64"), sections, ...body }),
  });
  const j = await r.json();
  console.log(`${label.padEnd(30)} ${String(Date.now() - t0).padStart(6)} ms  ${r.ok ? j.method : j.error}`);
}
await gen2("新图B · 首次抠图", { title: "变体2", mode: "image", sticker: true, scale: 1 });
