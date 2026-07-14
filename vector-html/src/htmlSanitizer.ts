import sanitizeHtml from "sanitize-html";

/**
 * Every .html file this extension opens is untrusted input (unlike
 * vector-markdown, where the HTML is generated from the user's own
 * markdown-it render). This runs before the HTML reaches the webview
 * preview or the PDF export path, so a crafted file can't execute script in
 * either (the PDF export path in particular renders in a real Chrome page,
 * not a sandboxed webview).
 */
export function sanitizeRenderedHtml(html: string): string {
  return sanitizeHtml(html, {
    allowedTags: sanitizeHtml.defaults.allowedTags.concat(["img", "html", "head", "body", "style", "title", "meta"]),
    allowedAttributes: {
      ...sanitizeHtml.defaults.allowedAttributes,
      a: ["href", "name", "target", "title", "rel"],
      img: ["src", "alt", "title", "width", "height"],
      div: ["class"],
      span: ["class"],
      code: ["class"],
      pre: ["class"],
      meta: ["charset", "name", "content"],
    },
    allowedSchemesByTag: {
      img: ["data", "http", "https"],
    },
    allowVulnerableTags: false,
  });
}
