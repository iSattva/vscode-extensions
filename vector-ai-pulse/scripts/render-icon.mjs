import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import * as chromeLauncher from "chrome-launcher";
import puppeteer from "puppeteer-core";

const projectDir = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const srcPath = path.join(projectDir, "media", "icon-source.png");
const outPath = path.join(projectDir, "media", "icon.png");

const ICON_SIZE = 128;

const srcBase64 = fs.readFileSync(srcPath).toString("base64");
const html = `<!doctype html><html><body>
<canvas id="c"></canvas>
<script>
  const img = new Image();
  img.onload = () => {
    const canvas = document.getElementById('c');
    canvas.width = ${ICON_SIZE};
    canvas.height = ${ICON_SIZE};
    const ctx = canvas.getContext('2d');
    ctx.drawImage(img, 0, 0, ${ICON_SIZE}, ${ICON_SIZE});
    window.__pngDataUrl = canvas.toDataURL('image/png');
    window.__done = true;
  };
  img.src = 'data:image/png;base64,${srcBase64}';
</script>
</body></html>`;

const chrome = await chromeLauncher.launch({ chromeFlags: ["--headless=new", "--disable-gpu", "--no-sandbox"] });
try {
  const browser = await puppeteer.connect({ browserURL: `http://localhost:${chrome.port}` });
  const page = await browser.newPage();
  await page.setContent(html, { waitUntil: "networkidle0" });
  await page.waitForFunction("window.__done === true");
  const dataUrl = await page.evaluate(() => window.__pngDataUrl);
  const base64 = dataUrl.replace(/^data:image\/png;base64,/, "");
  fs.writeFileSync(outPath, Buffer.from(base64, "base64"));
  await browser.close();
} finally {
  await chrome.kill();
}

const before = fs.statSync(srcPath).size;
const after = fs.statSync(outPath).size;
console.log(`Wrote ${outPath} (${ICON_SIZE}x${ICON_SIZE})`);
console.log(`${(before / 1024).toFixed(0)} KB -> ${(after / 1024).toFixed(0)} KB`);
