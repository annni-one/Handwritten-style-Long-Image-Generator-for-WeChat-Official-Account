// 主色调分析：从上传图提取调色板，供背景/装饰配色使用
import sharp from "sharp";

function toHex(r, g, b) {
  return "#" + [r, g, b].map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, "0")).join("");
}

export function darken(hex, amount) {
  const h = hex.replace("#", "");
  const f = h.length === 3 ? h.split("").map((c) => c + c).join("") : h;
  const r = parseInt(f.slice(0, 2), 16), g = parseInt(f.slice(2, 4), 16), b = parseInt(f.slice(4, 6), 16);
  return toHex(r * (1 - amount), g * (1 - amount), b * (1 - amount));
}

function hslSat(r, g, b) {
  const rn = r / 255, gn = g / 255, bn = b / 255;
  const max = Math.max(rn, gn, bn), min = Math.min(rn, gn, bn);
  if (max === 0) return 0;
  const l = (max + min) / 2;
  const d = max - min;
  if (d === 0) return 0;
  return l > 0.5 ? d / (2 - max - min) : d / (max + min);
}

function rgbHue(c) {
  const r = c.r / 255, g = c.g / 255, b = c.b / 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min;
  if (d === 0) return 0;
  let h;
  if (max === r) h = ((g - b) / d) % 6;
  else if (max === g) h = (b - r) / d + 2;
  else h = (r - g) / d + 4;
  h *= 60;
  return h < 0 ? h + 360 : h;
}

export async function analyzePalette(imgPath) {
  const { data } = await sharp(imgPath)
    .resize(160, 160, { fit: "fill" })
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const buckets = new Map();
  for (let i = 0; i < data.length; i += 3) {
    const r = data[i], g = data[i + 1], b = data[i + 2];
    const key = ((r >> 3) << 10) | ((g >> 3) << 5) | (b >> 3); // 5bit/通道
    let e = buckets.get(key);
    if (!e) buckets.set(key, (e = { r: 0, g: 0, b: 0, n: 0 }));
    e.r += r; e.g += g; e.b += b; e.n++;
  }

  const colors = [...buckets.values()]
    .map((e) => ({ r: e.r / e.n, g: e.g / e.n, b: e.b / e.n, n: e.n }))
    .sort((a, b) => b.n - a.n);

  const total = colors.reduce((s, c) => s + c.n, 0);
  const palette = colors.slice(0, 24).map((c) => ({
    hex: toHex(c.r, c.g, c.b),
    r: c.r, g: c.g, b: c.b,
    ratio: c.n / total,
    sat: hslSat(c.r, c.g, c.b),
    light: (Math.max(c.r, c.g, c.b) + Math.min(c.r, c.g, c.b)) / 2 / 255,
  }));

  // 主色：占比最高且不过分接近纯白/纯黑
  const dominant = palette.find((c) => c.light > 0.12 && c.light < 0.94) || palette[0];
  // 点缀色：在"有一定存在感"里选 与主色色相差异大、饱和度高 的颜色
  // （低饱和复古图也能选出金棕/花蓝这类协调的点缀色，而不是灰）
  const domHue = rgbHue(dominant);
  const active = palette.filter((c) => c.ratio > 0.003 && c.light > 0.2 && c.light < 0.85 && c.sat > 0.05);
  const score = (c) => {
    let dh = Math.abs(rgbHue(c) - domHue) % 360;
    if (dh > 180) dh = 360 - dh;
    return (dh / 180) * c.sat * Math.log(1 + c.ratio * 300);
  };
  const picked = (active.length ? active : [dominant])
    .sort((a, b) => score(b) - score(a))[0];
  const accent = darken(picked.hex, 0.25);
  // 文字色：偏深的中性色
  const ink = [...palette].filter((c) => c.light < 0.55).sort((a, b) => a.light - b.light)[0]
    || { hex: "#3a3a3a" };

  return {
    dominant: dominant.hex,
    accent, // 已加深的点缀色
    ink: ink.hex,
    palette: palette.map((c) => c.hex),
  };
}
