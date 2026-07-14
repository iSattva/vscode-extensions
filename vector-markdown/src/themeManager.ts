import * as fs from "fs";
import * as path from "path";
import * as vscode from "vscode";

export interface ResolvedTheme {
  name: string;
  css: string;
}

const BUILT_IN_THEMES = ["default", "corporate-light", "corporate-dark", "minimal"] as const;
type BuiltInTheme = (typeof BUILT_IN_THEMES)[number];

function isBuiltIn(name: string): name is BuiltInTheme {
  return (BUILT_IN_THEMES as readonly string[]).includes(name);
}

function resolveWorkspacePath(rawPath: string, sourceDocumentUri?: vscode.Uri): string {
  if (path.isAbsolute(rawPath)) {
    return rawPath;
  }
  const folder = sourceDocumentUri
    ? vscode.workspace.getWorkspaceFolder(sourceDocumentUri)
    : vscode.workspace.workspaceFolders?.[0];
  const base = folder?.uri.fsPath ?? process.cwd();
  return path.join(base, rawPath);
}

export class ThemeManager {
  constructor(private readonly extensionUri: vscode.Uri) {}

  getActiveThemeName(): string {
    return vscode.workspace.getConfiguration("vector.markdown").get<string>("theme", "default");
  }

  resolveActiveTheme(sourceDocumentUri?: vscode.Uri): ResolvedTheme {
    const config = vscode.workspace.getConfiguration("vector.markdown");
    const themeName = config.get<string>("theme", "default");

    if (themeName === "custom") {
      const customPath = config.get<string>("customThemePath", "").trim();
      if (!customPath) {
        throw new Error(
          "vector.markdown.theme is set to \"custom\" but vector.markdown.customThemePath is empty. " +
            "Run \"Vector Markdown: Configure Custom Theme...\" to set it."
        );
      }
      const resolved = resolveWorkspacePath(customPath, sourceDocumentUri);
      if (!fs.existsSync(resolved)) {
        throw new Error(`Custom theme CSS file not found: ${resolved}`);
      }
      return { name: "custom", css: fs.readFileSync(resolved, "utf8") };
    }

    const builtIn: BuiltInTheme = isBuiltIn(themeName) ? themeName : "default";
    const cssPath = vscode.Uri.joinPath(this.extensionUri, "themes", `${builtIn}.css`).fsPath;
    return { name: builtIn, css: fs.readFileSync(cssPath, "utf8") };
  }

  getBranding(sourceDocumentUri?: vscode.Uri): { companyName: string; logoDataUri: string } {
    const config = vscode.workspace.getConfiguration("vector.markdown");
    const companyName = config.get<string>("branding.companyName", "").trim();
    const logoPath = config.get<string>("branding.logoPath", "").trim();

    let logoDataUri = "";
    if (logoPath) {
      const resolved = resolveWorkspacePath(logoPath, sourceDocumentUri);
      if (fs.existsSync(resolved)) {
        const ext = path.extname(resolved).toLowerCase();
        const mime = ext === ".svg" ? "image/svg+xml" : ext === ".jpg" || ext === ".jpeg" ? "image/jpeg" : "image/png";
        const data = fs.readFileSync(resolved).toString("base64");
        logoDataUri = `data:${mime};base64,${data}`;
      }
    }

    return { companyName, logoDataUri };
  }

  listBuiltInThemeNames(): string[] {
    return [...BUILT_IN_THEMES];
  }

  /**
   * Builds a :root override block for user-configured brand tokens (colors,
   * font, admonition colors), so it cascades over whichever built-in theme
   * defines the CSS variable defaults. Only emits variables the user actually
   * set, so unset tokens keep falling back to the active theme's own value.
   *
   * Values are sanitized rather than escaped: this string is embedded raw
   * inside a <style> tag in exported HTML, which (unlike the preview webview)
   * has no script-disabled sandbox, so a malicious value must be rejected
   * outright rather than merely HTML-escaped.
   */
  getBrandTokenOverrideCss(sourceDocumentUri?: vscode.Uri): string {
    const config = vscode.workspace.getConfiguration("vector.markdown");

    const varMap: Array<[string, string]> = [
      ["branding.colors.primary", "--vm-color-primary"],
      ["branding.colors.secondary", "--vm-color-secondary"],
      ["branding.colors.tertiary", "--vm-color-tertiary"],
      ["branding.fontFamily", "--vm-font-family"],
      ["branding.admonitionColors.note", "--vm-admonition-note"],
      ["branding.admonitionColors.tip", "--vm-admonition-tip"],
      ["branding.admonitionColors.important", "--vm-admonition-important"],
      ["branding.admonitionColors.warning", "--vm-admonition-warning"],
      ["branding.admonitionColors.caution", "--vm-admonition-caution"],
    ];

    const declarations: string[] = [];
    for (const [settingKey, cssVar] of varMap) {
      const raw = config.get<string>(settingKey, "").trim();
      if (!raw) {
        continue;
      }
      const safe = sanitizeCssValue(raw);
      if (safe) {
        declarations.push(`  ${cssVar}: ${safe};`);
      }
    }

    if (declarations.length === 0) {
      return "";
    }

    return `:root {\n${declarations.join("\n")}\n}`;
  }
}

/**
 * Allows the characters legitimate CSS color/font-family values need
 * (hex, rgb()/hsl(), percentages, named colors, comma-separated font
 * stacks with quoted names) while rejecting anything that could break
 * out of a <style> tag (<, >, `, backslash) or terminate the
 * declaration early in an unexpected way.
 */
function sanitizeCssValue(value: string): string | undefined {
  if (value.length > 200) {
    return undefined;
  }
  if (!/^[a-zA-Z0-9\s,.#%()'"_-]+$/.test(value)) {
    return undefined;
  }
  return value;
}
