# Vector Markdown — Usage Guide

## 1. Installation

- **From a `.vsix` package**: Extensions view → `...` menu → *Install from VSIX...* → select `vector-markdown-<version>.vsix`.
- **From source (development)**: see [Developing](#developing) below.

Optional, for best-fidelity DOCX export:

- Install [Pandoc](https://pandoc.org/installing.html):
  - **Windows**: `winget install --id JohnMacFarlane.Pandoc` or the `.msi` from pandoc.org
  - **macOS**: `brew install pandoc`
  - **Linux**: `sudo apt install pandoc` (Debian/Ubuntu) or the equivalent for your distro

  Pandoc is a single self-contained binary — it does **not** require Python or Node/npm to run. If it isn't found on `PATH`, Vector Markdown automatically uses a built-in JavaScript DOCX converter instead, so DOCX export always works either way; Pandoc just produces more faithful output for complex tables/styles.

PDF export uses whatever Chrome or Edge is already installed on your machine (found automatically) — no separate download.

## 2. Previewing a document

1. Open any `.md` file in the editor.
2. Run the command **Vector Markdown: Open Branded Preview**, via:
   - Command Palette (`Ctrl+Shift+P` / `Cmd+Shift+P`) → type "Vector Markdown", or
   - The preview icon in the editor title bar.
3. The preview opens beside your editor and **live-updates** as you type.

## 3. Choosing a theme

1. Command Palette → **Vector Markdown: Select Preview Theme**.
2. Pick one of:
   - `default` — neutral, no branding chrome.
   - `corporate-light` — light theme with a branded header/footer band.
   - `corporate-dark` — dark theme with a branded header/footer band.
   - `minimal` — distraction-free serif typography, no chrome.
   - `custom` — prompts you to pick a CSS file (see below).
3. The setting is written to `.vscode/settings.json` under `vectorMarkdown.theme` (Workspace scope), so it's shared with your team when committed.

### Using your own CSS theme

1. Command Palette → **Vector Markdown: Configure Custom Theme...**.
2. Select any `.css` file. This sets `vectorMarkdown.theme` to `custom` and `vectorMarkdown.customThemePath` to the file you picked.
3. Your CSS controls the full page — target `.vector-markdown` (body), `.vector-header`, `.vector-body`, and `.vector-footer` to match the built-in theme structure, or write fully custom rules.
4. Edit the CSS file and save — the preview refreshes automatically.

### Adding your company logo and name

Set these in Settings (`Ctrl+,`) or `settings.json`, under the corporate themes:

```json
{
  "vectorMarkdown.theme": "corporate-light",
  "vectorMarkdown.branding.companyName": "Acme Corp",
  "vectorMarkdown.branding.logoPath": "assets/acme-logo.png"
}
```

`logoPath` accepts an absolute path or a path relative to your workspace root. The logo appears in the header band on `corporate-light` / `corporate-dark` themes.

## 4. Exporting

Right-click a `.md` file — in the editor or in the Explorer — and open the **Vector Markdown: Export** submenu:

| Command | Output | Notes |
| --- | --- | --- |
| **Vector Markdown: Export as PDF** | `<file>.pdf` next to the source (or configured output folder) | Renders via local Chrome/Edge headless, using the active theme |
| **Vector Markdown: Export as HTML** | `<file>.html` | Fully self-contained: theme CSS is inlined |
| **Vector Markdown: Export as DOCX** | `<file>.docx` | Uses Pandoc if found, else the built-in JS converter |
| **Vector Markdown: Export as PDF, HTML & DOCX** | All three | Runs all three exports in one step with a progress notification |

All export commands are also available from the Command Palette and act on the active editor's document if no file is right-clicked.

After export, a notification shows the output path with an **Open File** button.

### Changing the output location

By default, exported files are written next to the source `.md` file. To centralize output:

```json
{
  "vectorMarkdown.export.outputFolder": "exports"
}
```

Relative paths are resolved against the workspace root; absolute paths are used as-is.

### Controlling DOCX engine preference

```json
{
  "vectorMarkdown.export.docx.preferPandoc": true
}
```

Set to `false` to always use the built-in JS converter, even if Pandoc is installed.

### Controlling PDF paper size

```json
{
  "vectorMarkdown.export.pdf.paperFormat": "A4"
}
```

Accepts `A4`, `Letter`, or `Legal`.

## 5. Full command reference

| Command ID | Title | Where |
| --- | --- | --- |
| `vectorMarkdown.openPreview` | Vector Markdown: Open Branded Preview | Command Palette, editor title bar |
| `vectorMarkdown.selectTheme` | Vector Markdown: Select Preview Theme | Command Palette |
| `vectorMarkdown.configureCustomTheme` | Vector Markdown: Configure Custom Theme... | Command Palette |
| `vectorMarkdown.exportPdf` | Vector Markdown: Export as PDF | Command Palette, editor/Explorer context menu |
| `vectorMarkdown.exportHtml` | Vector Markdown: Export as HTML | Command Palette, editor/Explorer context menu |
| `vectorMarkdown.exportDocx` | Vector Markdown: Export as DOCX | Command Palette, editor/Explorer context menu |
| `vectorMarkdown.exportAll` | Vector Markdown: Export as PDF, HTML & DOCX | Command Palette, editor/Explorer context menu |

## 6. Full settings reference

| Setting | Type | Default | Description |
| --- | --- | --- | --- |
| `vectorMarkdown.theme` | enum | `default` | Active preview/export theme |
| `vectorMarkdown.customThemePath` | string | `""` | Path to custom CSS, used when theme is `custom` |
| `vectorMarkdown.branding.companyName` | string | `""` | Shown in corporate theme header/footer |
| `vectorMarkdown.branding.logoPath` | string | `""` | Logo shown in corporate theme header |
| `vectorMarkdown.export.outputFolder` | string | `""` | Export destination folder |
| `vectorMarkdown.export.docx.preferPandoc` | boolean | `true` | Prefer Pandoc over the JS fallback for DOCX |
| `vectorMarkdown.export.pdf.paperFormat` | enum | `A4` | PDF paper size (`A4`, `Letter`, `Legal`) |

## 7. Troubleshooting

- **"Could not find a local Chrome or Edge install" on PDF export** — install Google Chrome or Microsoft Edge, or set the `CHROME_PATH` environment variable to a Chromium-based browser executable.
- **DOCX export looks plain / tables lost formatting** — install Pandoc for higher-fidelity output; the JS fallback covers headings, lists, tables, and basic formatting but not advanced styling.
- **Custom theme not applying** — confirm `vectorMarkdown.theme` is set to `custom` and `vectorMarkdown.customThemePath` points to an existing `.css` file; check the **Vector Markdown** Output channel for errors.

## Developing

```bash
npm install
npm run build      # bundles src/extension.ts -> dist/extension.js
```

Press `F5` in VS Code (with this folder open) to launch an Extension Development Host with Vector Markdown loaded, then open `sample.md` to try it.

To produce an installable package:

```bash
npm run package     # requires @vscode/vsce, produces vector-markdown-<version>.vsix
```
