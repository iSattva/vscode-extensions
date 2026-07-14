import * as vscode from "vscode";
import { sanitizeRenderedHtml } from "./htmlSanitizer";

/**
 * Renders the open .html file's sanitized markup directly as the webview's
 * own document (not via <iframe srcdoc>) with enableScripts left off, so
 * <script> tags in an untrusted file - even ones sanitize-html missed -
 * still can't execute: the webview has no script capability to execute them
 * with.
 */
export class HtmlPreviewProvider implements vscode.CustomTextEditorProvider {
  static readonly viewType = "vector.html.preview";

  constructor(private readonly extensionUri: vscode.Uri) {}

  resolveCustomTextEditor(
    document: vscode.TextDocument,
    webviewPanel: vscode.WebviewPanel,
    _token: vscode.CancellationToken
  ): void {
    webviewPanel.webview.options = { enableScripts: false };
    render(document, webviewPanel);

    const changeSub = vscode.workspace.onDidChangeTextDocument((event) => {
      if (event.document.uri.toString() === document.uri.toString()) {
        render(document, webviewPanel);
      }
    });
    webviewPanel.onDidDispose(() => changeSub.dispose());
  }
}

function render(document: vscode.TextDocument, webviewPanel: vscode.WebviewPanel): void {
  const safeHtml = sanitizeRenderedHtml(document.getText());
  const csp = "default-src 'none'; img-src data: https: http:; style-src 'unsafe-inline';";
  webviewPanel.webview.html = safeHtml.includes("<head>")
    ? safeHtml.replace("<head>", `<head><meta http-equiv="Content-Security-Policy" content="${csp}">`)
    : `<!DOCTYPE html><html><head><meta http-equiv="Content-Security-Policy" content="${csp}"></head><body>${safeHtml}</body></html>`;
}
