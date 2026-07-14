import type MarkdownIt from "markdown-it";

const KINDS = ["note", "tip", "important", "warning", "caution"] as const;
type Kind = (typeof KINDS)[number];

const MARKER_RE = /^\[!(NOTE|TIP|IMPORTANT|WARNING|CAUTION)\]\s?\n?/;

/**
 * GitHub-style admonitions: turns
 *   > [!NOTE]
 *   > text
 * into a <div class="vector-admonition vector-admonition-note"> block,
 * so it can be styled per-severity by the active theme's brand tokens.
 * Runs as a markdown-it core rule so it also works inside VS Code's
 * native preview via extendMarkdownIt, not just our own webview.
 */
export function installAdmonitions(md: MarkdownIt): MarkdownIt {
  md.core.ruler.push("vector_admonitions", (state) => {
    const tokens = state.tokens;

    for (let i = 0; i < tokens.length; i++) {
      if (tokens[i].type !== "blockquote_open") {
        continue;
      }

      const openIdx = i;
      let depth = 1;
      let j = i + 1;
      while (j < tokens.length && depth > 0) {
        if (tokens[j].type === "blockquote_open") depth++;
        if (tokens[j].type === "blockquote_close") depth--;
        j++;
      }
      const closeIdx = j - 1;

      const inlineIdx = openIdx + 2;
      const inlineToken = tokens[inlineIdx];
      if (!inlineToken || inlineToken.type !== "inline") {
        continue;
      }

      const match = MARKER_RE.exec(inlineToken.content);
      if (!match) {
        continue;
      }

      const kind = match[1].toLowerCase() as Kind;
      if (!KINDS.includes(kind)) {
        continue;
      }

      inlineToken.content = inlineToken.content.slice(match[0].length);
      const firstChild = inlineToken.children?.[0];
      if (firstChild && firstChild.type === "text") {
        firstChild.content = firstChild.content.replace(MARKER_RE, "");
      }

      tokens[openIdx].tag = "div";
      tokens[openIdx].attrSet("class", `vector-admonition vector-admonition-${kind}`);
      tokens[closeIdx].tag = "div";

      const labelToken = new state.Token("html_block", "", 0);
      labelToken.content = `<div class="vector-admonition-label">${kind}</div>\n`;
      labelToken.block = true;
      tokens.splice(openIdx + 1, 0, labelToken);
    }
  });

  return md;
}
