import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import * as chromeLauncher from "chrome-launcher";
import puppeteer from "puppeteer-core";

const projectDir = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const svgPath = path.join(projectDir, "media", "splash.svg");
const outPath = path.join(projectDir, "media", "splash.png");

// 2x the SVG's own 1280x640 viewBox, matching the original splash.png's
// retina resolution (2560x1280) - a lossless upscale since the source is vector.
const WIDTH = 2560;
const HEIGHT = 1280;

const svg = fs
  .readFileSync(svgPath, "utf8")
  .replace(/<svg([^>]*)\swidth="[^"]*"([^>]*)\sheight="[^"]*"/, `<svg$1$2 width="${WIDTH}" height="${HEIGHT}"`);
const html = `<!doctype html><html><head><style>
  * { margin: 0; padding: 0; }
</style></head><body>${svg}</body></html>`;

const chrome = await chromeLauncher.launch({
  chromeFlags: ["--headless=new", "--disable-gpu", "--no-sandbox"],
});

try {
  const browser = await puppeteer.connect({ browserURL: `http://localhost:${chrome.port}` });
  const page = await browser.newPage();
  await page.setViewport({ width: WIDTH, height: HEIGHT, deviceScaleFactor: 1 });
  await page.setContent(html, { waitUntil: "networkidle0" });
  const svgEl = await page.$("svg");
  await svgEl.screenshot({ path: outPath });
  await browser.close();
} finally {
  await chrome.kill();
}

console.log("Wrote", outPath);
