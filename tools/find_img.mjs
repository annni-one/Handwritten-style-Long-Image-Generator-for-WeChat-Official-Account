import { DatabaseSync } from "node:sqlite";
import fs from "node:fs";
import path from "node:path";

const db = new DatabaseSync("C:\\Users\\30219\\.local\\share\\opencode\\opencode.db");
const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all();
console.log("tables:", tables.map((t) => t.name).join(", "));

const outDir = "C:\\Users\\30219\\AppData\\Local\\Temp\\opencode\\extracted_imgs";
fs.mkdirSync(outDir, { recursive: true });

for (const t of tables) {
  const name = t.name;
  let cols;
  try {
    cols = db.prepare(`PRAGMA table_info(${name})`).all();
  } catch {
    continue;
  }
  const colNames = cols.map((c) => c.name);
  // look for text columns that could hold JSON parts
  for (const col of colNames) {
    let rows;
    try {
      rows = db.prepare(`SELECT ${col} AS v FROM ${name} WHERE ${col} LIKE '%base64%' OR ${col} LIKE '%image/%'`).all();
    } catch {
      continue;
    }
    if (rows.length) console.log(`${name}.${col}: ${rows.length} rows`);
    rows.forEach((r, i) => {
      if (typeof r.v === "string") {
        const p = path.join(outDir, `${name}_${col}_${i}.txt`);
        fs.writeFileSync(p, r.v);
      }
    });
  }
}
console.log("done");
