# Vector AI Pulse

Ambient budget pacing for metered, agentic AI coding tools (Claude Code and peers) — right in the status bar.

## Privacy, first

- **Zero network code.** This extension imports no networking module of any kind. There is nothing to phone home with. This is enforced automatically, not just promised: `npm run lint:privacy` (`scripts/check-no-network.mjs`) scans the source and built output for any `http`/`https`/`net`/`dns`/`tls`/`fetch` usage and fails the build if found, and runs in CI on every push (`.github/workflows/vector-ai-pulse-ci.yml`).
- **All data stays local**, in a single human-readable JSON file at `~/.vector-ai-pulse/store.json`. Open it, read it, delete it — it's yours.
- No accounts, no telemetry, no license checks for anything in this extension.

## What it does (v1)

- Automatically tracks Claude Code usage by reading `~/.claude/projects/**/*.jsonl` locally (never your prompts or completions — token counts, model, timestamps, and cost only).
- Tracks your daily/monthly AI spend against a budget you set.
- Shows a glanceable status bar cue — green/amber/red pace state — so you know if you're on track without leaving the editor.
- Click the cue to open the Pulse panel, ordered today-first: an "Active now" card for any Claude Code session with activity in the last few minutes, pace projection with token totals, per-project cards (each project's live session plus its recent history, with a mini insight per session when something's actionable), a spend-by-model-over-time table (today / 7 days / 30 days / all time), a configurable-length trend chart, and all-time by-tool/by-model breakdowns and top-5-most-expensive-sessions for the rearview.
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
- `vector.aiPulse.activeSessionWindowMinutes` — how recent a Claude Code session's last activity must be to show as "active" (default 10).
