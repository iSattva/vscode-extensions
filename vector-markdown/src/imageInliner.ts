import * as fs from "fs";
import * as path from "path";

const IMG_SRC_RE = /<img\s+([^>]*?)src=(["'])(.*?)\2([^>]*)>/gi;

const MIME_BY_EXT: Record<string, string> = {
  ".svg": "image/svg+xml",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".png": "image/png",
};

/**
 * Inlines local <img> references as base64 data URIs.
 *
 * Without this, a relative src like "media/splash.png" breaks in every
 * consumer of this HTML for a different reason: our webview preview
 * sandboxes local file/relative paths (VS Code webviews don't load them
 * without an explicit asWebviewUri conversion), Puppeteer's
 * page.setContent() runs the page at an about:blank origin that can't
 * resolve relative or file:// resources, and html-to-docx has no base
 * directory to resolve a relative path against. Inlining as data URIs
 * sidesteps all three at once, and also makes HTML export genuinely
 * self-contained as documented.
 */
export function inlineRelativeImages(html: string, baseDir: string): string {
  return html.replace(IMG_SRC_RE, (match, before, quote, src, after) => {
    if (/^(data:|https?:|vscode-webview:|vscode-resource:)/i.test(src)) {
      return match;
    }

    let decodedSrc: string;
    try {
      decodedSrc = decodeURIComponent(src);
    } catch {
      return match;
    }

    const resolved = path.isAbsolute(decodedSrc) ? path.normalize(decodedSrc) : path.resolve(baseDir, decodedSrc);
    const baseDirWithSep = baseDir.endsWith(path.sep) ? baseDir : baseDir + path.sep;
    if (!resolved.startsWith(baseDirWithSep)) {
      // Refuses to read anything outside the document's own directory tree -
      // otherwise a crafted src (e.g. "../../.ssh/id_rsa" or an absolute
      // path) in an untrusted .md file would let preview/export read and
      // embed arbitrary local files as base64.
      return match;
    }
    if (!fs.existsSync(resolved) || !fs.statSync(resolved).isFile()) {
      return match;
    }
    // The check above is lexical only, so a symlink *inside* baseDir whose
    // target points outside it (e.g. a tracked symlink in a malicious repo)
    // would pass it and still get transparently followed by fs.readFileSync
    // below - defeating the containment check entirely. Re-verify with the
    // real, symlink-resolved path before reading.
    let realResolved: string;
    let realBaseDir: string;
    try {
      realResolved = fs.realpathSync(resolved);
      realBaseDir = fs.realpathSync(baseDir);
    } catch {
      return match;
    }
    const realBaseDirWithSep = realBaseDir.endsWith(path.sep) ? realBaseDir : realBaseDir + path.sep;
    if (!realResolved.startsWith(realBaseDirWithSep)) {
      return match;
    }

    const mime = MIME_BY_EXT[path.extname(resolved).toLowerCase()] ?? "application/octet-stream";
    const data = fs.readFileSync(resolved).toString("base64");
    return `<img ${before}src=${quote}data:${mime};base64,${data}${quote}${after}>`;
  });
}
