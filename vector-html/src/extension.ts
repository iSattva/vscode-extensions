import * as vscode from "vscode";
import { exportMarkdown } from "./export/exportMarkdown";
import { exportPdf } from "./export/exportPdf";
import { HtmlPreviewProvider } from "./htmlPreviewProvider";
import { getLogger } from "./utils/logger";

export function activate(context: vscode.ExtensionContext): void {
  const logger = getLogger();

  context.subscriptions.push(
    vscode.window.registerCustomEditorProvider(
      HtmlPreviewProvider.viewType,
      new HtmlPreviewProvider(context.extensionUri),
      { webviewOptions: { retainContextWhenHidden: true } }
    )
  );

  context.subscriptions.push(
    vscode.commands.registerCommand("vector.html.openPreview", async (uri?: vscode.Uri) => {
      const target = uri ?? vscode.window.activeTextEditor?.document.uri;
      if (!target) {
        vscode.window.showWarningMessage("Vector HTML: open an HTML file first.");
        return;
      }
      await vscode.commands.executeCommand("vscode.openWith", target, HtmlPreviewProvider.viewType);
    }),

    vscode.commands.registerCommand("vector.html.exportPdf", async (uri?: vscode.Uri) =>
      runExport("PDF", uri, logger, exportPdf)
    ),

    vscode.commands.registerCommand("vector.html.exportMarkdown", async (uri?: vscode.Uri) =>
      runExport("Markdown", uri, logger, async (doc) => (await exportMarkdown(doc)).path)
    )
  );
}

export function deactivate(): void {
  // No teardown required: all resources are owned by context.subscriptions.
}

async function resolveHtmlDocument(uri?: vscode.Uri): Promise<vscode.TextDocument | undefined> {
  if (uri) {
    return vscode.workspace.openTextDocument(uri);
  }
  const active = vscode.window.activeTextEditor?.document;
  if (active && active.languageId === "html") {
    return active;
  }
  vscode.window.showWarningMessage("Vector HTML: open an HTML file first.");
  return undefined;
}

async function runExport(
  label: string,
  uri: vscode.Uri | undefined,
  logger: vscode.OutputChannel,
  run: (document: vscode.TextDocument) => Promise<string>
): Promise<void> {
  const document = await resolveHtmlDocument(uri);
  if (!document) {
    return;
  }

  await vscode.window.withProgress(
    { location: vscode.ProgressLocation.Notification, title: `Vector HTML: Exporting ${label}...` },
    async () => {
      try {
        const outPath = await run(document);
        vscode.window.showInformationMessage(`Vector HTML: exported ${label} to ${outPath}`, "Open File").then((choice) => {
          if (choice === "Open File") {
            vscode.env.openExternal(vscode.Uri.file(outPath));
          }
        });
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        logger.appendLine(`[${label} export failed] ${message}`);
        vscode.window.showErrorMessage(`Vector HTML: ${label} export failed for ${baseName(document)}: ${message}`);
      }
    }
  );
}

function baseName(document: vscode.TextDocument): string {
  return document.fileName.split(/[\\/]/).pop() ?? document.fileName;
}
