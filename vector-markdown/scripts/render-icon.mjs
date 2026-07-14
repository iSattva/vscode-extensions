import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import * as chromeLauncher from "chrome-launcher";
import puppeteer from "puppeteer-core";

const projectDir = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const svgPath = path.join(projectDir, "media", "icon-source.svg");
const outPath = path.join(projectDir, "media", "icon.png");

const RENDER_SIZE = 512;

// Re-render at RENDER_SIZE regardless of the source's own width/height
// attributes; the viewBox (the actual coordinate system) is left untouched,
// so this is a lossless upscale, not a resize of the artwork.
const svg = fs
  .readFileSync(svgPath, "utf8")
  .replace(/<svg([^>]*)\swidth="[^"]*"([^>]*)\sheight="[^"]*"/, `<svg$1$2 width="${RENDER_SIZE}" height="${RENDER_SIZE}"`);
const html = `<!doctype html><html><head><style>
  * { margin: 0; padding: 0; }
  html, body { background: transparent; }
</style></head><body>${svg}</body></html>`;

const chrome = await chromeLauncher.launch({
  chromeFlags: ["--headless=new", "--disable-gpu", "--no-sandbox"],
});

try {
  const browser = await puppeteer.connect({ browserURL: `http://localhost:${chrome.port}` });
  const page = await browser.newPage();
  await page.setViewport({ width: RENDER_SIZE, height: RENDER_SIZE, deviceScaleFactor: 1 });
  await page.setContent(html, { waitUntil: "networkidle0" });
  const svgEl = await page.$("svg");
  await svgEl.screenshot({ path: outPath, omitBackground: true });
  await browser.close();
} finally {
  await chrome.kill();
}

console.log("Wrote", outPath);
