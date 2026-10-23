import fs from "node:fs";
import path from "node:path";

const dir = "C:\\Users\\30219\\AppData\\Local\\Temp\\opencode\\extracted_imgs";
const outDir = "C:\\Users\\30219\\AppData\\Local\\Temp\\opencode\\user_imgs";
fs.mkdirSync(outDir, { recursive: true });

const rows = [];
for (const f of fs.readdirSync(dir)) {
  const raw = fs.readFileSync(path.join(dir, f), "utf8");
  let j;
  try { j = JSON.parse(raw); } catch { continue; }
  if (!Array.isArray(j.files) || !j.files.length) continue;
  rows.push({ f, created: j.time?.created ?? 0, text: (j.text || "").slice(0, 50), files: j.files });
}
rows.sort((a, b) => a.created - b.created);
for (const r of rows) {
  console.log(r.f, new Date(r.created).toISOString(), "files:", r.files.length, "text:", JSON.stringify(r.text));
  r.files.forEach((file, i) => {
    const mime = file.mime || file.type || "image/png";
    const ext = mime.includes("jpeg") ? "jpg" : mime.includes("webp") ? "webp" : mime.includes("png") ? "png" : "bin";
    const buf = Buffer.from(file.data, "base64");
    const out = path.join(outDir, `${path.parse(r.f).name}_${i}.${ext}`);
    fs.writeFileSync(out, buf);
    let dim = "";
    if (ext === "png") dim = `${buf.readUInt32BE(16)}x${buf.readUInt32BE(20)}`;
    console.log("   ->", out, buf.length, dim, mime);
  });
}
