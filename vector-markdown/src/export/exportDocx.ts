import { spawn } from "child_process";
import * as fs from "fs";
import * as vscode from "vscode";
import { renderDocument } from "../renderer";
import { ThemeManager } from "../themeManager";
import { isPandocAvailable } from "./pandocDetector";
import { resolveOutputPath } from "./outputPath";

export type DocxEngine = "pandoc" | "js-fallback";

export interface DocxExportResult {
  path: string;
  engine: DocxEngine;
}

/**
 * DOCX has no good native VS Code path. We prefer Pandoc (best fidelity for
 * tables, TOC, styles) when present, and transparently fall back to a pure-JS
 * HTML->DOCX converter so export still works with zero extra installs.
 */
export async function exportDocx(document: vscode.TextDocument, themeManager: ThemeManager): Promise<DocxExportResult> {
  const preferPandoc = vscode.workspace
    .getConfiguration("vector.markdown")
    .get<boolean>("export.docx.preferPandoc", true);

  const outPath = resolveOutputPath(document, "docx");

  if (preferPandoc && (await isPandocAvailable())) {
    await runPandoc(document.fileName, outPath);
    return { path: outPath, engine: "pandoc" };
  }

  await runJsFallback(document, themeManager, outPath);
  return { path: outPath, engine: "js-fallback" };
}

function runPandoc(sourcePath: string, outPath: string): Promise<void> {
  return new Promise((resolve, reject) => {
    // No shell: true here - sourcePath/outPath come from the open document's
    // filename and export folder setting, and Node does not safely escape
    // array arguments against cmd.exe when shell: true is used on Windows,
    // which would let a crafted filename (e.g. containing "&") inject
    // arbitrary commands. Plain argv spawning passes args directly to the
    // process with no shell parsing.
    const proc = spawn("pandoc", [sourcePath, "-f", "gfm", "-t", "docx", "-o", outPath]);

    let stderr = "";
    proc.stderr?.on("data", (chunk) => {
      stderr += chunk.toString();
    });

    proc.on("error", (err) => reject(err));
    proc.on("exit", (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`Pandoc exited with code ${code}: ${stderr.trim()}`));
      }
    });
  });
}

async function runJsFallback(document: vscode.TextDocument, themeManager: ThemeManager, outPath: string): Promise<void> {
  const { bodyHtml } = renderDocument(document.getText(), themeManager, document.uri, document.fileName);
  const htmlToDocx = (await import("html-to-docx")).default;
  const buffer = await htmlToDocx(bodyHtml, undefined, {
    table: { row: { cantSplit: true } },
    footer: false,
    pageNumber: false,
  });
  fs.writeFileSync(outPath, buffer as Buffer);
}
