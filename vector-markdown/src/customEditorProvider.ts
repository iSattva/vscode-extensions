import * as vscode from "vscode";
import { renderDocument } from "./renderer";
import { ThemeManager } from "./themeManager";

/**
 * Makes "Vector Markdown Preview" show up in VS Code's "Open With..."
 * picker for .md files. Our own "Open Branded Preview" command uses a
 * plain createWebviewPanel, which VS Code does not surface there -
 * only editors registered through this provider API appear in Open With.
 */
export class VectorMarkdownCustomEditorProvider implements vscode.CustomTextEditorProvider {
  static readonly viewType = "vector.markdown.preview";

  constructor(private readonly extensionUri: vscode.Uri, private readonly themeManager: ThemeManager) {}

  resolveCustomTextEditor(
    document: vscode.TextDocument,
    webviewPanel: vscode.WebviewPanel,
    _token: vscode.CancellationToken
  ): void {
    webviewPanel.webview.options = { enableScripts: false };

    const update = (): void => {
      const { fullHtml } = renderDocument(document.getText(), this.themeManager, document.uri, document.fileName);
      webviewPanel.webview.html = fullHtml;
    };

    update();

    const changeDocSub = vscode.workspace.onDidChangeTextDocument((event) => {
      if (event.document.uri.toString() === document.uri.toString()) {
        update();
      }
    });
    const changeConfigSub = vscode.workspace.onDidChangeConfiguration((event) => {
      if (event.affectsConfiguration("vector.markdown")) {
        update();
      }
    });

    webviewPanel.onDidDispose(() => {
      changeDocSub.dispose();
      changeConfigSub.dispose();
    });
  }
}
