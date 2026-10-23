import fs from "node:fs";
import path from "node:path";

const srcDir = "C:\\Users\\30219\\AppData\\Local\\Temp\\opencode\\extracted_imgs";
const outDir = "C:\\Users\\30219\\AppData\\Local\\Temp\\opencode\\imgs";
fs.mkdirSync(outDir, { recursive: true });

const re = /data:image\/(png|jpe?g|webp);base64,([A-Za-z0-9+/=\s]+)/g;
let count = 0;
for (const f of fs.readdirSync(srcDir)) {
  const text = fs.readFileSync(path.join(srcDir, f), "utf8");
  let m;
  while ((m = re.exec(text))) {
    const b64 = m[2].replace(/\s+/g, "");
    const buf = Buffer.from(b64, "base64");
    if (buf.length < 5000) continue;
    const out = path.join(outDir, `${path.parse(f).name}_${count}.${m[1] === "jpeg" ? "jpg" : m[1]}`);
    fs.writeFileSync(out, buf);
    console.log(out, buf.length);
    count++;
  }
}
console.log("total:", count);
