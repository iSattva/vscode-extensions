# Vector AI Pulse — Monetization & Free-Tier Strategy

**Publisher:** iSattva LLC · **Companion docs:** Product Vision v1.0, PRD v1.0 · **Status:** Draft v1.0 · **Date:** July 2026

---

## 1. The Packaging Principle (one rule that decides everything)

> **Everything that benefits one developer is free. Everything that coordinates more than one developer is paid.**

This line is easy to communicate, hard to game, and self-consistent with the product's privacy architecture: the free product needs no accounts, no license checks, no server — because it's local. The paid product is precisely the layer where a second party (a team, an org) enters the picture, and that's also exactly where willingness to pay lives. The free tier is not a crippled trial; it is the complete single-player game.

**Why the free tier must stay genuinely great:**
1. **The competitive floor is free.** OSS single-tool trackers exist; vendor `/cost` commands exist. A paywalled individual product loses to "good enough and free" every time.
2. **Devs are the distribution channel.** Bottom-up devtools monetize top-down: the dev installs free, the lead notices the team's budget-survival improving, the org buys the reporting layer. Starving the free tier starves the funnel.
3. **Trust is the moat.** A privacy-first product that nickel-and-dimes individuals reads as hypocritical. Generosity to the individual *is* the brand.

## 2. Tier Structure

### Tier 0 — **Pulse Free** (forever free, no account, no license key)

| Capability | Included |
|---|---|
| All collectors (Claude Code, Codex, Gemini CLI, future community collectors) | ✅ Full |
| Budget pacing + ambient status bar cue | ✅ Full |
| Pulse panel: trends, by-tool/by-model breakdowns, session costs | ✅ Full |
| Efficiency insights: context size, cache-reuse, compaction detection | ✅ Full |
| Full nudge engine + local outcome log ("dollars recovered" self-proof) | ✅ Full |
| Retrospective model-routing report | ✅ Full |
| Manual entry, personal CSV/JSON export, full data ownership | ✅ Full |
| Copilot/Cursor presence detection | ✅ Full |

Deliberately included in free even though it "could" be monetized: nudges and routing reports. They are the behavior-change engine — the thing that generates the *evidence* ("I recovered $40 last month") that later sells the Team tier. Charging for them would throttle the proof machine.

### Tier 1 — **Pulse Team** (per-seat, annual; license key, honor-system enforcement)

The coordination layer. Target: teams of 5–100 devs; the buyer is an eng lead/manager or platform team.

| Capability | Value to buyer |
|---|---|
| **Anonymized aggregate export** — dev-initiated, preview-before-save, k≥5 suppression | The accountable, non-surveillance answer to "is our AI spend working?" |
| **Nudge-effectiveness rollup** — acceptance rates by type, aggregate dollars recovered | ROI evidence for the AI budget line item; A/B data on which policies work |
| **Org policy file** — distribute budgets, pace thresholds, nudge rules via a local config the org ships (extension stays network-free) | Consistent allowance pacing across the team; the fix for "limits exhausted in days" |
| **BI-ready export schemas** (Power BI / Tableau templates) | Slots into the org's existing leadership dashboard instead of competing with it |
| **Priority collector support + email support SLA** | New tools covered fast; someone to call |

**Pricing:** **$8/seat/month billed annually** (launch: $6 early-adopter). Anchor: the free tier's own outcome log routinely evidences $30–50/dev/month recovered against typical $200 allowances — the pitch is a provable 4–6× return computed from the customer's own local data, not a vendor benchmark. Never price like a utility ($2 territory signals low value); never price like surveillance software (>$15 invites procurement scrutiny the product's ethos can't cash).

**Enforcement:** license key unlocks Team features; honor system beyond that. Enterprises pay for compliance, support, and updates — not DRM. Checkout via Paddle/Lemon Squeezy (merchant-of-record handles global sales tax; right-sized for a solo LLC).

### Tier 2 — **Pulse Server** (self-hosted, org-priced, later)

A separately purchased, **customer-hosted** aggregation service for orgs where "email me the monthly export" stops scaling (roughly >50 seats). Collects the same anonymized aggregates automatically — but only after an admin explicitly configures an export target; the extension still ships with zero network code and the endpoint lives inside the customer's perimeter. Pricing: flat annual ($5–15K by org size) on top of seats. This is expansion revenue that never betrays the local-first promise to individuals — the promise was always to the *developer's data*, and Server only ever moves the anonymized aggregate the org was already entitled to.

### Tier 3 — **iSattva Services** (available from day one; funds everything)

Fixed-fee engagements wrapped around the product — realistic near-term revenue for a solo operator while license revenue compounds:

- **Deployment package** ($15–25K): rollout to an eng org, custom collectors for their tool mix, policy-file design, BI integration of aggregate exports.
- **AI-spend governance workshop** ($5–10K): budget/nudge policy design, allowance right-sizing using pilot data, governance-committee artifacts.
- **Custom collector development** (fixed-fee per tool): internal or niche tools normalized into the canonical schema.

Sequencing logic: **services fund product → product proof grows services pipeline → Team tier productizes the services → Server captures the largest accounts.** Classic bootstrap flywheel; no external capital assumed.

## 3. Revenue Sequencing & Modest Targets

| Horizon | Focus | Realistic target (solo operator) |
|---|---|---|
| Months 0–4 | Free launch + pilot evidence pack | 1,000 installs; 2 documented budget-survival case studies |
| Months 4–9 | First 1–2 services engagements; Team tier beta | $20–40K services; 3–5 design-partner teams on free Team beta |
| Months 9–18 | Team tier GA | 20–50 paying teams × ~10 seats × $8 ≈ **$20–50K ARR** + services |
| Months 18+ | Pulse Server for largest accounts | 2–3 server deals ≈ +$15–40K/yr |

These are deliberately conservative — the strategy's job at this stage is to fund continued development and prove willingness-to-pay, not to model a venture outcome.

## 4. How the Free Version Keeps Helping Developers (and helping the business)

- **Free devs get the complete individual product forever** — pacing, insights, nudges, exports. No feature decay, no "your trial has ended," no account wall. Stated publicly as policy in the README.
- **Free devs generate the sales collateral.** The local "dollars recovered" report is exportable by the dev — when they show it to their manager, that's the Team-tier lead. Include a one-click "share my savings summary" (a redacted, content-free image/markdown snippet) to make this organic motion frictionless.
- **Free devs extend the moat.** Community-contributed collectors (open schema, documented adapter interface, MIT-licensed collector SDK) keep multi-tool coverage ahead of any single vendor — contributions the paid tiers inherit.
- **The upgrade trigger is organizational, never personal.** A dev never hits a paywall; a *team* hits a coordination need. This keeps Marketplace reviews (the primary growth channel) untainted by paywall resentment.

## 5. Monetization Red Lines (restated as policy)

1. **No vendor-sponsored placement** in model-routing or nudges — neutrality is the product.
2. **No sale, sharing, or cloud collection of usage data** — there is nothing to sell; the architecture forbids it.
3. **No per-individual reporting to managers** at any price point — aggregates only, k≥5, forever.
4. **No ads, no upsell interruptions** inside the editor surface — the ambient cue is sacred ground.
5. **No feature clawbacks** — anything shipped free stays free.

These are commitments, not tactics: each one forecloses a revenue path *and* is the reason the remaining paths convert.

## 6. Licensing & Legal Notes

- **Code license:** recommend **BUSL-1.1 (converting to Apache-2.0 after 4 years)** or **MIT core + proprietary Team modules** (open-core split). Pure MIT maximizes adoption but lets a vendor ship the Team layer; the open-core split is the cleanest match to the packaging principle. Decide before the repo goes public (PRD Q1).
- **Trademark:** register "Vector AI Pulse" wordmark under iSattva LLC before Marketplace launch (PRD Q4).
- **Provenance:** maintain the clean-room record (fresh repo, own hardware/time, no client artifacts) — first question in any future acquisition or enterprise due diligence. *(Flag for attorney review; not legal advice.)*

## 7. Risks Specific to This Model

| Risk | Mitigation |
|---|---|
| Free tier is so complete nobody upgrades | Correct by design — individuals were never the buyer. Watch the *team* conversion funnel, not individual conversion. |
| Honor-system licensing leaks seats | Acceptable at this scale; leakage is marketing. Revisit only if Server-tier accounts demand seat auditing (they'll ask for it themselves). |
| A vendor bundles free pacing UX | They can't bundle *cross-tool + neutral + no-telemetry*; accelerate collector breadth and publish the schema as a de facto standard. |
| Services revenue crowds out product time | Cap services at 2 concurrent engagements; every engagement must produce a reusable product asset (collector, template, artifact). |
| Solo-operator key-person risk on paid SLAs | Keep SLA promises modest (next-business-day email); document everything in the open repo. |
