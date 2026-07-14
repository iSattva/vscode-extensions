import * as vscode from "vscode";
import { renderDocument } from "../renderer";
import { ThemeManager } from "../themeManager";
import { resolveOutputPath } from "./outputPath";

/**
 * Renders via a locally installed Chrome/Edge (found by chrome-launcher) instead
 * of bundling Chromium, so the extension stays lightweight and needs no extra
 * install on any of the three platforms as long as a Chromium-based browser exists.
 */
export async function exportPdf(document: vscode.TextDocument, themeManager: ThemeManager): Promise<string> {
  const { fullHtml } = renderDocument(document.getText(), themeManager, document.uri, document.fileName);
  const outPath = resolveOutputPath(document, "pdf");
  const paperFormat = vscode.workspace
    .getConfiguration("vector.markdown")
    .get<string>("export.pdf.paperFormat", "A4");

  const chromeLauncher = await import("chrome-launcher");
  const puppeteer = await import("puppeteer-core");

  const chrome = await chromeLauncher.launch({
    chromeFlags: ["--headless=new", "--disable-gpu", "--no-sandbox"],
  });

  try {
    const browser = await puppeteer.connect({
      browserURL: `http://localhost:${chrome.port}`,
    });
    const page = await browser.newPage();
    await page.setContent(fullHtml, { waitUntil: "networkidle0" });
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
      "Vector Markdown could not find a local Chrome or Edge install for PDF export. " +
        "Install Google Chrome or Microsoft Edge, or set the CHROME_PATH environment variable."
    );
    this.name = "NoChromiumBrowserFoundError";
  }
}
