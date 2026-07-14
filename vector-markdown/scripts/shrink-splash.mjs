import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import * as chromeLauncher from "chrome-launcher";
import puppeteer from "puppeteer-core";

const projectDir = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const srcPath = path.join(projectDir, "media", "splash.png");
const outPath = path.join(projectDir, "media", "splash.jpg");

const srcBase64 = fs.readFileSync(srcPath).toString("base64");
const html = `<!doctype html><html><body>
<canvas id="c"></canvas>
<script>
  const img = new Image();
  img.onload = () => {
    const canvas = document.getElementById('c');
    canvas.width = img.naturalWidth;
    canvas.height = img.naturalHeight;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(img, 0, 0);
    window.__jpegDataUrl = canvas.toDataURL('image/jpeg', 0.85);
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
  const dataUrl = await page.evaluate(() => window.__jpegDataUrl);
  const base64 = dataUrl.replace(/^data:image\/jpeg;base64,/, "");
  fs.writeFileSync(outPath, Buffer.from(base64, "base64"));
  await browser.close();
} finally {
  await chrome.kill();
}

const before = fs.statSync(srcPath).size;
const after = fs.statSync(outPath).size;
console.log(`Wrote ${outPath}`);
console.log(`${(before / 1024).toFixed(0)} KB -> ${(after / 1024).toFixed(0)} KB`);
