# Vector AI Pulse — Product Requirements Document (v1: "The Gauge")

**Publisher:** iSattva LLC · **Extension ID:** `isattva.vector-ai-pulse` · **Repo:** `github.com/isattva/vector-ai-pulse`
**Author:** Himanshu (iSattva LLC) · **Status:** Draft for review · **Date:** July 2026
**Scope of this PRD:** v1.0 public release + v1.x fast-follows. Team tier (v2) is covered only as architectural insurance (P2).

---

## 1. Problem Statement

Developers using metered, agentic AI coding tools (Claude Code, Codex, and peers) have no in-workflow visibility into their consumption pace, session efficiency, or model-cost fit. Indie developers spending their own money overspend or over-throttle; enterprise developers on monthly allowances (commonly $100–$500) exhaust them within days and lose AI tooling for the remainder of the period. Existing solutions — vendor dashboards, `/cost` commands, org BI rollups — report spend after the fact, per-tool, outside the editor; none operate at the point of consumption where pacing decisions are actually made.

**Evidence:** first-party observation of enterprise allowance exhaustion within the first week of a billing cycle; absence of any cross-tool, in-editor pacing product in the market; prevalence of single-tool OSS cost trackers indicating organic demand.

## 2. Goals

| # | Goal | Measure |
|---|---|---|
| G1 | Developers can see budget pace at a glance without leaving flow | Ambient cue visible within 2s of VS Code startup; pace state accurate to within the last processed session event |
| G2 | Change consumption behavior, measured in dollars | ≥ 30% of pilot users who previously exhausted budgets finish a full period with budget remaining |
| G3 | Make efficiency visible and actionable | Pulse panel surfaces context size, cache-reuse ratio, and one recommended action for the current/last session |
| G4 | Earn trust through verifiable privacy | Zero network calls (statically verifiable: no `http`/`https`/`net` imports); store file human-readable |
| G5 | Establish the cross-tool foundation | Canonical event schema ingests ≥ 2 tools by v1.x with no schema migration |

**Business goals:** ≥ 1,000 Marketplace installs in 90 days; ≥ 4.5 rating; pilot evidence pack (budget-survival + dollars-recovered) usable in Team-tier sales conversations.

## 3. Non-Goals (v1)

1. **Team/aggregate reporting** — v2 paid tier; v1 is single-developer only. (Prevents building the monetized layer before the free layer proves behavior change.)
2. **Live model routing or auto-switching** — retrospective analysis only in v1.x; live suggestions require classification accuracy evidence first; auto-routing requires org policy authority and is out of scope indefinitely.
3. **Copilot/Cursor/Windsurf token tracking** — these tools expose no per-token telemetry to extensions; v1 ships presence detection only, honestly labeled. No scraping, no reverse engineering.
4. **Any network capability** — no update checks, no telemetry, no cloud sync. Architectural absence, not a setting.
5. **Theme or window-chrome modification** — the cue is confined to the extension's own status bar item. No `workbench.colorCustomizations` writes, no title-bar tinting (also avoids macOS/Windows chrome divergence).
6. **Prompt-content storage** — the store holds usage metadata only (tokens, model, cost, timestamps, workspace name, session id). Never prompt or completion text.

## 4. Users & User Stories

### Persona A — The Builder (indie dev, own money)
- **A1 (P0):** As an indie developer on my own API keys, I want to set a daily/monthly budget and see a green/amber/red pace indicator in my status bar, so I can regulate spend without checking a dashboard.
- **A2 (P0):** As an indie developer, I want to click the indicator and see today's spend, projected end-of-period spend, and my most expensive sessions, so I know *why* I'm off pace.
- **A3 (P0):** As an indie developer, I want my Claude Code usage captured automatically and historically, so setup requires zero behavior change.
- **A4 (P1):** As an indie developer, I want to see cache-reuse ratio and context size per session, so I can fix inefficient context habits.
- **A5 (P1):** As an indie developer using multiple CLI agents, I want Codex sessions in the same view, so I have one number, not three dashboards.

### Persona B — The Allowance Dev (enterprise, org budget)
- **B1 (P0):** As an enterprise developer with a $200 monthly allowance, I want the pace projection to warn me when I'm trending to exhaust early, so I never lose tooling mid-sprint.
- **B2 (P1):** As an enterprise developer, I want a retrospective report of "sessions that could have run on a cheaper model" with estimated savings, so I can change my model habits with evidence.
- **B3 (P1):** As an enterprise developer, I want nudges only at session end or threshold crossings — never mid-flow — so the tool helps without irritating.

### Persona C — The Team Lead (v2, informs P2 architecture only)
- **C1 (P2):** As a team lead, I want a developer-initiated, anonymized, k-suppressed aggregate export, so I can report effectiveness without surveilling individuals.

### Edge/error stories
- **E1 (P0):** As a user without Claude Code installed, I want the extension to state that clearly and still let me set budgets and log manual entries, so first-run isn't a dead end.
- **E2 (P0):** As a user with a corrupt or legacy store file, I want automatic recovery to defaults without data-loss panic messaging.
- **E3 (P1):** As a color-blind user, I want the pace state readable from a glyph/text, not color alone.

## 5. Requirements

### 5.1 P0 — Must-Have (v1.0 cannot ship without)

**R1. Canonical local store**
Single JSON store at `~/.vector-ai-pulse/store.json` containing: schema `version`, `records[]` (timestamp, tool, model, workspace, sessionId, inputTokens, outputTokens, cacheReadTokens, cacheCreateTokens, costUsd), `seenMessageIds[]` (capped 50k), `fileOffsets{}`, `budget{}` (dailyUsd, monthlyUsd, periodStartDay), `nudgeLog[]` (empty in v1.0).
- ✅ Given a corrupt/older store, when the extension loads, then it migrates or resets to defaults without crashing (E2).
- ✅ Store is pretty-printed and human-readable; a `Reset All Data` command exists with confirmation.

**R2. Claude Code collector**
Watch `~/.claude/projects/**/*.jsonl`; incremental byte-offset reads; message-ID dedup; extract usage from assistant messages; compute cost via pricing table; historical import on first run with progress UI.
- ✅ Given existing history, when first activated, then all past sessions import exactly once (second reload imports zero).
- ✅ Given a live session, when an assistant turn completes, then the record appears and the cue refreshes within 5 seconds.
- ✅ Given file truncation/rotation (offset > size), then offset resets and dedup prevents double counting.
- ✅ Given Claude Code absent, then collector no-ops and the pulse panel shows "No supported tools detected" with manual-entry guidance (E1).

**R3. Pricing engine**
Configurable `vectorAiPulse.pricing` (per-million-token USD by model id), exact-then-prefix matching, sensible fallback, cache-read ≈ 10% input / cache-write ≈ 125% input defaults. Ships with current published Anthropic rates as defaults; user-editable.
- ✅ Given an unknown model id, then cost computes from fallback and is never NaN.
- ✅ Given a pricing change, then future records use new rates and the panel's pricing view reflects settings.

**R4. Budget pacing engine**
User sets daily and/or monthly budget (USD). Pace state computed as: **green** = cumulative spend ≤ linear pace; **amber** = projected end-of-period spend between 100–125% of budget; **red** = projected > 125% or budget already exhausted. Projection = simple linear extrapolation of period-to-date spend (v1; smarter models are P2).
- ✅ Given no budget set, then the cue shows neutral state with spend only, and the panel prompts (not nags) budget setup once.
- ✅ Given a budget, then state transitions are correct at boundaries (unit-tested) and update on every ingested record.

**R5. Ambient status bar cue**
Extension-owned status bar item: `● $4.20 / $10` style (glyph + spend + budget), background color by pace state using VS Code theme-safe colors, tooltip with 3-line breakdown, click opens pulse panel. Identical rendering on Windows and macOS (own item only — no chrome modification).
- ✅ Given amber/red state, then a glyph/text change accompanies the color (E3 — never color alone).
- ✅ Given user setting `cue.style = minimal | standard | off`, then the item respects it.

**R6. Pulse panel (webview)**
One screen: pace card (spend, budget, projection, days left), today/period totals, 30-day trend chart (inline SVG, no JS chart libraries), by-tool and by-model breakdowns, top-5 most expensive sessions, **one recommended action** slot (rule-based in v1: e.g., "budget exhausted pace — consider a cheaper model for routine tasks"). All strings HTML-escaped.
- ✅ Panel opens < 500ms from click with 10k records.
- ✅ Empty state (no records) renders guidance, not a blank page.

**R7. Manual entry & CSV export**
Command-palette manual logging (tool, tokens, cost) for untracked tools; CSV export of all records via save dialog.
- ✅ Exported row count equals record count; opens cleanly in Excel.

**R8. Privacy invariants**
No network-capable module imports anywhere in the codebase; CI grep/lint rule enforces it. README and Marketplace listing lead with the privacy architecture. A "Your data" view in the panel shows the store path and exactly what is collected.
- ✅ Static scan of the packaged VSIX finds no `http`, `https`, `net`, `dns`, `tls` requires and no `fetch` usage.

### 5.2 P1 — Nice-to-Have (fast-follow, v1.x)

**R9. Codex CLI collector** — same pattern as R2 against Codex session logs; records carry `tool: 'codex'`. Acceptance mirrors R2.

**R10. Context & cache efficiency insights** — per-session context size trend, cache-read ratio, compaction detection; panel "Efficiency" section with plain-language interpretation ("18% cache reuse — consider fresh sessions for unrelated tasks").

**R11. Nudge engine (foundation)** — rule-based nudges fired only at (a) pace-state upgrades to amber/red, (b) session end. v1.x library: *model-fit* ("this week: N sessions of light work on premium models ≈ $X headroom"), *context hygiene*, *pace warning at 75% budget*. Every nudge logs `{nudgeType, firedAt, action: accepted|dismissed|ignored, costDeltaObserved}` to `nudgeLog` — locally only. Global nudge frequency cap (default ≤ 3/day) and per-type mute.
- ✅ Given a mid-session state change, then no notification fires until session end (B3).
- ✅ Given a muted nudge type, then it never fires again until unmuted.

**R12. Retrospective model-routing report** — heuristic task classifier (prompt length, verb patterns, file count — metadata only if available; otherwise session-shape features) labels sessions light/standard/heavy; report shows premium-model sessions classified light with savings estimate. Explicitly labeled "estimate."

**R13. Copilot / Cursor presence** — detect installed/active where the extension API allows; represent as presence records with an honest "flat-rate / telemetry not exposed" label. No token guessing.

**R14. Onboarding walkthrough** — VS Code walkthrough contribution: set budget → see cue → open panel → (optional) import history.

### 5.3 P2 — Future Considerations (architectural insurance only)

- **Team aggregate export (C1):** developer-initiated command producing an anonymized JSON/CSV aggregate; k-anonymity suppression (no cut below group size 5); preview-before-save. *Design now:* keep record schema aggregation-friendly; never store PII beyond OS username-free workspace names.
- **Org policy file:** budgets/nudge rules loadable from a local file the org distributes; extension remains network-free.
- **Self-hosted aggregation server:** separate product; extension gains an *explicit, admin-configured* export target at most. Default remains no-network.
- **Smarter pace projection:** weekday-aware / EWMA projection replacing linear.
- **Pre-session model suggestions:** gated on R12 classifier precision ≥ 80% on the user's own labeled history.

## 6. Success Metrics

**Leading (first 30–60 days):**
- Activation: ≥ 60% of installs set a budget within 7 days (measured only in pilot cohorts via self-report/screenshots — the product itself reports nothing).
- Engagement: pilot users open the pulse panel ≥ 3×/week (local counter, user-visible).
- Nudge acceptance (v1.x): ≥ 20% per surviving nudge type; kill types below 10% after 4 weeks.

**Lagging (60–120 days):**
- **North star — budget survival:** ≥ 30% of pilot users who previously exhausted allowances complete a period within budget.
- **Dollars recovered:** positive cumulative cost delta from accepted nudges (local computation, user-exportable as the proof artifact).
- Marketplace: 1,000 installs / 4.5★ / uninstall < 15% at 90 days.

**Measurement note:** because the product has no telemetry by design, success measurement is pilot-based (5–10 consenting developers sharing local exports) plus Marketplace public stats. This is a deliberate trade and should be stated plainly in any review.

## 7. Technical Constraints & Notes

- Plain CommonJS + Node built-ins; no runtime dependencies; no bundler required. Python-based VSIX packaging (no vsce) acceptable for CI simplicity; standard `vsce` publishing for Marketplace.
- `engines.vscode >= 1.73.0`; activation `onStartupFinished`.
- All watcher work incremental (byte offsets) and batched-save to keep disk churn negligible during streaming sessions.
- Webview CSP: no remote resources, inline SVG charts only.
- MIT or BUSL license decision required before repo goes public (see Open Questions).
- Clean-room implementation: no code, assets, or client-specific artifacts from any prior engagement; generic naming, generic defaults, public data sources only.

## 8. Open Questions

| # | Question | Owner | Blocking? |
|---|---|---|---|
| Q1 | License: MIT (max adoption) vs BUSL/dual (protects Team tier)? | Founder + attorney | Blocks public repo, not development |
| Q2 | Codex/Gemini session log formats — confirm current on-disk schemas before R9 | Engineering (spike) | Blocks R9 only |
| Q3 | Pace thresholds (100/125%) — validate against pilot behavior or make adaptive? | Product (pilot data) | No |
| Q4 | Brand/trademark check on "Vector AI Pulse"; Marketplace publisher verification for iSattva | Founder | Blocks Marketplace listing |
| Q5 | Pricing defaults maintenance — manual updates per release vs user-editable-only stance? | Product | No |
| Q6 | Independent-contractor IP hygiene: confirm engagement agreements permit unrelated product work; document clean-room provenance | Attorney | Blocks commercialization, not build |

## 9. Timeline & Phasing

- **Phase 0 (week 1):** repo scaffold, store + pricing + Claude Code collector (R1–R3), CI privacy lint (R8).
- **Phase 1 (weeks 2–3):** pacing engine, status bar cue, pulse panel, manual entry, CSV (R4–R7). **Internal dogfood begins.**
- **Phase 2 (weeks 4–6):** 5–10 dev private pilot for one full billing cycle. Success gate: any budget-survival improvement + qualitative "kept it installed."
- **Phase 3 (weeks 6–8):** v1.0 Marketplace launch (pending Q1, Q4). v1.x P1 items sequenced by pilot feedback — R11 nudges first if engagement is high, R9 Codex first if multi-tool demand dominates.
- **Hard dependencies:** none external. **Soft:** Q4 before listing; Q6 before any paid offering.

## 10. Out-of-Scope Parking Lot

JetBrains/Neovim ports · per-project budget allocation · git-hook cost annotations on commits · weekly email-style local digest · Anthropic/OpenAI admin-API collectors (server-side, belongs to v2 self-hosted component) · gamification/streaks (risk: trivializes the trust posture).
