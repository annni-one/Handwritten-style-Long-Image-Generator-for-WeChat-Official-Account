import fs from "node:fs";
import path from "node:path";

const dir = "C:\\Users\\30219\\AppData\\Local\\Temp\\opencode\\extracted_imgs";
for (const f of fs.readdirSync(dir)) {
  const raw = fs.readFileSync(path.join(dir, f), "utf8");
  let j;
  try { j = JSON.parse(raw); } catch { continue; }
  const role = j.role ?? j.metadata?.role ?? "?";
  const created = j.time?.created ?? 0;
  const content = Array.isArray(j.content) ? j.content : [];
  const imgs = content.filter((c) => c.type === "file" && c.mime?.startsWith("image/"));
  const texts = content.filter((c) => c.type === "text").map((c) => (c.text || "").slice(0, 60));
  if (imgs.length) {
    console.log(f, "role=", role, "created=", new Date(created).toISOString(), "imgs=", imgs.map((i) => `${i.mime}:${(i.filename || i.url || "").toString().slice(0,50)}`).join("|"), "text=", JSON.stringify(texts));
  }
}
