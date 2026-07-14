import * as fs from "fs";
import * as path from "path";
import * as vscode from "vscode";

export function resolveOutputPath(document: vscode.TextDocument, extension: "html" | "pdf" | "docx"): string {
  const config = vscode.workspace.getConfiguration("vectorMarkdown");
  const outputFolder = config.get<string>("export.outputFolder", "").trim();
  const baseName = path.basename(document.fileName, path.extname(document.fileName));

  const dir = outputFolder
    ? path.isAbsolute(outputFolder)
      ? outputFolder
      : path.join(
          vscode.workspace.getWorkspaceFolder(document.uri)?.uri.fsPath ?? path.dirname(document.fileName),
          outputFolder
        )
    : path.dirname(document.fileName);

  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  return path.join(dir, `${baseName}.${extension}`);
}
