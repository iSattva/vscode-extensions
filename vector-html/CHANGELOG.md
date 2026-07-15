# Changelog

## 0.0.4

- Fix: sanitized preview stripped `class` from `<body>`/`<html>`, so the
  opened HTML file's own theme CSS never matched anything and rendered
  unstyled.
- Fix: `.vscodeignore` excluded `node_modules` from the packaged extension,
  breaking PDF export at runtime (`chrome-launcher` could not be found).

## 0.0.3

- Initial release: sanitized HTML preview, export HTML → PDF, export HTML →
  Markdown.
