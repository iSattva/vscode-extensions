import path from "path";
import { fileURLToPath } from "url";
import * as chromeLauncher from "chrome-launcher";
import puppeteer from "puppeteer-core";

const projectDir = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const svgPath = path.join(projectDir, "media", "splash.svg");
const outPath = path.join(projectDir, "media", "splash.png");

// splash.svg's <image href="icon.png"> is a relative path, so the page is
// loaded via file:// directly (not injected HTML) - that's what lets the
// browser resolve it against media/ without inlining a base64 copy in the
// SVG source.
const chrome = await chromeLauncher.launch({
  chromeFlags: ["--headless=new", "--disable-gpu", "--no-sandbox"],
});

try {
  const browser = await puppeteer.connect({ browserURL: `http://localhost:${chrome.port}` });
  const page = await browser.newPage();
  // deviceScaleFactor 2 renders at 2560x1280 (retina) while the SVG's own
  // viewBox/layout stays at its native 1280x640.
  await page.setViewport({ width: 1280, height: 640, deviceScaleFactor: 2 });
  await page.goto(`file://${svgPath.replace(/\\/g, "/")}`, { waitUntil: "networkidle0" });
  const svgEl = await page.$("svg");
  await svgEl.screenshot({ path: outPath });
  await browser.close();
} finally {
  await chrome.kill();
}

console.log("Wrote", outPath);
