# Changelog

## 0.0.1 — Unreleased

Initial scaffold: local JSON store, pricing engine, budget pacing, status bar cue, manual entry, CSV export, reset command.

Automatic Claude Code session collection: incremental byte-offset JSONL ingestion, message-ID dedup, historical import on first run, live watcher.

Pulse panel: pace cards with projection, 30-day inline SVG trend, by-tool/by-model breakdowns, top-5 most expensive sessions, one rule-based recommended action, and a "your data" section showing the store path.

R8 privacy invariant: `npm run lint:privacy` fails the build on any network-capable import or `fetch()` usage in src/ or dist/; wired into `npm run package` and into CI (`.github/workflows/vector-ai-pulse-ci.yml`).

Branded Pulse panel: iSattva/Vector default look (teal-to-amber gradient mark, dark teal header band, gradient trend chart) matching the sibling extensions' brand assets; recommendation card now color-codes by pace severity.

Replaced the borrowed vector-markdown icon with a distinct AI Pulse mark: `media/icon-source.png` -> `media/icon.png` (128x128, `scripts/render-icon.mjs`), used as the extension's Marketplace icon and embedded in the Pulse panel header.

Dashboard feedback pass: token counts (not just cost) in the by-tool/by-model breakdowns and top-sessions table, plus today/period token totals on the pace cards; trend window is now configurable (`vector.aiPulse.trendDays`, default 30) instead of hardcoded; new "Active now" card shows Claude Code sessions with activity in the last few minutes (`vector.aiPulse.activeSessionWindowMinutes`) with a running cost/token/duration tally, refreshed on the same live-watcher cadence as the rest of the panel.

Panel restructured today-first: new "By project" section groups sessions by workspace (live session pinned first, recent history underneath), each session carrying its own rule-based insight (e.g. low cache reuse, light work on a premium model) rather than one global recommendation only; new "Spend by model over time" table (today/7d/30d/all time) answers the weekly/monthly analysis-by-model ask; existing by-tool/by-model/top-sessions tables kept as explicitly-labeled all-time rearview.
