import * as vscode from "vscode";
import { VectorMarkdownCustomEditorProvider } from "./customEditorProvider";
import { exportDocx } from "./export/exportDocx";
import { exportHtml } from "./export/exportHtml";
import { exportPdf } from "./export/exportPdf";
import { PreviewPanel } from "./previewPanel";
import { ThemeManager } from "./themeManager";
import { getLogger } from "./utils/logger";

export async function activate(context: vscode.ExtensionContext): Promise<void> {
  const themeManager = new ThemeManager(context.extensionUri);
  const logger = getLogger();

  context.subscriptions.push(
    vscode.window.registerCustomEditorProvider(
      VectorMarkdownCustomEditorProvider.viewType,
      new VectorMarkdownCustomEditorProvider(context.extensionUri, themeManager),
      { webviewOptions: { retainContextWhenHidden: true } }
    )
  );

  context.subscriptions.push(
    vscode.commands.registerCommand("vector.markdown.openPreview", async (uri?: vscode.Uri) => {
      const document = await resolveMarkdownDocument(uri);
      if (!document) {
        return;
      }
      await vscode.window.withProgress(
        { location: vscode.ProgressLocation.Window, title: "Vector Markdown: Opening preview..." },
        async () => {
          PreviewPanel.createOrShow(context.extensionUri, themeManager, document);
        }
      );
    }),

    vscode.commands.registerCommand("vector.markdown.selectTheme", async () => {
      const options = [...themeManager.listBuiltInThemeNames(), "custom"];
      const picked = await vscode.window.showQuickPick(options, {
        title: "Vector Markdown: Select Preview Theme",
        placeHolder: `Current theme: ${themeManager.getActiveThemeName()}`,
      });
      if (!picked) {
        return;
      }
      await vscode.workspace
        .getConfiguration("vector.markdown")
        .update("theme", picked, vscode.ConfigurationTarget.Workspace);

      if (picked === "custom") {
        await vscode.commands.executeCommand("vector.markdown.configureCustomTheme");
      }
      PreviewPanel.refreshTheme(themeManager);
    }),

    vscode.commands.registerCommand("vector.markdown.configureCustomTheme", async () => {
      const picked = await vscode.window.showOpenDialog({
        canSelectMany: false,
        filters: { "CSS files": ["css"] },
        openLabel: "Use as Vector Markdown theme",
      });
      if (!picked || picked.length === 0) {
        return;
      }
      const config = vscode.workspace.getConfiguration("vector.markdown");
      await config.update("customThemePath", picked[0].fsPath, vscode.ConfigurationTarget.Workspace);
      await config.update("theme", "custom", vscode.ConfigurationTarget.Workspace);
      PreviewPanel.refreshTheme(themeManager);
      vscode.window.showInformationMessage(`Vector Markdown: custom theme set to ${picked[0].fsPath}`);
    }),

    vscode.commands.registerCommand("vector.markdown.exportPdf", async (uri?: vscode.Uri) =>
      runExport("PDF", uri, themeManager, logger, (doc) => exportPdf(doc, themeManager))
    ),

    vscode.commands.registerCommand("vector.markdown.exportHtml", async (uri?: vscode.Uri) =>
      runExport("HTML", uri, themeManager, logger, (doc) => exportHtml(doc, themeManager))
    ),

    vscode.commands.registerCommand("vector.markdown.exportDocx", async (uri?: vscode.Uri) =>
      runExport("DOCX", uri, themeManager, logger, async (doc) => {
        const result = await exportDocx(doc, themeManager);
        if (result.engine === "js-fallback") {
          logger.appendLine(`[DOCX] Pandoc not found, used built-in JS converter for ${doc.fileName}`);
        }
        return result.path;
      })
    ),

    vscode.commands.registerCommand("vector.markdown.exportAll", async (uri?: vscode.Uri) => {
      const document = await resolveMarkdownDocument(uri);
      if (!document) {
        return;
      }
      await vscode.window.withProgress(
        { location: vscode.ProgressLocation.Notification, title: "Vector Markdown: Exporting..." },
        async (progress) => {
          progress.report({ message: "PDF" });
          await safeExport("PDF", document, logger, () => exportPdf(document, themeManager), false);
          progress.report({ message: "HTML" });
          await safeExport("HTML", document, logger, () => exportHtml(document, themeManager), false);
          progress.report({ message: "DOCX" });
          await safeExport(
            "DOCX",
            document,
            logger,
            async () => (await exportDocx(document, themeManager)).path,
            false
          );
        }
      );
      vscode.window.showInformationMessage(`Vector Markdown: exported ${baseName(document)} as PDF, HTML & DOCX`);
    })
  );

  context.subscriptions.push(
    vscode.workspace.onDidChangeTextDocument((event) => {
      if (event.document.languageId === "markdown") {
        PreviewPanel.refreshIfVisible(themeManager, event.document);
      }
    }),
    vscode.workspace.onDidChangeConfiguration((event) => {
      if (event.affectsConfiguration("vector.markdown")) {
        PreviewPanel.refreshTheme(themeManager);
      }
    })
  );
}

export function deactivate(): void {
  // No teardown required: all resources are owned by context.subscriptions.
}

async function resolveMarkdownDocument(uri?: vscode.Uri): Promise<vscode.TextDocument | undefined> {
  if (uri) {
    return vscode.workspace.openTextDocument(uri);
  }
  const active = vscode.window.activeTextEditor?.document;
  if (active && active.languageId === "markdown") {
    return active;
  }
  vscode.window.showWarningMessage("Vector Markdown: open a Markdown file first.");
  return undefined;
}

async function runExport(
  label: string,
  uri: vscode.Uri | undefined,
  _themeManager: ThemeManager,
  logger: vscode.OutputChannel,
  run: (document: vscode.TextDocument) => Promise<string>
): Promise<void> {
  const document = await resolveMarkdownDocument(uri);
  if (!document) {
    return;
  }
  await safeExport(label, document, logger, () => run(document));
}

async function safeExport(
  label: string,
  document: vscode.TextDocument,
  logger: vscode.OutputChannel,
  run: () => Promise<string>,
  reportProgress = true
): Promise<void> {
  const task = async (): Promise<void> => {
    try {
      const outPath = await run();
      vscode.window
        .showInformationMessage(`Vector Markdown: exported ${label} to ${outPath}`, "Open File")
        .then((choice) => {
          if (choice === "Open File") {
            vscode.env.openExternal(vscode.Uri.file(outPath));
          }
        });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      logger.appendLine(`[${label} export failed] ${message}`);
      vscode.window.showErrorMessage(`Vector Markdown: ${label} export failed for ${baseName(document)}: ${message}`);
    }
  };

  if (!reportProgress) {
    await task();
    return;
  }

  await vscode.window.withProgress(
    { location: vscode.ProgressLocation.Notification, title: `Vector Markdown: Exporting ${label}...` },
    task
  );
}

function baseName(document: vscode.TextDocument): string {
  return document.fileName.split(/[\\/]/).pop() ?? document.fileName;
}
