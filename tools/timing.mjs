// 分步计时：定位生成慢在哪
import fs from "node:fs";
import sharp from "sharp";
import { analyzePalette } from "../src/analyze.mjs";
import { cutout } from "../src/cutout.mjs";
import { segmentText } from "../src/segment.mjs";
import { buildHtml } from "../src/layout.mjs";
import { renderHtml } from "../src/render.mjs";

const img = "assets/sample_botanical.png";
const text = fs.readFileSync("assets/sample_text.txt", "utf8");

const t = (label, fn) => (async () => {
  const s = performance.now();
  const r = await fn();
  console.log(`${label.padEnd(22)} ${Math.round(performance.now() - s)} ms`);
  return r;
})();

const palette = await t("1 调色 analyze", () => analyzePalette(img));
const cut = await t("2 抠图 cutout", () => cutout(img, "out/timing_sticker.png"));
const sections = await t("3 分节 segment", async () => segmentText(text, { sectionSize: 2 }));
const html = await t("4 模板 layout", async () => buildHtml({
  title: "计时", subtitle: "", en: "", sections,
  palette: [palette.accent, palette.palette[1], palette.dominant, palette.palette[3]],
  accent: palette.accent, ink: palette.ink,
  imgSrc: "data:image/png;base64," + fs.readFileSync(img).toString("base64"),
  stickerSrc: "data:image/png;base64," + fs.readFileSync("out/timing_sticker.png").toString("base64"),
  mode: "image",
}));
fs.writeFileSync("out/timing_preview.html", html);
await t("5 渲染 render(1x)", () => renderHtml("out/timing_preview.html", "out/timing_1x.png", { width: 900, scale: 1 }));
await t("5 渲染 render(2x)", () => renderHtml("out/timing_preview.html", "out/timing_2x.png", { width: 900, scale: 2 }));

const meta = await sharp("out/timing_1x.png").metadata();
console.log(`输出 ${meta.width}x${meta.height}`);
