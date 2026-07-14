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
    return vscode.workspace.getConfiguration("vectorMarkdown").get<string>("theme", "default");
  }

  resolveActiveTheme(sourceDocumentUri?: vscode.Uri): ResolvedTheme {
    const config = vscode.workspace.getConfiguration("vectorMarkdown");
    const themeName = config.get<string>("theme", "default");

    if (themeName === "custom") {
      const customPath = config.get<string>("customThemePath", "").trim();
      if (!customPath) {
        throw new Error(
          "vectorMarkdown.theme is set to \"custom\" but vectorMarkdown.customThemePath is empty. " +
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
    const config = vscode.workspace.getConfiguration("vectorMarkdown");
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
}
