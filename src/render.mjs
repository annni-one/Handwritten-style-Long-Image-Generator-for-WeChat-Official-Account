// HTML → PNG 渲染：用本机 Edge（Chromium 内核）截图，固定 900px 宽，高度随内容延展
// 性能：浏览器进程常驻复用（避免每次冷启动 ~1s），closeRender() 供 CLI 退出前关闭
import { chromium } from "playwright";
import { pathToFileURL } from "node:url";

let browserP = null;

function getBrowser() {
  if (!browserP) {
    browserP = chromium
      .launch({
        channel: "msedge",
        headless: true,
        args: ["--force-color-profile=srgb", "--disable-lcd-text"],
      })
      .catch((e) => {
        browserP = null;
        throw e;
      });
    browserP.then((b) => b.on("disconnected", () => { browserP = null; }));
  }
  return browserP;
}

export async function renderHtml(htmlPath, outPath, { width = 900, scale = 2 } = {}) {
  const browser = await getBrowser();
  const page = await browser.newPage({
    viewport: { width, height: 1200 },
    deviceScaleFactor: scale,
  });
  try {
    await page.goto(pathToFileURL(htmlPath).href, { waitUntil: "load" });
    await page.waitForTimeout(150); // 等字体/滤镜稳定（系统字体，150ms 足够）
    await page.screenshot({ path: outPath, fullPage: true, omitBackground: true });
    return outPath;
  } finally {
    await page.close().catch(() => {});
  }
}

// 关闭常驻浏览器（CLI 用；服务器进程无需调用）
export async function closeRender() {
  if (!browserP) return;
  const p = browserP;
  browserP = null;
  try { (await p).close(); } catch { /* ignore */ }
}

// 预热：服务启动时提前拉起浏览器，首图免去 ~1s 冷启动
export function warmupRender() {
  return getBrowser();
}
