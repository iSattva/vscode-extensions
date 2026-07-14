import * as vscode from "vscode";
import { renderDocument } from "./renderer";
import { ThemeManager } from "./themeManager";

export class PreviewPanel {
  private static current: PreviewPanel | undefined;

  private readonly panel: vscode.WebviewPanel;
  private readonly disposables: vscode.Disposable[] = [];
  private sourceDocument: vscode.TextDocument;

  static createOrShow(
    extensionUri: vscode.Uri,
    themeManager: ThemeManager,
    document: vscode.TextDocument
  ): void {
    const column = vscode.window.activeTextEditor?.viewColumn ?? vscode.ViewColumn.One;

    if (PreviewPanel.current) {
      PreviewPanel.current.sourceDocument = document;
      PreviewPanel.current.panel.reveal(vscode.ViewColumn.Beside);
      PreviewPanel.current.update(themeManager);
      return;
    }

    const panel = vscode.window.createWebviewPanel(
      "vector.markdown.previewPanel",
      "Vector Markdown Preview",
      vscode.ViewColumn.Beside,
      { enableScripts: false, retainContextWhenHidden: true }
    );

    PreviewPanel.current = new PreviewPanel(panel, document);
    PreviewPanel.current.update(themeManager);
  }

  static refreshIfVisible(themeManager: ThemeManager, document: vscode.TextDocument): void {
    if (PreviewPanel.current && PreviewPanel.current.sourceDocument.uri.toString() === document.uri.toString()) {
      PreviewPanel.current.update(themeManager);
    }
  }

  static refreshTheme(themeManager: ThemeManager): void {
    if (PreviewPanel.current) {
      PreviewPanel.current.update(themeManager);
    }
  }

  private constructor(panel: vscode.WebviewPanel, document: vscode.TextDocument) {
    this.panel = panel;
    this.sourceDocument = document;

    this.panel.onDidDispose(() => this.dispose(), null, this.disposables);
  }

  private update(themeManager: ThemeManager): void {
    const { fullHtml } = renderDocument(
      this.sourceDocument.getText(),
      themeManager,
      this.sourceDocument.uri,
      this.sourceDocument.fileName
    );
    this.panel.webview.html = fullHtml;
  }

  private dispose(): void {
    PreviewPanel.current = undefined;
    this.disposables.forEach((d) => d.dispose());
  }
}
