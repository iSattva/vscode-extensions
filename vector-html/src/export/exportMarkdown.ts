import { spawn } from "child_process";
import * as fs from "fs";
import * as vscode from "vscode";
import { sanitizeRenderedHtml } from "../htmlSanitizer";
import { isPandocAvailable } from "./pandocDetector";
import { resolveOutputPath } from "./outputPath";

export type MarkdownEngine = "pandoc" | "js-fallback";

export interface MarkdownExportResult {
  path: string;
  engine: MarkdownEngine;
}

/**
 * Prefers Pandoc (best fidelity for tables, code blocks) when present, same
 * pattern as vector-markdown's DOCX export, and falls back to a pure-JS
 * HTML->Markdown converter (turndown) so export still works with zero extra
 * installs.
 */
export async function exportMarkdown(document: vscode.TextDocument): Promise<MarkdownExportResult> {
  const preferPandoc = vscode.workspace
    .getConfiguration("vector.html")
    .get<boolean>("export.markdown.preferPandoc", true);

  const outPath = resolveOutputPath(document, "md");

  if (preferPandoc && (await isPandocAvailable())) {
    await runPandoc(document.fileName, outPath);
    return { path: outPath, engine: "pandoc" };
  }

  await runJsFallback(document, outPath);
  return { path: outPath, engine: "js-fallback" };
}

function runPandoc(sourcePath: string, outPath: string): Promise<void> {
  return new Promise((resolve, reject) => {
    // No shell: true - sourcePath/outPath come from the open document's
    // filename and export folder setting, and Node does not safely escape
    // array arguments against cmd.exe when shell: true is used on Windows,
    // which would let a crafted filename inject arbitrary commands. Plain
    // argv spawning passes args directly to the process with no shell parsing.
    const proc = spawn("pandoc", [sourcePath, "-f", "html", "-t", "gfm", "-o", outPath]);

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

async function runJsFallback(document: vscode.TextDocument, outPath: string): Promise<void> {
  const safeHtml = sanitizeRenderedHtml(document.getText());
  const TurndownService = (await import("turndown")).default;
  const turndown = new TurndownService({ headingStyle: "atx", codeBlockStyle: "fenced" });
  const markdown = turndown.turndown(safeHtml);
  fs.writeFileSync(outPath, markdown);
}
