import sanitizeHtml from "sanitize-html";

/**
 * markdown-it is configured with `html: true` so GitHub-flavored raw HTML
 * (e.g. <details>/<summary>) passes through - which also means an untrusted
 * .md file can embed <script> or event-handler attributes. This runs before
 * the HTML reaches the webview preview, PDF/HTML/DOCX export, or the native
 * VS Code preview, so a malicious document can't execute script in any of
 * them (the PDF path in particular renders in a real Chrome page, not a
 * sandboxed webview).
 */
export function sanitizeRenderedHtml(html: string): string {
  return sanitizeHtml(html, {
    allowedTags: sanitizeHtml.defaults.allowedTags.concat(["img"]),
    allowedAttributes: {
      ...sanitizeHtml.defaults.allowedAttributes,
      a: ["href", "name", "target", "title", "rel"],
      img: ["src", "alt", "title", "width", "height"],
      div: ["class"],
      span: ["class"],
      code: ["class"],
      pre: ["class"],
    },
    allowedSchemesByTag: {
      img: ["data", "http", "https"],
    },
  });
}
