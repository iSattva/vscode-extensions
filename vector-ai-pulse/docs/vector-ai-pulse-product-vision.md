# Vector AI Pulse — Product Vision

**Publisher:** iSattva LLC · **Extension ID:** `isattva.vector-ai-pulse` · **Repo:** `github.com/isattva/vector-ai-pulse`
**Document owner:** Himanshu (iSattva LLC) · **Status:** Draft v1.0 · **Date:** July 2026

---

## 1. Vision Statement

**Vector AI Pulse is the fuel gauge for AI-assisted development.** It lives where developers live — the editor — and turns invisible AI consumption into an ambient, glanceable, actionable signal, so every developer gets maximum progress per token and per dollar, without ever sending a byte of their data off their machine.

In five years, "coding without a pulse on your AI usage" should feel like driving without a fuel gauge: technically possible, obviously unwise.

## 2. Why Now

Three forces converged in 2025–2026:

1. **AI coding went agentic and metered.** Tools like Claude Code and Codex shifted heavy work to API-billed, token-metered sessions where a single afternoon can cost more than a month of a seat license. Spend became variable, personal, and opaque.
2. **Budgets arrived before visibility did.** Organizations began imposing monthly AI allowances per developer (commonly $100–$500). Developers routinely exhaust them in days — not from waste by intent, but because nothing in their workflow shows pace, efficiency, or alternatives *in the moment*. Org dashboards report the failure after it happens; nothing prevents it at the point of consumption.
3. **The tool landscape fragmented.** Developers mix Claude Code, Copilot, Codex, Cursor, Windsurf, and Gemini in one week. No vendor will ever build the neutral, cross-tool view — each has structural incentives to show only its own slice.

The gap is a **local-first, vendor-neutral, in-editor usage copilot**. That is Vector AI Pulse.

## 3. The Problem

> Developers using AI coding tools cannot answer, at the moment it matters: *How much have I used today? Am I on pace for my budget? Is this session efficient? Is this the right model for this task?*

**Consequences of not solving it:**
- **Indie/POC developers** spending their own money burn budget on exploratory sessions, oversized contexts, and premium models for routine tasks — then abandon or throttle AI usage entirely (the worst outcome: less AI leverage, not smarter AI leverage).
- **Enterprise developers** on allowances exhaust limits early and are then locked out of AI tooling for weeks — the org pays for a month of AI-augmented productivity and receives days.
- **Everyone** operates blind on context-window hygiene: bloated contexts, low cache reuse, and thrash sessions silently multiply cost with zero added output.

## 4. Who It's For

| Persona | Situation | Job to be done |
|---|---|---|
| **The Builder** (primary) | Indie dev / solopreneur building a POC or product on their own API keys and their own money | *"When I'm deep in a build session, I want to know my burn pace and efficiency without breaking flow, so I can ship more with the budget I have."* |
| **The Allowance Dev** (primary) | Enterprise developer with an org-imposed monthly AI budget | *"When I'm working through the month, I want to pace my allowance and get cheaper-path suggestions, so I never hit the wall and lose my tools mid-sprint."* |
| **The Team Lead** (secondary) | Leads 5–50 devs; accountable for AI spend and adoption | *"When I report up, I want anonymized, aggregate evidence of usage, savings, and nudge effectiveness — without surveilling individuals."* |

The elegant convergence: **the Builder and the Allowance Dev are the same user with the same mechanic — budget pacing — differing only in who sets the budget.** One product serves both.

## 5. Product Principles (non-negotiable)

1. **Local-first, zero network code.** The extension contains no networking capability at all. All data lives in a local store the developer can open, read, export, and delete. This is not a feature toggle; it is an architectural absence.
2. **Ambient over interruptive.** The primary surface is a peripheral-vision signal (the Prius-dashboard effect), not popups. Detail is pull-based (click), and nudges fire only at natural pauses and threshold crossings — never mid-flow.
3. **Every signal is actionable.** No color, number, or nudge ships unless the developer can do something about it in under a minute (switch model, compact context, start a fresh session, adjust pace). Raw volume without a lever is guilt, not guidance.
4. **Neutral referee.** No vendor pays for placement. Model-routing suggestions are driven solely by the developer's task, budget, and observed outcomes. Neutrality *is* the product.
5. **Self-evaluating.** The tool logs its own suggestion → action → outcome loop locally. If a nudge doesn't change behavior, it gets killed. Vector AI Pulse must prove its own value in the user's own data.
6. **Privacy floors, not privacy promises.** Aggregate exports are developer-initiated, human-transported, content-free, and k-anonymity–suppressed (no breakdown below group size 5). Individual nudge-response data never leaves the machine.

## 6. What It Is (concept of operation)

- **Collectors** ingest usage from local session artifacts of CLI agents (Claude Code first, Codex next, then Gemini CLI and others) into a **canonical usage-event schema**: timestamp, tool, model, workspace, session, input/output/cache tokens, cost. Tools that expose no per-token telemetry (Copilot, Cursor, Windsurf) are represented at whatever fidelity exists (presence, session counts) — partial data, honestly labeled.
- A **budget-pacing engine** compares consumption against a developer-set (or org-suggested) daily/monthly budget.
- An **ambient cue** — a colored indicator confined to the extension's own status bar item (green / amber / red pace states, paired with a glyph for accessibility) — shows pace at a glance. Clicking opens the **pulse panel**: today's burn, pace projection, context health, cache-reuse ratio, and the one recommended action.
- A **nudge engine** fires sparingly at thresholds and natural pauses: model-downgrade suggestions, context-compaction prompts, session-hygiene tips. Every nudge outcome (accepted / ignored / outcome cost delta) is logged locally.
- **Retrospective routing reports** show "work that could have run on a cheaper model" with recovered-dollar estimates — evidence first, live suggestions later, auto-routing never without explicit policy authority.
- **Exports:** personal CSV; anonymized team aggregate (paid tier) generated and transported by a human, inspectable before it goes anywhere.

## 7. Positioning

| Alternative | What it does | Why Pulse wins |
|---|---|---|
| Vendor dashboards / `/cost` commands | Per-tool, after-the-fact spend views | Cross-tool, in-flow, pacing + efficiency, actionable |
| OSS trackers (e.g., ccusage-style) | Claude-only CLI cost reports | Multi-tool schema, ambient UX, nudges with outcome proof, budget mechanic |
| Org BI dashboards (PBI/Tableau rollups) | Leadership rear-view mirror | Pulse is the *fuel gauge* — fixes pacing at the point of consumption; complements, never competes with, the rear-view mirror |
| Doing nothing | Blindness | Measured budget-survival and dollars recovered, in the user's own data |

**One-line positioning:** *The vendor dashboards tell you what you spent. Vector AI Pulse changes what you spend.*

## 8. North Star & Guardrail Metrics

- **North star:** *Budget-survival rate* — % of active users who reach end of budget period with allowance remaining (or within self-set budget).
- **Value metric:** *Dollars recovered* — cumulative cost delta attributable to accepted nudges and routing changes (computed locally, provable from the user's own records).
- **Health metrics:** weekly active pulse-panel opens; nudge acceptance rate ≥ 20% per surviving nudge type; uninstall rate.
- **Guardrails:** zero network calls (verifiable); nudge frequency ≤ 3/day median; no theme/chrome modification outside the extension's own status bar item.

## 9. Roadmap Horizons

- **Now (v1 — "The Gauge"):** Claude Code collector, canonical local store, budget pacing, ambient status bar cue, pulse panel, personal CSV export. Prove the pacing behavior change.
- **Next (v1.x — "The Coach"):** Codex + Gemini CLI collectors, nudge engine with local outcome logging, retrospective model-routing report, context-hygiene insights, Copilot/Cursor presence detection.
- **Later (v2 — "The Team"):** Paid Team tier — anonymized k-suppressed aggregate export, org budget-policy distribution, pre-session model suggestions. Optional **self-hosted** aggregation server (separate paid component, inside the customer's perimeter; the extension still ships with zero network code — pointing it anywhere is an explicit admin act).
- **Never (on principle):** background telemetry, vendor-sponsored routing, per-individual reporting to managers, monetization of usage data.

## 10. Business Model (open-core)

- **Free forever (individual):** all collectors, pacing, ambient cue, nudges, personal exports. This is the adoption engine; the indie alternative is free OSS, so the individual product must be free and better.
- **Team tier (per-seat, annual):** anonymized aggregate exports with k-suppression, policy distribution, priority collectors, support. Priced against provable savings ("dollars recovered"), not utility pricing.
- **iSattva services wrapper:** fixed-fee enterprise deployments — custom collectors, BI integration of aggregate exports, governance artifacts, nudge-policy workshops. Near-term revenue that funds the product.
- **Self-hosted aggregation server:** later expansion revenue; preserves local-first principles.

Distribution: VS Code Marketplace (free listing) + open GitHub repo; monetization off-platform via license keys.

## 11. Moat

1. **The nudge-outcome dataset pattern** — suggestion → action → cost outcome is a loop no vendor dashboard or BI rollup can close, because only the in-editor agent-adjacent layer sees all three.
2. **The neutral canonical schema + pluggable collectors** — the tool landscape churns quarterly; the adapter architecture compounds while single-vendor trackers reset.
3. **Trust as architecture** — "no network code" is a one-sentence security review and an impossible claim for any cloud-first competitor to copy without rebuilding.

## 12. Principal Risks

| Risk | Mitigation |
|---|---|
| Ambient cue doesn't change behavior | v1 is deliberately minimal; the pilot metric (budget survival) answers this in one billing cycle before further investment |
| Vendors ship native cost/pacing UX | They can't ship *cross-tool* or *neutral*; double down on multi-collector breadth and the outcome loop |
| Opaque tools (Copilot/Cursor) limit coverage | Honest partial-fidelity representation; value concentrates where spend is metered (CLI agents), which is exactly where blindness hurts most |
| Habituation ("red all day") | Red is always one click from a specific recovery action; pace resets daily; intensity user-tunable |
| Solo-maintainer bandwidth | Open-core + community collectors; services engagements fund focused product time |
