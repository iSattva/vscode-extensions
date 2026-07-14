# Changelog

## Unreleased

- Brand color/font token settings (`vector.markdown.branding.colors.*`, `.fontFamily`, `.admonitionColors.*`) that override the active theme's defaults without writing CSS.
- GitHub-style admonitions (`[!NOTE]`, `[!TIP]`, `[!IMPORTANT]`, `[!WARNING]`, `[!CAUTION]`), styled per severity.
- Native VS Code preview integration: contributes theme-kind-aware styling and admonition rendering to the built-in Markdown preview via `markdown.previewStyles` and `extendMarkdownIt`.
- Real Git repository wired into `package.json`.
- Icon and splash redesigned as a vector arrow mark.

## 0.1.0

Initial scaffold.

- Branded webview preview with 4 built-in themes (`default`, `corporate-light`, `corporate-dark`, `minimal`) and custom CSS theme support.
- Company logo/name branding for corporate themes.
- Export to PDF (local Chrome/Edge), HTML, and DOCX (Pandoc with automatic pure-JS fallback).
- Editor and Explorer context menu integration.
