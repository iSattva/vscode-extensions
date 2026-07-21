# Changelog

## 0.0.2 — Unreleased

Session cards now show a per-model breakdown instead of a single last-seen model: a mid-session model switch (e.g. Opus to Sonnet) is tracked per model, with the current model pinned to the top of an in/out-tokens/cache/cost table and a total row when a session spans more than one model. Card header now shows the project name, a short session ID, and a tool badge (Claude Code / Cline / Codex). Past-session rows show a per-model cost-share pill on expand instead of the full table, keeping the top-sessions list scannable.

Fixed a cache-hit-ratio bug that could show percentages well over 100% (e.g. on long sessions where cache reads vastly outnumber new input tokens) - the ratio is now correctly cache reads as a share of total input context.

Session cards are now capped to a sane max width and truncate long workspace paths/model names (full value on hover) instead of stretching to fit; card and table font sizes bumped to match the rest of the panel.

Automatic tracking extended beyond Claude Code: Cline (reads `taskHistory.json` from its own globalStorage) and Codex CLI (reads `$CODEX_HOME/sessions/**/rollout-*.jsonl`) are now detected and ingested the same way, no manual entry needed. Collector internals split into a shared byte-offset/directory-walk module plus one file per tool, so each tool's parsing is isolated and a bad assumption in one can't affect another's data.

Panel reimagined around two tabs instead of one flat scroll: **Live/Recent** (open sessions - live and idle, recommendation, today's and this period's pace cards, today's by-project breakdown, cache % folded into the pace card instead of a separate recap line) and **Past** (period toggle - week/last-N-days/all-time - and metric toggle - cost/tokens/cache hit % - driving one trend chart and one expandable top-sessions list, replacing four separate fixed tables). All zero-JS: tabs and toggles are radio-input/sibling-selector CSS, expandable session rows are native `<details>`/`<summary>` - webview CSP and `enableScripts: false` are unchanged.

Session-end nudges: a native VS Code notification fires once a session goes quiet long enough to count as closed (not merely idle), only when there's an actionable insight, capped at 3/day - logged to `nudgeLog`.

Idle session state: a session between the active window and a new `vector.aiPulse.idleSessionWindowMinutes` (default 60) window shows as "idle" - hollow, non-pulsing dot - rather than being silently lumped in with sessions closed days ago.

Per-session accent colors (teal/amber/violet/coral, stable hash of sessionId) so simultaneous live/idle sessions in different projects are visually distinguishable from each other, not just from closed sessions.

Brand serif (`Georgia, 'Playfair Display', serif`, system-stack only) confined to the header logotype; all data (values, tables) on a sans stack with tabular figures for legibility and column alignment.

## 0.0.1 — Unreleased

Initial scaffold: local JSON store, pricing engine, budget pacing, status bar cue, manual entry, CSV export, reset command.

Automatic Claude Code session collection: incremental byte-offset JSONL ingestion, message-ID dedup, historical import on first run, live watcher.

Pulse panel: pace cards with projection, 30-day inline SVG trend, by-tool/by-model breakdowns, top-5 most expensive sessions, one rule-based recommended action, and a "your data" section showing the store path.

R8 privacy invariant: `npm run lint:privacy` fails the build on any network-capable import or `fetch()` usage in src/ or dist/; wired into `npm run package` and into CI (`.github/workflows/vector-ai-pulse-ci.yml`).

Branded Pulse panel: iSattva/Vector default look (teal-to-amber gradient mark, dark teal header band, gradient trend chart) matching the sibling extensions' brand assets; recommendation card now color-codes by pace severity.

Replaced the borrowed vector-markdown icon with a distinct AI Pulse mark: `media/icon-source.png` -> `media/icon.png` (128x128, `scripts/render-icon.mjs`), used as the extension's Marketplace icon and embedded in the Pulse panel header.

Dashboard feedback pass: token counts (not just cost) in the by-tool/by-model breakdowns and top-sessions table, plus today/period token totals on the pace cards; trend window is now configurable (`vector.aiPulse.trendDays`, default 30) instead of hardcoded; new "Active now" card shows Claude Code sessions with activity in the last few minutes (`vector.aiPulse.activeSessionWindowMinutes`) with a running cost/token/duration tally, refreshed on the same live-watcher cadence as the rest of the panel.

Panel restructured today-first: new "By project" section groups sessions by workspace (live session pinned first, recent history underneath), each session carrying its own rule-based insight (e.g. low cache reuse, light work on a premium model) rather than one global recommendation only; new "Spend by model over time" table (today/7d/30d/all time) answers the weekly/monthly analysis-by-model ask; existing by-tool/by-model/top-sessions tables kept as explicitly-labeled all-time rearview.
