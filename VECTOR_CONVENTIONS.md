# Conventions for "Vector" extensions

Shared rules for every extension in this repo published under the "Vector" family
(currently `vector-markdown`; e.g. a future `vector-ai-usage`). Keeping these
consistent lets the extensions coexist in the same VS Code install without
colliding on menus, commands, settings, or keybindings.

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

- Every Vector extension contributes into the single submenu ID
  `vector.rootMenu` (label `"Vector"`) via `"menus": { "vector.rootMenu": [...] }`.
- Each extension **redundantly declares** the `submenus` entry for
  `vector.rootMenu` in its own `package.json` (same ID, same label). VS Code
  merges by ID, and this way the flyout survives even if one Vector extension
  is uninstalled.
- Within `vector.rootMenu`, each extension gets its own group prefix
  (`1_markdown@*`, `2_aiUsage@*`, ...) so items from different extensions don't
  interleave. Since everything lives inside one flyout, exact ordering between
  extensions is low-stakes — pick numbers in the order the extensions were
  added.
- Keep it to two menu levels: `right-click → Vector → command`. Don't nest a
  further submenu per extension inside `vector.rootMenu` — list each
  extension's commands flat, and rely on the command's title prefix (e.g.
  `"Vector Markdown: Export as PDF"`) to make the grouping readable instead of
  another flyout layer.
- Each extension is still responsible for its own `when` clause gating whether
  the *flyout itself* shows up in a given context (e.g. `vector-markdown` only
  shows it when `editorLangId == markdown || resourceExtname == .md`).

See `vector-markdown/package.json` (`contributes.menus`, `contributes.submenus`)
for the reference implementation.

## 3. Keybinding registry

Keep this list up to date whenever a Vector extension claims a keychord, so the
next one doesn't collide.

| Chord | Command | Extension | Notes |
|---|---|---|---|
| `Ctrl+Shift+V` / `Cmd+Shift+V` | `vector.markdown.openPreview` | vector-markdown | Also unbinds VS Code's built-in `markdown.showPreview` on this chord (see its `contributes.keybindings`) so there's no conflict. |

When a new extension wants a shortcut, check this table first, and add a row
here once it's claimed.
