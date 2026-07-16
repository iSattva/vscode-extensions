# Conventions for "Vector" extensions

Shared rules for every extension in this repo published under the "Vector" family
(currently `vector-markdown`, `vector-html`, and `vector-ai-pulse`; a `vector-data`
extension for Parquet/CSV/JSON/XML is planned next). Keeping these consistent lets
the extensions coexist in the same VS Code install without colliding on menus,
commands, settings, or keybindings.

`vector-ai-pulse` is a status-bar/webview utility with no file-type association, so
it doesn't contribute to `editor/context` / `explorer/context` / `vector.rootMenu`
at all - the shared-submenu rules below apply only to file-preview-style Vector
extensions.

## 1. Namespace: `vector.<extension>.*`

Command IDs, configuration keys, and any other contribution ID must be prefixed
`vector.<extension>.`, e.g.:

- Commands: `vector.markdown.openPreview`, `vector.aiUsage.showDashboard`
- Settings: `vector.markdown.theme`, `vector.aiUsage.refreshInterval`
- Custom editor / webview view types: `vector.markdown.preview`

This makes every Vector command/setting sort together in the Command Palette
and Settings search under "vector".

## 2. One shared context-menu flyout: `vector.rootMenu`

Don't add a top-level entry per extension to `editor/context` /
`explorer/context` — that clutters the menu and forces a fight over group
ordering between extensions. Instead:

- Every Vector extension contributes *items* into the single submenu ID
  `vector.rootMenu` (label `"Vector"`) via `"menus": { "vector.rootMenu": [...] }`.
  This part does merge cleanly across extensions - each extension's items show
  up correctly as long as the flyout itself is visible (see next point).
- **Exactly one extension - the "owner", currently `vector-markdown` as the
  first in the family - declares both `contributes.submenus` for
  `vector.rootMenu` *and* the single `editor/context`/`explorer/context` entry
  that anchors the flyout into the menu.** Every other Vector extension
  (`vector-html`, and future ones) contributes *only* items into
  `contributes.menus["vector.rootMenu"]` - **no** `contributes.submenus`
  redeclaration and **no** `editor/context`/`explorer/context` entry of its
  own.
  - The owner's anchor `when` clause must be broadened to cover every sibling
    extension's applicable contexts, e.g.
    `"editorLangId == markdown || editorLangId == html"` for `editor/context`,
    and the equivalent `resourceExtname` OR-chain for `explorer/context`.
    Adding a new Vector extension means editing the owner's `when` clause to
    add its file type(s) - this is a real coupling cost, not just paperwork.
  - **Why, empirically (confirmed by testing on `vector-markdown` +
    `vector-html`):** VS Code appears to honor only one contributed
    `editor/context`/`explorer/context` item per `(menu location, submenu ID)`
    pair, regardless of differing `when` or `group` values - the
    most-recently-installed extension's anchor entry silently wins and the
    other's disappears entirely (even though that extension stays fully
    active: its commands and custom editor keep working, only this one menu
    contribution breaks). Two earlier, more surgical-looking fixes were tried
    and *did not* resolve it: giving each extension's anchor entry a distinct
    `group` (no effect), and having only one extension declare
    `contributes.submenus` while both still had their own anchor entries (no
    effect). Only removing every non-owner's anchor entry entirely fixed it.
  - **Known limitation:** if the owner (`vector-markdown`) is ever
    uninstalled, the whole `vector.rootMenu` flyout disappears for every
    sibling extension too, since nothing else declares the anchor. Accepted
    as a real constraint of how VS Code's submenu anchoring behaves, not
    worth re-litigating.
- Within `vector.rootMenu`, each extension gets its own group prefix
  (`1_markdown@*`, `2_html@*`, ...) so items from different extensions don't
  interleave. Since everything lives inside one flyout, exact ordering between
  extensions is low-stakes — pick numbers in the order the extensions were
  added.
- Keep it to two menu levels: `right-click → Vector → command`. Don't nest a
  further submenu per extension inside `vector.rootMenu` — list each
  extension's commands flat, and rely on the command's title prefix (e.g.
  `"Vector Markdown: Export as PDF"`) to make the grouping readable instead of
  another flyout layer.
- Each *item* inside `vector.rootMenu` still needs its own `when` clause so it
  only shows in its own extension's relevant contexts (e.g. `vector-html`'s
  items gate on `editorLangId == html || resourceExtname == .html || ...`) -
  this is unaffected by and separate from the owner/anchor issue above.

See `vector-markdown/package.json` (owner: `submenus` + anchor entries) and
`vector-html/package.json` (non-owner: `vector.rootMenu` items only) for
reference implementations.

## 3. Keybinding registry

Keep this list up to date whenever a Vector extension claims a keychord, so the
next one doesn't collide.

| Chord | Command | Extension | Notes |
|---|---|---|---|
| `Ctrl+Shift+V` / `Cmd+Shift+V` | `vector.markdown.openPreview` | vector-markdown | Also unbinds VS Code's built-in `markdown.showPreview` on this chord (see its `contributes.keybindings`) so there's no conflict. |

`vector-html` claims no keybinding yet - it only registers `2_html@*` menu
entries in `vector.rootMenu` (see `vector-html/package.json`).

When a new extension wants a shortcut, check this table first, and add a row
here once it's claimed.
