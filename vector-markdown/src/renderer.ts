import MarkdownIt from "markdown-it";
import * as path from "path";
import * as vscode from "vscode";
import { installAdmonitions } from "./admonitions";
import { inlineRelativeImages } from "./imageInliner";
import { ThemeManager } from "./themeManager";

const md = installAdmonitions(new MarkdownIt({ html: true, linkify: true, typographer: true }));

export interface RenderResult {
  bodyHtml: string;
  fullHtml: string;
  themeName: string;
}

/**
 * Renders a Markdown document into a themed, self-contained HTML document.
 * Used by both the live webview preview and every export target, so the
 * branded look is always identical across preview and exported file.
 */
export function renderDocument(
  markdownText: string,
  themeManager: ThemeManager,
  sourceDocumentUri: vscode.Uri | undefined,
  title: string
): RenderResult {
  const renderedHtml = md.render(markdownText);
  const baseDir = sourceDocumentUri ? path.dirname(sourceDocumentUri.fsPath) : process.cwd();
  const bodyHtml = inlineRelativeImages(renderedHtml, baseDir);
  const theme = themeManager.resolveActiveTheme(sourceDocumentUri);
  const branding = themeManager.getBranding(sourceDocumentUri);
  const brandTokenCss = themeManager.getBrandTokenOverrideCss(sourceDocumentUri);

  const header =
    theme.name === "corporate-light" || theme.name === "corporate-dark"
      ? `<div class="vector-header">
          ${branding.logoDataUri ? `<img src="${branding.logoDataUri}" alt="logo" />` : ""}
          ${branding.companyName ? `<span class="vector-company-name">${escapeHtml(branding.companyName)}</span>` : ""}
        </div>`
      : "";

  const footer =
    theme.name === "corporate-light" || theme.name === "corporate-dark"
      ? `<div class="vector-footer">${branding.companyName ? escapeHtml(branding.companyName) + " &middot; " : ""}Generated with Vector Markdown</div>`
      : "";

  const fullHtml = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>${escapeHtml(title)}</title>
<style>${theme.css}</style>
${brandTokenCss ? `<style>${brandTokenCss}</style>` : ""}
</head>
<body class="vector-markdown">
${header}
<div class="vector-body">
${bodyHtml}
</div>
${footer}
</body>
</html>`;

  return { bodyHtml, fullHtml, themeName: theme.name };
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
