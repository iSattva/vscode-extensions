import * as fs from "fs";
import * as vscode from "vscode";
import { renderDocument } from "../renderer";
import { ThemeManager } from "../themeManager";
import { resolveOutputPath } from "./outputPath";

export async function exportHtml(document: vscode.TextDocument, themeManager: ThemeManager): Promise<string> {
  const { fullHtml } = renderDocument(document.getText(), themeManager, document.uri, document.fileName);
  const outPath = resolveOutputPath(document, "html");
  fs.writeFileSync(outPath, fullHtml, "utf8");
  return outPath;
}
