import fs from "node:fs";
import path from "node:path";

const dir = "C:\\Users\\30219\\AppData\\Local\\Temp\\opencode\\extracted_imgs";
const typeCount = {};
const samples = {};
for (const f of fs.readdirSync(dir)) {
  const raw = fs.readFileSync(path.join(dir, f), "utf8");
  let j;
  try { j = JSON.parse(raw); } catch { continue; }
  const content = Array.isArray(j.content) ? j.content : (j.parts ?? []);
  for (const c of content) {
    const key = `${c.type}|${Object.keys(c).join(",")}`;
    typeCount[key] = (typeCount[key] || 0) + 1;
    if (!samples[key]) samples[key] = JSON.stringify(c).slice(0, 300);
  }
  if (!Array.isArray(j.content) && Object.keys(j).length) {
    const topKey = "TOP:" + Object.keys(j).join(",");
    if (!samples[topKey]) samples[topKey] = JSON.stringify(j).slice(0, 300);
  }
}
for (const [k, v] of Object.entries(typeCount)) console.log(v, k, "\n   ", samples[k]);
console.log("\n--- top-level keys ---");
for (const [k, v] of Object.entries(samples)) if (k.startsWith("TOP:")) console.log(k, "\n   ", v);
