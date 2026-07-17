# Vector AI Pulse

Ambient budget pacing for metered, agentic AI coding tools (Claude Code and peers) — right in the status bar.

## Privacy, first

- **Zero network code.** This extension imports no networking module of any kind. There is nothing to phone home with. This is enforced automatically, not just promised: `npm run lint:privacy` (`scripts/check-no-network.mjs`) scans the source and built output for any `http`/`https`/`net`/`dns`/`tls`/`fetch` usage and fails the build if found, and runs in CI on every push (`.github/workflows/vector-ai-pulse-ci.yml`).
- **All data stays local**, in a single human-readable JSON file at `~/.vector-ai-pulse/store.json`. Open it, read it, delete it — it's yours.
- No accounts, no telemetry, no license checks for anything in this extension.

## What it does (v1)

- Automatically tracks usage by reading each tool's own local session data — no manual entry needed:
  - **Claude Code** — `~/.claude/projects/**/*.jsonl`
  - **Cline** — its VS Code extension's `taskHistory.json`
  - **Codex CLI** — `$CODEX_HOME/sessions/**/rollout-*.jsonl`
  
  Never your prompts or completions — token counts, model, timestamps, and cost only.
- Tracks your daily/monthly AI spend against a budget you set.
- Shows a glanceable status bar cue — green/amber/red pace state — so you know if you're on track without leaving the editor.
- Click the cue to open the Pulse panel, split into two tabs:
  - **Live/Recent** — open sessions (live and idle, each session's own accent color), a rule-based recommendation, today's and this period's pace against budget, and today's activity grouped by project.
  - **Past** — a period toggle (week / last-N-days / all time) and metric toggle (cost / tokens / cache hit %) driving one trend chart and an expandable top-sessions list, plus all-time spend-by-model-over-time, by-tool, and by-model breakdowns.
- A native notification nudges you once a session goes quiet long enough to count as closed, only when there's something actionable to say (capped at 3/day).
- Manual entry for tools that don't expose per-token usage yet, plus CSV export for your own records.

## Commands

- **Vector AI Pulse: Open Pulse Panel**
- **Vector AI Pulse: Set Budget...**
- **Vector AI Pulse: Log Manual Entry...**
- **Vector AI Pulse: Export CSV...**
- **Vector AI Pulse: Reset All Data**

## Settings

- `vector.aiPulse.cueStyle` — `standard` (default), `minimal`, or `off`.
- `vector.aiPulse.pricing` — per-million-token USD overrides by model id, merged over built-in defaults.
- `vector.aiPulse.trendDays` — trend chart window in days (default 30, 7-180).
- `vector.aiPulse.activeSessionWindowMinutes` — how recent a session's last activity must be to show as "active" (default 10).
- `vector.aiPulse.idleSessionWindowMinutes` — how long past the active window a session still shows as "idle" (open but quiet) before it's treated as closed (default 60).
