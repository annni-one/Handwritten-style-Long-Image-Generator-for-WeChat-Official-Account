// 手账风长图 HTML 模板：900px 宽，高度随内容延展
// 输入：{ title, subtitle, sections, palette, imgSrc, stickerSrc, mode }
//   mode = "image"   → 上传图做背景（模糊+提亮+渐变遮罩+纸纹颗粒）
//   mode = "gradient"→ 按主色调生成柔和渐变背景

function esc(s) {
  return String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
}

// 便签纸内的段落
function notePaper(text, rotate) {
  const paras = text.split(/\n+/).filter(Boolean).map((p) => `<p>${esc(p)}</p>`).join("");
  return `<div class="note" style="--rot:${rotate}deg">${paris(paras)}</div>`;
}
const paris = (html) => html;

// 章节块：序号标题 + 便签文字框
function sectionBlock(sec, i, accent) {
  const num = String(i + 1).padStart(2, "0");
  const rot = i % 2 === 0 ? -0.6 : 0.7;
  const tape = i % 2 === 0
    ? `<div class="tape tape-a" style="left:34px;top:-14px;--rot:-6deg"></div>`
    : `<div class="tape tape-b" style="right:40px;top:-12px;--rot:5deg"></div>`;
  return `
  <section class="block">
    <div class="sec-head">
      <span class="sec-num">${num}</span>
      <span class="sec-slash" style="color:${accent}">/</span>
      <span class="sec-title">${esc(sec.title)}</span>
      <span class="spark s1">✦</span>
    </div>
    <div class="note" style="--rot:${rot}deg">
      ${tape}
      ${sec.text.split(/\n+/).filter(Boolean).map((p) => `<p>${esc(p)}</p>`).join("")}
    </div>
  </section>`;
}

export function buildHtml(opts) {
  const { title, subtitle, sections, palette, imgSrc, stickerSrc, mode } = opts;
  const [c1, c2, c3, c4] = palette;
  const accent = opts.accent || c1;

  // —— 背景层 ——
  const bgLayer = mode === "image"
    ? `
    <div class="bg-photo" style="background-image:url('${imgSrc}')"></div>
    <div class="bg-tint" style="background:linear-gradient(180deg,
        ${hexA(c2, 0.72)} 0%, ${hexA(c1, 0.30)} 22%, ${hexA(c1, 0.22)} 55%,
        ${hexA(c3 || c1, 0.34)} 82%, ${hexA(c2, 0.74)} 100%)"></div>`
    : `
    <div class="bg-gradient" style="background:
        linear-gradient(165deg, ${c2} 0%, ${c1} 38%, ${c3 || c1} 68%, ${c4 || c2} 100%)"></div>
    <div class="bg-softlight" style="background:
        radial-gradient(120% 55% at 78% 8%, ${hexA("#ffffff", 0.55)} 0%, rgba(255,255,255,0) 60%),
        radial-gradient(90% 45% at 12% 92%, ${hexA("#ffffff", 0.35)} 0%, rgba(255,255,255,0) 65%)"></div>`;

  const stickerHero = stickerSrc
    ? `<img class="sticker hero-sticker" src="${stickerSrc}" alt="">`
    : `<div class="hero-photo" style="--rot:-2deg">
         <div class="tape tape-a" style="left:24px;top:-15px;--rot:-7deg"></div>
         <div class="tape tape-b" style="right:24px;top:-15px;--rot:6deg"></div>
         <img src="${imgSrc}" alt="">
         <div class="hero-photo-cap">STYLE REFERENCE · 风格参考</div>
       </div>`;

  // 小贴纸点缀（同一主体的局部复用，缩小 + 旋转）
  const accents = stickerSrc ? `
    <img class="sticker corner-a" src="${stickerSrc}" alt="">
    <img class="sticker corner-b" src="${stickerSrc}" alt="">` : "";

  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<style>
  * { margin:0; padding:0; box-sizing:border-box; }
  html,body { width:900px; background:transparent; }
  body {
    font-family: "KaiTi","STKaiti","DFKai-SB","Microsoft YaHei",serif;
    color:${opts.ink || "#4a4136"};
    -webkit-font-smoothing:antialiased;
  }
  .page {
    position:relative; width:900px; overflow:hidden;
    padding-bottom:70px;
  }

  /* ===== 背景 ===== */
  .bg-photo {
    position:absolute; inset:-80px;
    background-size:cover; background-position:center top;
    filter:blur(46px) brightness(1.10) saturate(0.92);
    transform:scale(1.16);
  }
  .bg-tint { position:absolute; inset:0; }
  .bg-gradient { position:absolute; inset:0; }
  .bg-softlight { position:absolute; inset:0; }
  /* 纸纹颗粒 */
  .grain {
    position:absolute; inset:0; pointer-events:none; opacity:.5;
    mix-blend-mode:soft-light;
    background-image:url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='220' height='220'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='3' stitchTiles='stitch'/><feColorMatrix type='saturate' values='0'/></filter><rect width='220' height='220' filter='url(%23n)' opacity='0.55'/></svg>");
  }
  /* 细条纹肌理，呼应参考图 */
  .stripes {
    position:absolute; inset:0; pointer-events:none; opacity:.10;
    background:repeating-linear-gradient(90deg, rgba(255,255,255,.9) 0 14px, rgba(255,255,255,0) 14px 34px);
  }

  .content { position:relative; z-index:3; }

  /* ===== 封面 ===== */
  .hero { padding:64px 60px 34px; text-align:center; }
  .kicker {
    display:inline-block; font-size:14px; letter-spacing:5px; color:#fff;
    background:${hexA(accent, 0.85)}; padding:8px 22px 7px 27px; border-radius:3px;
    font-family:"Microsoft YaHei",sans-serif;
    box-shadow:0 4px 12px rgba(80,80,90,.22);
  }
  .hero h1 {
    margin-top:26px; font-size:74px; line-height:1.18; font-weight:700;
    letter-spacing:12px; color:${opts.ink || "#4a4136"};
    text-shadow:0 2px 0 rgba(255,255,255,.75), 0 6px 22px rgba(255,255,255,.55);
  }
  .hero .en {
    margin-top:14px; font-family:"Segoe Script","Brush Script MT",cursive;
    font-size:26px; color:${hexA(accent, 0.95)}; letter-spacing:2px;
    text-shadow:0 2px 10px rgba(255,255,255,.7);
  }
  .hero-sticker-wrap { margin-top:6px; }
  .sticker { display:block; }
  .hero-sticker {
    width:520px; margin:0 auto;
    filter:drop-shadow(0 14px 26px rgba(70,72,88,.30)) drop-shadow(0 2px 5px rgba(70,72,88,.18));
  }
  /* 快速模式：不抠图 → 参考图做成拍立得相框卡 */
  .hero-photo {
    position:relative; width:430px; margin:28px auto 0; padding:14px 14px 10px;
    background:#fffdf8; border-radius:4px; transform:rotate(var(--rot,-2deg));
    box-shadow:0 14px 30px rgba(70,72,88,.24), 0 3px 8px rgba(70,72,88,.14);
  }
  .hero-photo::after {
    content:""; position:absolute; inset:0; border-radius:4px; pointer-events:none;
    box-shadow:inset 0 0 0 1px rgba(255,255,255,.85);
  }
  .hero-photo img { display:block; width:100%; border-radius:2px; }
  .hero-photo-cap {
    margin-top:9px; text-align:center; font-size:13px; letter-spacing:5px;
    color:rgba(80,74,66,.72); font-family:"Microsoft YaHei",sans-serif;
  }

  /* ===== 章节 ===== */
  .block { padding:34px 60px 6px; }
  .sec-head { display:flex; align-items:flex-end; gap:12px; margin-bottom:18px; position:relative; }
  .sec-num {
    font-family:"Segoe UI",Arial,sans-serif; font-weight:800; font-size:38px;
    color:${opts.ink || "#4a4136"}; line-height:.9;
  }
  .sec-slash {
    font-family:"Segoe UI",Arial,sans-serif; font-weight:800; font-size:38px;
    line-height:.9; transform:skewX(-12deg);
  }
  .sec-title {
    font-size:32px; font-weight:700; letter-spacing:6px; color:${opts.ink || "#4a4136"};
    padding-bottom:2px;
  }
  .spark { color:${hexA(accent, 0.95)}; text-shadow:0 0 10px ${hexA(accent, 0.5)}; }
  .s1 { font-size:20px; margin-left:auto; }

  .note {
    position:relative; background:rgba(253,249,240,.94);
    border-radius:4px; padding:34px 34px 30px;
    transform:rotate(var(--rot,0deg));
    box-shadow:0 10px 24px rgba(70,72,88,.16), 0 2px 5px rgba(70,72,88,.10);
    background-image:repeating-linear-gradient(180deg, rgba(160,150,130,.14) 0 1px, rgba(0,0,0,0) 1px 36px);
    background-position:0 44px;
  }
  .note::after { /* 便签纸内侧微光 */
    content:""; position:absolute; inset:0; border-radius:4px; pointer-events:none;
    box-shadow:inset 0 0 0 1px rgba(255,255,255,.8), inset 0 0 34px rgba(214,200,170,.28);
  }
  .note p {
    font-size:24px; line-height:2.05; letter-spacing:1.6px; color:${opts.ink || "#4a4136"};
    text-align:justify; margin-bottom:6px;
  }
  .note p:last-child { margin-bottom:0; }

  /* ===== 胶带 ===== */
  .tape {
    position:absolute; width:132px; height:34px; transform:rotate(var(--rot,0deg));
    opacity:.82; box-shadow:0 3px 7px rgba(70,72,88,.16);
  }
  .tape-a { background:
    repeating-linear-gradient(45deg, rgba(255,255,255,.65) 0 7px, rgba(255,255,255,.35) 7px 14px),
    ${hexA(accent, 0.55)}; }
  .tape-b { background:
    repeating-linear-gradient(-45deg, rgba(255,255,255,.6) 0 7px, rgba(255,255,255,.3) 7px 14px),
    ${hexA(c4 || accent, 0.5)}; }

  /* ===== 贴纸点缀 ===== */
  .corner-a {
    position:absolute; width:132px; right:-30px; top:1000px; transform:rotate(9deg);
    opacity:.92; z-index:4;
    filter:drop-shadow(0 8px 16px rgba(70,72,88,.26));
  }
  .corner-b {
    position:absolute; width:108px; left:-24px; bottom:120px; transform:rotate(-11deg) scaleX(-1);
    opacity:.88; z-index:2;
    filter:drop-shadow(0 8px 16px rgba(70,72,88,.24));
  }

  /* ===== 星光装饰 ===== */
  .star {
    position:absolute; color:${hexA(accent, 0.8)}; z-index:5; pointer-events:none;
    text-shadow:0 0 10px rgba(255,255,255,.8);
  }
  .flare {
    position:absolute; z-index:5; pointer-events:none;
    width:150px; height:150px;
    background:
      radial-gradient(circle, rgba(255,255,255,.95) 0%, rgba(255,255,255,0) 42%),
      linear-gradient(0deg, rgba(255,255,255,0) 47.5%, rgba(255,255,255,.85) 50%, rgba(255,255,255,0) 52.5%),
      linear-gradient(90deg, rgba(255,255,255,0) 47.5%, rgba(255,255,255,.85) 50%, rgba(255,255,255,0) 52.5%);
    mix-blend-mode:screen;
  }

  /* ===== 尾签 ===== */
  .footer { text-align:center; padding:56px 0 10px; position:relative; }
  .footer .end {
    font-family:"Segoe Script","Brush Script MT",cursive; font-size:66px;
    color:${hexA(accent, 0.95)}; letter-spacing:2px;
    text-shadow:0 2px 0 rgba(255,255,255,.8), 0 6px 20px rgba(255,255,255,.6);
    transform:rotate(-4deg); display:inline-block;
  }
  .footer .sig {
    margin-top:16px; font-size:15px; letter-spacing:6px; color:${hexA(opts.ink || "#4a4136", 0.65)};
    font-family:"Microsoft YaHei",sans-serif;
  }
  /* 预留文案区提示底（浅色纸底） */
  .reserve {
    margin:30px 60px 0; padding:26px 30px; border-radius:4px;
    background:rgba(255,255,255,.55);
    border:2px dashed ${hexA(accent, 0.55)};
    color:${hexA(opts.ink || "#4a4136", 0.75)}; font-size:19px; letter-spacing:3px; text-align:center;
  }
</style>
</head>
<body>
<div class="page">
  ${bgLayer}
  <div class="stripes"></div>
  <div class="grain"></div>

  <div class="content">
    <header class="hero">
      <div class="kicker">${esc(subtitle || "手账 · 长图")}</div>
      <h1>${esc(title)}</h1>
      ${opts.en ? `<div class="en">${esc(opts.en)}</div>` : ""}
      <div class="hero-sticker-wrap">${stickerHero}</div>
    </header>

    ${sections.map((s, i) => sectionBlock(s, i, accent)).join("")}

    <div class="reserve">✦ 预留文字区 · 可继续追加文案 ✦</div>

    <footer class="footer">
      <span class="end">The End.</span>
      <div class="sig">— 手账排版 · 自动出图 —</div>
    </footer>
  </div>

  ${accents}
  <span class="star" style="left:80px;top:210px;font-size:22px">✦</span>
  <span class="star" style="right:96px;top:330px;font-size:16px;opacity:.85">✦</span>
  <span class="star" style="left:120px;top:1010px;font-size:18px;opacity:.9">✦</span>
  <span class="star" style="right:70px;top:1480px;font-size:24px">✦</span>
  <span class="star" style="left:70px;bottom:520px;font-size:16px;opacity:.8">✦</span>
  <span class="star" style="right:130px;bottom:300px;font-size:20px">✦</span>
  <div class="flare" style="right:40px;top:760px"></div>
  <div class="flare" style="left:30px;bottom:640px;width:110px;height:110px"></div>
</div>
</body>
</html>`;
}

function hexA(hex, a) {
  const h = hex.replace("#", "");
  const f = h.length === 3 ? h.split("").map((c) => c + c).join("") : h;
  const r = parseInt(f.slice(0, 2), 16), g = parseInt(f.slice(2, 4), 16), b = parseInt(f.slice(4, 6), 16);
  return `rgba(${r},${g},${b},${a})`;
}
function inkDark(ink) {
  return ink || "#5a5148";
}
