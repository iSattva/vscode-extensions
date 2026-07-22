# Changelog

## 0.0.5

- Fix: exporting to Markdown via Pandoc bypassed the HTML sanitizer, so a malicious HTML file's `<script>`/unsafe markup could survive unsanitized into the exported `.md`.

## 0.0.4

- Fix: sanitized preview stripped `class` from `<body>`/`<html>`, so the
  opened HTML file's own theme CSS never matched anything and rendered
  unstyled.
- Fix: `.vscodeignore` excluded `node_modules` from the packaged extension,
  breaking PDF export at runtime (`chrome-launcher` could not be found).

## 0.0.3

- Initial release: sanitized HTML preview, export HTML → PDF, export HTML →
  Markdown.
