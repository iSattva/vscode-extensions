import * as vscode from "vscode";
import { sanitizeRenderedHtml } from "../htmlSanitizer";
import { resolveOutputPath } from "./outputPath";

/**
 * Renders via a locally installed Chrome/Edge (found by chrome-launcher)
 * instead of bundling Chromium, so the extension stays lightweight and needs
 * no extra install on any of the three platforms as long as a Chromium-based
 * browser exists. Same approach as vector-markdown's PDF export.
 */
export async function exportPdf(document: vscode.TextDocument): Promise<string> {
  const safeHtml = sanitizeRenderedHtml(document.getText());
  const outPath = resolveOutputPath(document, "pdf");
  const paperFormat = vscode.workspace.getConfiguration("vector.html").get<string>("export.pdf.paperFormat", "A4");

  const chromeLauncher = await import("chrome-launcher");
  const puppeteer = await import("puppeteer-core");

  // No --no-sandbox: rendered HTML is sanitized (src/htmlSanitizer.ts), but
  // the OS sandbox stays on as defense-in-depth for this real Chrome page.
  const chrome = await chromeLauncher.launch({
    chromeFlags: ["--headless=new", "--disable-gpu"],
  });

  try {
    const browser = await puppeteer.connect({
      browserURL: `http://localhost:${chrome.port}`,
    });
    const page = await browser.newPage();
    await page.setContent(safeHtml, { waitUntil: "networkidle0" });
    await page.pdf({
      path: outPath,
      format: paperFormat as "A4" | "Letter" | "Legal",
      printBackground: true,
      margin: { top: "20mm", bottom: "20mm", left: "16mm", right: "16mm" },
    });
    await browser.close();
  } finally {
    await chrome.kill();
  }

  return outPath;
}

export class NoChromiumBrowserFoundError extends Error {
  constructor() {
    super(
      "Vector HTML could not find a local Chrome or Edge install for PDF export. " +
        "Install Google Chrome or Microsoft Edge, or set the CHROME_PATH environment variable."
    );
    this.name = "NoChromiumBrowserFoundError";
  }
}
