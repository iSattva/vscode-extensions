# Changelog

## 0.1.1

- Fixed the shared "Vector" context-menu flyout not appearing in `.md` files once `vector-html` was also installed - only one extension can anchor a shared submenu into `editor/context`/`explorer/context`, so `vector-markdown`'s anchor `when` clause now covers both extensions' file types (see `VECTOR_CONVENTIONS.md`).

## 0.1.0

Initial release.

- Branded webview preview with 4 built-in themes (`default`, `corporate-light`, `corporate-dark`, `minimal`) and custom CSS theme support.
- Company logo/name branding for corporate themes.
- Brand color/font token settings (`vector.markdown.branding.colors.*`, `.fontFamily`, `.admonitionColors.*`) that override the active theme's defaults without writing CSS.
- GitHub-style admonitions (`[!NOTE]`, `[!TIP]`, `[!IMPORTANT]`, `[!WARNING]`, `[!CAUTION]`), styled per severity.
- Native VS Code preview integration: contributes theme-kind-aware styling and admonition rendering to the built-in Markdown preview via `markdown.previewStyles` and `extendMarkdownIt`.
- Export to PDF (local Chrome/Edge), HTML, and DOCX (Pandoc with automatic pure-JS fallback).
- Editor and Explorer context menu integration.
