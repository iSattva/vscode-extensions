import { escapeHtml, fmtDuration, fmtTokens, fmtUsd } from "./format";
import { computePace, PaceReading, PaceState } from "./pacing";
import { Budget, periodBounds, UsageRecord } from "./store";

// iSattva / Vector family brand palette, matching media/icon-source.svg and
// media/splash.svg in the sibling extensions (vector-markdown, vector-html) -
// dark teal chrome with a teal-to-amber accent gradient. This is the
// product's own default branding, distinct from vector-markdown's
// user-configurable "branding.*" settings for a developer's own documents.
const BRAND = {
  bgDark: "#0A1F1D",
  bgDarkEnd: "#103D38",
  iconBg: "#0D1117",
  accentTeal: "#2DD4BF",
  accentAmber: "#FBBF24",
  textOnDark: "#FFFFFF",
  subtleOnDark: "#9FC7C1",
  // System-stack only, matching the sibling extensions' splash art
  // (media/splash.svg): renders as Georgia/Segoe UI almost everywhere,
  // upgrades to the true brand faces only if a user happens to have them
  // installed. No @font-face / remote font loading - that would be a
  // network request from inside the webview, which R8's zero-network
  // invariant forbids outright, not just discourages.
  headlineFont: "Georgia, 'Playfair Display', serif",
  bodyFont: "-apple-system, 'Segoe UI', system-ui, var(--vscode-font-family), sans-serif",
};

// Small, brand-adjacent palette so simultaneous live sessions (working in
// >1 project at once) are visually distinguishable from each other, not
// just from closed sessions. Teal/amber are the brand pair; violet/coral
// extend it without clashing. Assignment is a stable hash of sessionId
// (not array index) so a given session keeps its color across re-renders
// even as the active-session list reorders.
const ACTIVE_COLORS = [BRAND.accentTeal, BRAND.accentAmber, "#A78BFA", "#FB7185"];

function sessionAccentColor(sessionId: string): string {
  let hash = 0;
  for (let i = 0; i < sessionId.length; i++) hash = (hash * 31 + sessionId.charCodeAt(i)) >>> 0;
  return ACTIVE_COLORS[hash % ACTIVE_COLORS.length];
}

interface AggregateRow {
  costUsd: number;
  count: number;
  totalTokens: number;
}

function tokenTotal(r: UsageRecord): number {
  return r.inputTokens + r.outputTokens + r.cacheReadTokens + r.cacheCreateTokens;
}

function groupByKey(records: UsageRecord[], key: "tool" | "model"): [string, AggregateRow][] {
  const map = new Map<string, AggregateRow>();
  for (const r of records) {
    const k = r[key] || "unknown";
    const row = map.get(k) ?? { costUsd: 0, count: 0, totalTokens: 0 };
    row.costUsd += r.costUsd;
    row.count += 1;
    row.totalTokens += tokenTotal(r);
    map.set(k, row);
  }
  return [...map.entries()].sort((a, b) => b[1].costUsd - a[1].costUsd);
}

type Metric = "cost" | "tokens" | "cache";
type Period = "week" | "month" | "all";

interface MetricBucket {
  costUsd: number;
  totalTokens: number;
  inputTokens: number;
  cacheReadTokens: number;
}

function emptyBucket(): MetricBucket {
  return { costUsd: 0, totalTokens: 0, inputTokens: 0, cacheReadTokens: 0 };
}

function addToBucket(b: MetricBucket, r: UsageRecord): void {
  b.costUsd += r.costUsd;
  b.totalTokens += tokenTotal(r);
  b.inputTokens += r.inputTokens + r.cacheReadTokens;
  b.cacheReadTokens += r.cacheReadTokens;
}

// "cache" reads as a 0-1 hit ratio (cache-read share of total input context)
// rather than a raw count, since that's the form the number is actually
// useful in - directly comparable to the "low cache reuse" nudge threshold
// used elsewhere in this file.
function metricValue(b: MetricBucket, metric: Metric): number {
  if (metric === "cost") return b.costUsd;
  if (metric === "tokens") return b.totalTokens;
  return b.inputTokens > 0 ? b.cacheReadTokens / b.inputTokens : 0;
}

function fmtMetric(value: number, metric: Metric): string {
  if (metric === "cost") return fmtUsd(value);
  if (metric === "tokens") return fmtTokens(value);
  return `${(value * 100).toFixed(0)}%`;
}

const METRIC_LABEL: Record<Metric, string> = { cost: "Cost", tokens: "Tokens", cache: "Cache hit %" };

function periodLabel(period: Period, monthDays: number): string {
  if (period === "week") return "This week";
  if (period === "month") return `Last ${monthDays} days`;
  return "All time";
}

function periodStartMs(period: Period, monthDays: number, now: number): number {
  if (period === "week") return now - 7 * 86_400_000;
  if (period === "month") return now - monthDays * 86_400_000;
  return 0;
}

// Week/month bucket daily (fine-grained enough to be useful, coarse enough
// to stay readable); all-time buckets monthly, capped to the most recent 24
// months, since daily bars over a multi-year history would be illegible and
// the question "all time" actually answers is month-over-month trend, not
// day-over-day.
function periodBuckets(records: UsageRecord[], period: Period, metric: Metric, now: Date, monthDays: number): TrendPoint[] {
  if (period === "all") {
    const byMonth = new Map<string, MetricBucket>();
    for (const r of records) {
      const key = r.timestamp.slice(0, 7); // YYYY-MM
      const b = byMonth.get(key) ?? emptyBucket();
      addToBucket(b, r);
      byMonth.set(key, b);
    }
    const months = [...byMonth.keys()].sort().slice(-24);
    return months.map((key) => {
      const [y, m] = key.split("-");
      const label = new Date(Number(y), Number(m) - 1, 1).toLocaleDateString(undefined, { month: "short", year: "2-digit" });
      const b = byMonth.get(key)!;
      return { label, value: metricValue(b, metric), tooltip: `${label}: ${fmtMetric(metricValue(b, metric), metric)}` };
    });
  }

  const days = period === "week" ? 7 : monthDays;
  const byDate = new Map<string, MetricBucket>();
  for (const r of records) {
    const key = r.timestamp.slice(0, 10);
    const b = byDate.get(key) ?? emptyBucket();
    addToBucket(b, r);
    byDate.set(key, b);
  }
  const out: TrendPoint[] = [];
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - i);
    const key = d.toISOString().slice(0, 10);
    const b = byDate.get(key) ?? emptyBucket();
    const label = key.slice(5);
    out.push({ label, value: metricValue(b, metric), tooltip: `${key}: ${fmtMetric(metricValue(b, metric), metric)}` });
  }
  return out;
}

function topSessionsForPeriod(records: UsageRecord[], period: Period, metric: Metric, monthDays: number, now: number, n: number): SessionAgg[] {
  const start = periodStartMs(period, monthDays, now);
  return [...aggregateSessions(records).values()]
    .filter((s) => s.lastAt >= start)
    .sort((a, b) => {
      const av = metricValue({ costUsd: a.costUsd, totalTokens: a.totalTokens, inputTokens: a.inputTokens, cacheReadTokens: a.cacheReadTokens }, metric);
      const bv = metricValue({ costUsd: b.costUsd, totalTokens: b.totalTokens, inputTokens: b.inputTokens, cacheReadTokens: b.cacheReadTokens }, metric);
      return bv - av;
    })
    .slice(0, n);
}

// Per-model sub-totals within a session, so a mid-session model switch (e.g.
// Opus -> Sonnet) is visible instead of silently collapsed into whichever
// model happened to write the last record.
export interface ModelUsageAgg {
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheCreateTokens: number;
  costUsd: number;
  lastAt: number;
}

export interface SessionAgg {
  sessionId: string;
  tool: string;
  model: string;
  workspace: string;
  costUsd: number;
  totalTokens: number;
  inputTokens: number;
  cacheReadTokens: number;
  firstAt: number;
  lastAt: number;
  models: Map<string, ModelUsageAgg>;
}

export function aggregateSessions(records: UsageRecord[]): Map<string, SessionAgg> {
  const map = new Map<string, SessionAgg>();
  for (const r of records) {
    const ts = Date.parse(r.timestamp);
    const existing = map.get(r.sessionId);
    const session: SessionAgg =
      existing ??
      ({
        sessionId: r.sessionId,
        tool: r.tool,
        model: r.model,
        workspace: r.workspace,
        costUsd: 0,
        totalTokens: 0,
        inputTokens: 0,
        cacheReadTokens: 0,
        firstAt: ts,
        lastAt: ts,
        models: new Map<string, ModelUsageAgg>(),
      } satisfies SessionAgg);
    session.costUsd += r.costUsd;
    session.totalTokens += tokenTotal(r);
    session.inputTokens += r.inputTokens;
    session.cacheReadTokens += r.cacheReadTokens;
    session.firstAt = Math.min(session.firstAt, ts);
    session.lastAt = Math.max(session.lastAt, ts);

    const modelBucket = session.models.get(r.model) ?? {
      inputTokens: 0,
      outputTokens: 0,
      cacheReadTokens: 0,
      cacheCreateTokens: 0,
      costUsd: 0,
      lastAt: ts,
    };
    modelBucket.inputTokens += r.inputTokens;
    modelBucket.outputTokens += r.outputTokens;
    modelBucket.cacheReadTokens += r.cacheReadTokens;
    modelBucket.cacheCreateTokens += r.cacheCreateTokens;
    modelBucket.costUsd += r.costUsd;
    modelBucket.lastAt = Math.max(modelBucket.lastAt, ts);
    session.models.set(r.model, modelBucket);

    map.set(r.sessionId, session);
  }
  // "Current" model = whichever model's bucket was written to most recently,
  // determined once records are fully merged rather than trusting log order.
  for (const session of map.values()) {
    let bestLastAt = -Infinity;
    for (const [model, bucket] of session.models) {
      if (bucket.lastAt > bestLastAt) {
        bestLastAt = bucket.lastAt;
        session.model = model;
      }
    }
  }
  return map;
}

// Current model first, then the rest by cost share descending - so the
// model actually driving the session right now reads at a glance, and the
// runners-up are ranked by how much they've actually cost, not recency.
function sessionModelRows(s: SessionAgg): { model: string; bucket: ModelUsageAgg; cacheRatio: number }[] {
  return [...s.models.entries()]
    .sort(([aModel, a], [bModel, b]) => {
      if (aModel === s.model) return -1;
      if (bModel === s.model) return 1;
      return b.costUsd - a.costUsd;
    })
    .map(([model, bucket]) => ({
      model,
      bucket,
      cacheRatio: bucket.inputTokens + bucket.cacheReadTokens > 0 ? bucket.cacheReadTokens / (bucket.inputTokens + bucket.cacheReadTokens) : 0,
    }));
}

function isActiveSession(s: SessionAgg, now: number, windowMinutes: number): boolean {
  return now - s.lastAt <= windowMinutes * 60_000;
}

// None of the tracked tools' local logs emit an explicit "session ended"
// event - only a last-write timestamp - so a session that's gone quiet past
// the active window isn't necessarily over: the dev may just be reading
// output or got pulled away. Idle covers that gap (active window .. idle
// window) so it reads as "still open, just quiet" rather than being lumped
// in with sessions closed weeks ago. Only past the idle window do we treat
// it as genuinely closed (and, separately, fire the session-end nudge).
function isIdleSession(s: SessionAgg, now: number, activeWindowMinutes: number, idleWindowMinutes: number): boolean {
  const sinceLast = now - s.lastAt;
  return sinceLast > activeWindowMinutes * 60_000 && sinceLast <= idleWindowMinutes * 60_000;
}

function activeSessions(records: UsageRecord[], windowMinutes: number, now: number): SessionAgg[] {
  return [...aggregateSessions(records).values()].filter((s) => isActiveSession(s, now, windowMinutes)).sort((a, b) => b.lastAt - a.lastAt);
}

function idleSessions(records: UsageRecord[], activeWindowMinutes: number, idleWindowMinutes: number, now: number): SessionAgg[] {
  return [...aggregateSessions(records).values()]
    .filter((s) => isIdleSession(s, now, activeWindowMinutes, idleWindowMinutes))
    .sort((a, b) => b.lastAt - a.lastAt);
}

export function medianSessionCost(records: UsageRecord[]): number {
  const costs = [...aggregateSessions(records).values()]
    .map((s) => s.costUsd)
    .sort((a, b) => a - b);
  if (costs.length === 0) return 0;
  const mid = Math.floor(costs.length / 2);
  return costs.length % 2 !== 0 ? costs[mid] : (costs[mid - 1] + costs[mid]) / 2;
}

// Per-session mini-insight (distinct from the one global pace recommendation
// above the fold) - only surfaces when there's something actionable,
// staying quiet otherwise per the "every signal is actionable" principle.
//
// Deliberately NOT based on within-session cache-hit ratio: real Claude
// Code sessions replay and cache the prior turn's context on nearly every
// subsequent turn, so that ratio sits near 100% almost by construction and
// never flags anything real. Cost-relative-to-the-user's-own-median is the
// signal that's actually well-defined per session.
export function sessionInsight(s: SessionAgg, medianCost: number): string | null {
  if (s.tool !== "claude-code") return null;
  if (medianCost > 0 && s.costUsd > Math.max(3 * medianCost, 5)) {
    return `One of your priciest sessions (~${(s.costUsd / medianCost).toFixed(1)}x your typical session) - large accumulated context across many turns is the likely driver. Consider splitting unrelated work into fresh sessions.`;
  }
  if (/opus/i.test(s.model) && medianCost > 0 && s.costUsd < medianCost * 0.5) {
    return "Premium model used for a below-typical-cost session - a lighter model may have been enough.";
  }
  if (s.models.size > 1) {
    const runnerUp = sessionModelRows(s)[1];
    if (runnerUp) {
      return `Switched from ${runnerUp.model} to ${s.model} mid-session - worth checking the new model matches the task's complexity.`;
    }
  }
  return null;
}

// Groups sessions by workspace so a project's live session and its recent
// history read as one story, rather than sessions from different projects
// interleaved by cost or recency alone.
function groupSessionsByWorkspace(records: UsageRecord[], maxWorkspaces: number, maxSessionsPerWorkspace: number): { workspace: string; sessions: SessionAgg[] }[] {
  const byWorkspace = new Map<string, SessionAgg[]>();
  for (const s of aggregateSessions(records).values()) {
    const list = byWorkspace.get(s.workspace) ?? [];
    list.push(s);
    byWorkspace.set(s.workspace, list);
  }
  const groups = [...byWorkspace.entries()].map(([workspace, sessions]) => ({
    workspace,
    sessions: sessions.sort((a, b) => b.lastAt - a.lastAt),
  }));
  groups.sort((a, b) => b.sessions[0].lastAt - a.sessions[0].lastAt);
  return groups.slice(0, maxWorkspaces).map((g) => ({ workspace: g.workspace, sessions: g.sessions.slice(0, maxSessionsPerWorkspace) }));
}

interface Recommendation {
  text: string;
  severity: PaceState;
}

// Single rule-based slot (v1 - PRD R6/R12): pace problems take priority
// over efficiency hints, since a budget overrun is more urgent than a
// context-hygiene nit. Retrospective model-routing (R12) is P1/v1.x.
function recommendedAction(daily: PaceReading, monthly: PaceReading, records: UsageRecord[]): Recommendation {
  const worst = daily.state === "red" || monthly.state === "red" ? "red" : daily.state === "amber" || monthly.state === "amber" ? "amber" : daily.state;

  if (worst === "red") {
    return {
      severity: "red",
      text: "You're over (or projected to blow through) budget. Consider a cheaper model for routine tasks, or start a fresh session if context has grown large.",
    };
  }
  if (worst === "amber") {
    return {
      severity: "amber",
      text: "Trending over budget for the period. Worth checking whether recent sessions could run on a lighter model.",
    };
  }

  const claudeRecords = records.filter((r) => r.tool === "claude-code");
  const totalInput = claudeRecords.reduce((s, r) => s + r.inputTokens + r.cacheReadTokens, 0);
  const totalCacheRead = claudeRecords.reduce((s, r) => s + r.cacheReadTokens, 0);
  if (totalInput > 500_000 && totalCacheRead / totalInput < 0.3) {
    return {
      severity: "green",
      text: "Cache reuse is low across recent sessions - starting fresh sessions for unrelated tasks (instead of one long-running one) usually improves it.",
    };
  }

  if (daily.budget === null && monthly.budget === null) {
    return {
      severity: "neutral",
      text: "No budget set yet. Set one to turn this pace card into an actual gauge rather than a plain spend counter.",
    };
  }

  return { severity: "green", text: "On pace. No action needed right now." };
}

interface TrendPoint {
  label: string;
  value: number;
  tooltip: string;
}

function buildTrendSvg(trend: TrendPoint[], ariaLabel: string, gradientId: string): string {
  const width = 600;
  const height = 140;
  const padding = 20;
  const max = Math.max(1e-9, ...trend.map((d) => d.value));
  const slot = (width - padding * 2) / Math.max(1, trend.length);
  const barWidth = Math.max(1, slot - 2);
  const labelStride = Math.max(1, Math.ceil(trend.length / 12));

  const bars = trend
    .map((d, i) => {
      const barHeight = (d.value / max) * (height - padding * 2);
      const x = padding + i * slot;
      const y = height - padding - barHeight;
      return `<rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${barWidth.toFixed(1)}" height="${Math.max(0, barHeight).toFixed(1)}" fill="url(#${gradientId})"><title>${escapeHtml(d.tooltip)}</title></rect>`;
    })
    .join("");

  const labels = trend
    .map((d, i) => i)
    .filter((i) => i % labelStride === 0)
    .map((i) => {
      const x = padding + i * slot;
      return `<text x="${x.toFixed(1)}" y="${height - 4}" font-size="9" style="fill:var(--vscode-descriptionForeground, #999)">${escapeHtml(trend[i].label)}</text>`;
    })
    .join("");

  // Gradient id must be unique per <svg> in the document, not just per call:
  // the History tab renders one of these per period x metric combo (only one
  // visible at a time via CSS), and a shared id resolves to whichever
  // element happens to be first in the DOM - if that one goes display:none
  // when a toggle switches, every other chart's fill breaks along with it.
  return `<svg viewBox="0 0 ${width} ${height}" width="100%" height="${height}" role="img" aria-label="${escapeHtml(ariaLabel)}">
    <defs>
      <linearGradient id="${gradientId}" x1="0%" y1="100%" x2="0%" y2="0%">
        <stop offset="0%" stop-color="${BRAND.accentTeal}" />
        <stop offset="100%" stop-color="${BRAND.accentAmber}" />
      </linearGradient>
    </defs>
    ${bars}${labels}
  </svg>`;
}

// media/icon.png (rendered from media/icon-source.png - the AI Pulse mark,
// distinct from vector-markdown's icon) is passed in as a data URI rather
// than referenced by path, since webview content can't resolve extension-
// relative file paths without a vscode-resource conversion the caller
// already has the context to do.
function brandMarkImg(dataUri: string, size: number): string {
  if (!dataUri) return `<div style="width:${size}px;height:${size}px;border-radius:8px;background:${BRAND.iconBg};"></div>`;
  return `<img src="${dataUri}" width="${size}" height="${size}" style="border-radius:8px;display:block;" alt="Vector AI Pulse" />`;
}

function buildBreakdownTable(rows: [string, AggregateRow][], labelHeader: string): string {
  if (rows.length === 0) return `<p class="empty">No data yet.</p>`;
  const total = rows.reduce((s, [, v]) => s + v.costUsd, 0) || 1;
  return `<table>
    <tr><th>${escapeHtml(labelHeader)}</th><th>Cost</th><th>Tokens</th><th>Sessions</th><th>Share</th></tr>
    ${rows
      .map(
        ([label, v]) =>
          `<tr><td>${escapeHtml(label)}</td><td>${fmtUsd(v.costUsd)}</td><td>${fmtTokens(v.totalTokens)}</td><td>${v.count}</td><td>${((v.costUsd / total) * 100).toFixed(0)}%</td></tr>`
      )
      .join("")}
  </table>`;
}

// Per-model breakdown table used on live/idle cards: current model pinned
// to the top row (see sessionModelRows), a Total row only when the session
// actually spans more than one model - repeating the same single row as a
// "total" would just be noise.
function modelTableHtml(s: SessionAgg): string {
  const rows = sessionModelRows(s);
  const rowsHtml = rows
    .map(
      ({ model, bucket, cacheRatio }) =>
        `<tr${model === s.model ? ' class="current-model"' : ""}><td title="${escapeHtml(model)}">${escapeHtml(model)}</td><td>${fmtTokens(bucket.inputTokens)}</td><td>${fmtTokens(bucket.outputTokens)}</td><td>${(cacheRatio * 100).toFixed(0)}%</td><td>${fmtUsd(bucket.costUsd)}</td></tr>`
    )
    .join("");
  const totalCacheRatio = s.inputTokens + s.cacheReadTokens > 0 ? s.cacheReadTokens / (s.inputTokens + s.cacheReadTokens) : 0;
  const totalRow =
    rows.length > 1
      ? `<tr class="total-row"><td>Total</td><td>${fmtTokens(rows.reduce((sum, r) => sum + r.bucket.inputTokens, 0))}</td><td>${fmtTokens(
          rows.reduce((sum, r) => sum + r.bucket.outputTokens, 0)
        )}</td><td>${(totalCacheRatio * 100).toFixed(0)}%</td><td>${fmtUsd(s.costUsd)}</td></tr>`
      : "";
  return `<table class="model-table">
    <tr><th>Model</th><th>In</th><th>Out</th><th>Cache</th><th>Cost</th></tr>
    ${rowsHtml}${totalRow}
  </table>`;
}

// Compact stand-in for the full model table on past sessions, where up to
// 10 rows per period x metric combo are listed at once - a per-model cost
// share pill reads at a glance without the table's vertical weight, and is
// omitted entirely for single-model sessions (the common case).
function modelSharePillsHtml(s: SessionAgg): string {
  if (s.models.size <= 1) return "";
  const total = s.costUsd || 1;
  const pills = sessionModelRows(s)
    .map(({ model, bucket }) => `<span class="model-pill">${escapeHtml(model)} ${((bucket.costUsd / total) * 100).toFixed(0)}%</span>`)
    .join("");
  return `<div class="model-pills">${pills}</div>`;
}

// Zero-JS expandable row: <details>/<summary> is native HTML, needs no
// script and works fine under the panel's default-src 'none' CSP - clicking
// a session reveals the same card layout used for live/idle sessions
// (minus the pulsing dot, since a historical session has no "now" to show).
function buildExpandableSessionsTable(sessions: SessionAgg[], metric: Metric, medianCost: number): string {
  if (sessions.length === 0) return `<p class="empty">No sessions in this period.</p>`;
  const rows = sessions
    .map((s) => {
      const value = metricValue({ costUsd: s.costUsd, totalTokens: s.totalTokens, inputTokens: s.inputTokens, cacheReadTokens: s.cacheReadTokens }, metric);
      const cacheRatio = s.inputTokens + s.cacheReadTokens > 0 ? s.cacheReadTokens / (s.inputTokens + s.cacheReadTokens) : 0;
      const insight = sessionInsight(s, medianCost);
      return `<details class="session-details">
        <summary>
          <span class="session-id">${escapeHtml(s.sessionId.slice(0, 8))}</span>
          <span class="session-meta">${escapeHtml(s.workspace)} - ${escapeHtml(s.model)} - ${fmtMetric(value, metric)}</span>
        </summary>
        <div class="card session-expanded">
          <div class="sub">${fmtUsd(s.costUsd)} - ${fmtTokens(s.totalTokens)} tok - cache ${(cacheRatio * 100).toFixed(0)}% - ran ${fmtDuration(s.lastAt - s.firstAt)}</div>
          ${modelSharePillsHtml(s)}
          ${insight ? `<div class="insight">${escapeHtml(insight)}</div>` : ""}
        </div>
      </details>`;
    })
    .join("");
  return `<div class="session-details-list">${rows}</div>`;
}

function sessionCardHtml(s: SessionAgg, now: number, medianCost: number, live: boolean): string {
  const insight = sessionInsight(s, medianCost);
  const accent = sessionAccentColor(s.sessionId);
  const dotClass = live ? "live-dot" : "idle-dot";
  const status = live ? `running ${fmtDuration(now - s.firstAt)}` : `idle ${fmtDuration(now - s.lastAt)}`;
  return `<div class="card active-session ${live ? "" : "idle-session"}" style="--session-accent:${accent}">
    <div class="label">
      <span class="${dotClass}"></span><span class="workspace-name" title="${escapeHtml(s.workspace)}">${escapeHtml(s.workspace)}</span>
      <span class="session-id">${escapeHtml(s.sessionId.slice(0, 8))}</span>
      <span class="tool-badge">${escapeHtml(s.tool)}</span>
    </div>
    <div class="sub">${status}</div>
    ${modelTableHtml(s)}
    ${insight ? `<div class="insight">${escapeHtml(insight)}</div>` : ""}
  </div>`;
}

// "Open sessions" covers both live (actively receiving turns) and idle
// (gone quiet but not yet treated as closed) sessions - see isIdleSession -
// split into two visually distinct groups so a quiet-but-open session in
// another project doesn't get mistaken for one still running, or get lost
// among fully closed history.
function buildActiveSessionsHtml(live: SessionAgg[], idle: SessionAgg[], now: number, medianCost: number): string {
  if (live.length === 0 && idle.length === 0) return "";
  const liveHtml = live.length ? `<div class="cards">${live.map((s) => sessionCardHtml(s, now, medianCost, true)).join("")}</div>` : "";
  const idleHtml = idle.length
    ? `<h3>Idle - picks up where you left off</h3><div class="cards">${idle.map((s) => sessionCardHtml(s, now, medianCost, false)).join("")}</div>`
    : "";
  return `<h2>Open sessions</h2>${liveHtml}${idleHtml}`;
}

function buildProjectCardsHtml(records: UsageRecord[], now: number, activeWindowMinutes: number, idleWindowMinutes: number, medianCost: number, heading: string): string {
  const groups = groupSessionsByWorkspace(records, 8, 5);
  if (groups.length === 0) return "";

  return `<h2>${escapeHtml(heading)}</h2>
  <div class="project-cards">
    ${groups
      .map((g) => {
        const totalCost = g.sessions.reduce((s, x) => s + x.costUsd, 0);
        const rows = g.sessions
          .map((s) => {
            const active = isActiveSession(s, now, activeWindowMinutes);
            const idle = !active && isIdleSession(s, now, activeWindowMinutes, idleWindowMinutes);
            const insight = sessionInsight(s, medianCost);
            const duration = active ? fmtDuration(now - s.firstAt) : idle ? `idle ${fmtDuration(now - s.lastAt)}` : fmtDuration(s.lastAt - s.firstAt);
            const accent = active || idle ? sessionAccentColor(s.sessionId) : undefined;
            const dot = active ? `<span class="live-dot"></span>` : idle ? `<span class="idle-dot"></span>` : "";
            return `<div class="session-row" ${accent ? `style="--session-accent:${accent}"` : ""}>
              <div class="session-row-main">
                ${dot}
                <span class="session-id">${escapeHtml(s.sessionId.slice(0, 8))}</span>
                <span class="session-meta">${escapeHtml(s.model)} - ${fmtUsd(s.costUsd)} - ${fmtTokens(s.totalTokens)} tok - ${duration}</span>
              </div>
              ${insight ? `<div class="insight">${escapeHtml(insight)}</div>` : ""}
            </div>`;
          })
          .join("");
        return `<div class="card project-card">
          <div class="label">${escapeHtml(g.workspace)}</div>
          <div class="value">${fmtUsd(totalCost)}</div>
          <div class="sub">${g.sessions.length} recent session${g.sessions.length === 1 ? "" : "s"}</div>
          <div class="session-list">${rows}</div>
        </div>`;
      })
      .join("")}
  </div>`;
}

interface ModelSpendOverTime {
  model: string;
  today: number;
  last7: number;
  last30: number;
  allTime: number;
}

function modelSpendOverTime(records: UsageRecord[], now: Date, dayStart: Date): ModelSpendOverTime[] {
  const sevenDaysAgo = now.getTime() - 7 * 86_400_000;
  const thirtyDaysAgo = now.getTime() - 30 * 86_400_000;
  const map = new Map<string, ModelSpendOverTime>();
  for (const r of records) {
    const model = r.model || "unknown";
    const row = map.get(model) ?? { model, today: 0, last7: 0, last30: 0, allTime: 0 };
    const ts = Date.parse(r.timestamp);
    row.allTime += r.costUsd;
    if (ts >= thirtyDaysAgo) row.last30 += r.costUsd;
    if (ts >= sevenDaysAgo) row.last7 += r.costUsd;
    if (ts >= dayStart.getTime()) row.today += r.costUsd;
    map.set(model, row);
  }
  return [...map.values()].sort((a, b) => b.allTime - a.allTime).slice(0, 8);
}

function buildModelSpendOverTimeTable(rows: ModelSpendOverTime[]): string {
  if (rows.length === 0) return `<p class="empty">No data yet.</p>`;
  return `<table>
    <tr><th>Model</th><th>Today</th><th>Last 7 days</th><th>Last 30 days</th><th>All time</th></tr>
    ${rows
      .map((r) => `<tr><td>${escapeHtml(r.model)}</td><td>${fmtUsd(r.today)}</td><td>${fmtUsd(r.last7)}</td><td>${fmtUsd(r.last30)}</td><td>${fmtUsd(r.allTime)}</td></tr>`)
      .join("")}
  </table>`;
}

interface TodayStats {
  todayRecords: UsageRecord[];
  todayCachePct: number | null;
  // Only meaningful in the morning, before today's own numbers exist yet -
  // see morningRecap. null the rest of the day, since "today so far" is
  // already shown by the Today pace card and repeating it here would just
  // be the same numbers twice.
  morningRecap: string | null;
}

// Morning framing looks back at yesterday, since today's own numbers are
// still empty and thus unhelpful as a headline; the Today pace card already
// covers "today so far" for the rest of the day, so this is deliberately
// the only place yesterday's figures appear - no second "today so far" line
// duplicating the pace card.
function computeTodayStats(records: UsageRecord[], now: Date, dayStart: Date, daily: PaceReading): TodayStats {
  const todayRecords = records.filter((r) => new Date(r.timestamp) >= dayStart);
  const todayInput = todayRecords.reduce((s, r) => s + r.inputTokens + r.cacheReadTokens, 0);
  const todayCacheRead = todayRecords.reduce((s, r) => s + r.cacheReadTokens, 0);
  const todayCachePct = todayInput > 0 ? (todayCacheRead / todayInput) * 100 : null;

  let morningRecap: string | null = null;
  if (now.getHours() < 12) {
    const yesterdayStart = new Date(dayStart);
    yesterdayStart.setDate(yesterdayStart.getDate() - 1);
    const yesterdayRecords = records.filter((r) => {
      const ts = new Date(r.timestamp);
      return ts >= yesterdayStart && ts < dayStart;
    });
    const yesterdaySpend = yesterdayRecords.reduce((s, r) => s + r.costUsd, 0);
    const yesterdayTokens = yesterdayRecords.reduce((s, r) => s + tokenTotal(r), 0);
    morningRecap = `Yesterday: ${fmtUsd(yesterdaySpend)}, ${fmtTokens(yesterdayTokens)} tokens.${daily.budget !== null ? ` Today's budget: ${fmtUsd(daily.budget)} available.` : " No daily budget set."}`;
  }

  return { todayRecords, todayCachePct, morningRecap };
}

function buildHistoryTabHtml(records: UsageRecord[], now: Date, medianCost: number, monthDays: number, dayStart: Date): string {
  const periods: Period[] = ["week", "month", "all"];
  const metrics: Metric[] = ["cost", "tokens", "cache"];

  const periodRadios = periods.map((p) => `<input type="radio" name="period" id="period-${p}" class="toggle-input"${p === "week" ? " checked" : ""}>`).join("");
  const metricRadios = metrics.map((m) => `<input type="radio" name="metric" id="metric-${m}" class="toggle-input"${m === "cost" ? " checked" : ""}>`).join("");
  const periodBar = `<div class="toggle-bar">${periods.map((p) => `<label for="period-${p}" class="toggle-label">${escapeHtml(periodLabel(p, monthDays))}</label>`).join("")}</div>`;
  const metricBar = `<div class="toggle-bar">${metrics.map((m) => `<label for="metric-${m}" class="toggle-label">${escapeHtml(METRIC_LABEL[m])}</label>`).join("")}</div>`;

  const combos = periods
    .flatMap((p) =>
      metrics.map((m) => {
        const trend = buildTrendSvg(periodBuckets(records, p, m, now, monthDays), `${periodLabel(p, monthDays)} ${METRIC_LABEL[m]} trend`, `pulseBarGrad-${p}-${m}`);
        const sessions = topSessionsForPeriod(records, p, m, monthDays, now.getTime(), 10);
        return `<div class="history-combo hc-${p}-${m}">
          <h3>${escapeHtml(periodLabel(p, monthDays))} trend - ${escapeHtml(METRIC_LABEL[m])}</h3>
          ${trend}
          <h3>Top sessions</h3>
          ${buildExpandableSessionsTable(sessions, m, medianCost)}
        </div>`;
      })
    )
    .join("");

  return `${periodRadios}${metricRadios}
  ${periodBar}
  ${metricBar}
  <div class="history-content">${combos}</div>

  <h2>Spend by model over time</h2>
  ${buildModelSpendOverTimeTable(modelSpendOverTime(records, now, dayStart))}

  <h2>By tool (all time)</h2>
  ${buildBreakdownTable(groupByKey(records, "tool"), "Tool")}

  <h2>By model (all time)</h2>
  ${buildBreakdownTable(groupByKey(records, "model"), "Model")}`;
}

export interface PanelInput {
  records: UsageRecord[];
  budget: Budget;
  storePath: string;
  claudeDetected: boolean;
  clineDetected: boolean;
  codexDetected: boolean;
  brandMarkDataUri: string;
  trendDays: number;
  activeSessionWindowMinutes: number;
  idleSessionWindowMinutes: number;
}

export function renderPanelHtml(input: PanelInput): string {
  const {
    records,
    budget,
    storePath,
    claudeDetected,
    clineDetected,
    codexDetected,
    brandMarkDataUri,
    trendDays,
    activeSessionWindowMinutes,
    idleSessionWindowMinutes,
  } = input;
  const now = new Date();
  const { daily, monthly } = computePace(records, budget, now);
  const { dayStart, monthStart } = periodBounds(now, budget.periodStartDay);
  const dailyTokens = records.filter((r) => new Date(r.timestamp) >= dayStart).reduce((s, r) => s + tokenTotal(r), 0);
  const monthlyTokens = records.filter((r) => new Date(r.timestamp) >= monthStart).reduce((s, r) => s + tokenTotal(r), 0);
  const active = activeSessions(records, activeSessionWindowMinutes, now.getTime());
  const idle = idleSessions(records, activeSessionWindowMinutes, idleSessionWindowMinutes, now.getTime());
  const medianCost = medianSessionCost(records);

  const detectedTools = [claudeDetected && "Claude Code", clineDetected && "Cline", codexDetected && "Codex"].filter((t): t is string => Boolean(t));
  const emptyMessage =
    detectedTools.length > 0
      ? `No usage recorded yet. ${detectedTools.join(", ")} sessions are picked up automatically as you use them - or log a manual entry for other tools.`
      : "No supported tools detected on this machine (checked Claude Code, Cline, and Codex's local session data). Use <b>Vector AI Pulse: Log Manual Entry...</b> to track usage from other tools.";

  if (records.length === 0) {
    return shellHtml(
      `
      <p class="empty">${emptyMessage}</p>
      <h2>Your data</h2>
      <p>Stored locally, human-readable, never transmitted:</p>
      <p class="store-path">${escapeHtml(storePath)}</p>
    `,
      brandMarkDataUri
    );
  }

  const budgetPrompt =
    daily.budget === null && monthly.budget === null
      ? `<p class="hint">No budget set yet. Run <b>Vector AI Pulse: Set Budget...</b> from the Command Palette to turn this into a pace gauge.</p>`
      : "";

  const daysLeftInMonth = new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0).getDate() - new Date().getDate();
  const recommendation = recommendedAction(daily, monthly, records);

  const { todayRecords, todayCachePct, morningRecap } = computeTodayStats(records, now, dayStart, daily);

  const liveTab = `
    ${buildActiveSessionsHtml(active, idle, now.getTime(), medianCost)}
    ${budgetPrompt}
    <div class="card recommendation sev-${recommendation.severity}">${escapeHtml(recommendation.text)}</div>
    ${morningRecap ? `<p class="recap">${escapeHtml(morningRecap)}</p>` : ""}
    <div class="cards">
      <div class="card">
        <div class="label">Today</div>
        <div class="value">${fmtUsd(daily.spend)}${daily.budget !== null ? ` / ${fmtUsd(daily.budget)}` : ""}</div>
        <div class="sub">${fmtTokens(dailyTokens)} tokens${todayCachePct !== null ? ` - cache ${todayCachePct.toFixed(0)}%` : ""}${daily.projected !== null ? ` - projected ${fmtUsd(daily.projected)}` : ""}</div>
      </div>
      <div class="card">
        <div class="label">This period</div>
        <div class="value">${fmtUsd(monthly.spend)}${monthly.budget !== null ? ` / ${fmtUsd(monthly.budget)}` : ""}</div>
        <div class="sub">${fmtTokens(monthlyTokens)} tokens${monthly.projected !== null ? ` - projected ${fmtUsd(monthly.projected)}, ${daysLeftInMonth}d left` : ""}</div>
      </div>
    </div>
    ${buildProjectCardsHtml(todayRecords, now.getTime(), activeSessionWindowMinutes, idleSessionWindowMinutes, medianCost, "By project today")}`;

  const pastTab = buildHistoryTabHtml(records, now, medianCost, trendDays, dayStart);

  const tabs = `
    <input type="radio" name="tab" id="tab-live" class="tab-input" checked>
    <input type="radio" name="tab" id="tab-past" class="tab-input">
    <div class="tab-bar">
      <label for="tab-live" class="tab-label">Live/Recent</label>
      <label for="tab-past" class="tab-label">Past</label>
    </div>
    <div class="tab-panel tab-panel-live">${liveTab}</div>
    <div class="tab-panel tab-panel-past">${pastTab}</div>

    <h2>Your data</h2>
    <p>${records.length} records, stored locally, human-readable, never transmitted:</p>
    <p class="store-path">${escapeHtml(storePath)}</p>
  `;

  return shellHtml(tabs, brandMarkDataUri);
}

function shellHtml(body: string, brandMarkDataUri: string): string {
  return `<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; img-src data:;">
<style>
  :root {
    --pulse-teal: ${BRAND.accentTeal};
    --pulse-amber: ${BRAND.accentAmber};
  }
  body { font-family: ${BRAND.bodyFont}; color: var(--vscode-foreground); margin: 0; padding: 0 16px 16px; }
  .brand-header {
    display: flex;
    align-items: center;
    gap: 12px;
    margin: 0 -16px 16px;
    padding: 16px;
    background: linear-gradient(135deg, ${BRAND.bgDark}, ${BRAND.bgDarkEnd});
  }
  .brand-header .brand-mark { flex: none; line-height: 0; }
  .brand-header .brand-title {
    font-family: ${BRAND.headlineFont};
    font-size: 1.3em;
    font-weight: 700;
    background: linear-gradient(90deg, var(--pulse-teal), var(--pulse-amber));
    -webkit-background-clip: text;
    background-clip: text;
    color: ${BRAND.textOnDark};
    -webkit-text-fill-color: transparent;
  }
  .brand-header .brand-subtitle { font-size: 0.8em; color: ${BRAND.subtleOnDark}; margin-top: 2px; }
  h2 { font-size: 1em; margin-top: 20px; opacity: 0.9; }
  h3 { font-size: 0.85em; margin-top: 12px; opacity: 0.75; font-weight: 600; }
  /* Numeric content (spend, tokens, table figures) stays on the sans stack
     with tabular figures - a serif's proportional old-style digits are
     exactly what slows down scanning a dense dashboard, so brand serif is
     confined to the header logotype above and nowhere else. */
  .value, .card .sub, table, .session-meta { font-variant-numeric: tabular-nums; }
  .cards { display: flex; gap: 12px; margin-bottom: 16px; flex-wrap: wrap; }
  .card { border: 1px solid var(--vscode-panel-border); border-radius: 6px; padding: 10px 14px; min-width: 160px; }
  .card .label { opacity: 0.7; font-size: 0.85em; }
  .card .value { font-size: 1.4em; font-weight: 700; }
  .card .sub { font-size: 0.8em; opacity: 0.7; }
  .recommendation {
    min-width: unset;
    margin-bottom: 12px;
    background: var(--vscode-textBlockQuote-background);
    border-left: 3px solid var(--pulse-teal);
  }
  .recommendation.sev-amber { border-left-color: #cca700; }
  .recommendation.sev-red { border-left-color: var(--vscode-errorForeground, #f14c4c); }
  .recommendation.sev-neutral { border-left-color: var(--vscode-panel-border); }
  /* Live/idle cards each carry their own --session-accent (a stable hash
     of sessionId, see sessionAccentColor) so simultaneous sessions in
     different projects are distinguishable from each other, not just from
     closed sessions - which stay on the plain neutral panel-border below. */
  .active-session { border-color: var(--session-accent, var(--pulse-teal)); border-width: 1.5px; max-width: 420px; }
  .idle-session { opacity: 0.85; }
  .active-session .label { display: flex; align-items: center; flex-wrap: wrap; gap: 6px; }
  .active-session .label .workspace-name { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 220px; }
  .active-session .label .session-id { opacity: 0.55; font-weight: normal; font-family: var(--vscode-editor-font-family, monospace); font-size: 0.9em; }
  .active-session .label .tool-badge { font-size: 0.78em; font-weight: normal; opacity: 0.8; padding: 1px 6px; border: 1px solid var(--vscode-panel-border); border-radius: 10px; }
  .model-table { margin-top: 8px; font-size: 0.9em; width: 100%; table-layout: fixed; }
  .model-table th, .model-table td { text-align: left; padding: 2px 8px 2px 0; border-bottom: none; }
  .model-table th { opacity: 0.6; font-weight: 600; }
  .model-table td:first-child, .model-table th:first-child { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .model-table tr.current-model td:first-child { font-weight: 600; }
  .model-table tr.total-row td { border-top: 1px solid var(--vscode-panel-border); font-weight: 600; opacity: 0.85; padding-top: 4px; }
  .model-pills { margin-top: 6px; display: flex; gap: 6px; flex-wrap: wrap; }
  .model-pill { font-size: 0.8em; opacity: 0.85; padding: 1px 6px; border: 1px solid var(--vscode-panel-border); border-radius: 10px; }
  .live-dot, .idle-dot {
    display: inline-block;
    width: 7px;
    height: 7px;
    border-radius: 50%;
    margin-right: 5px;
  }
  .live-dot {
    background: var(--session-accent, var(--pulse-teal));
    animation: pulse-dot 1.6s ease-in-out infinite;
  }
  .idle-dot {
    background: transparent;
    border: 1.5px solid var(--session-accent, var(--pulse-teal));
    opacity: 0.7;
  }
  @keyframes pulse-dot {
    0%, 100% { opacity: 1; }
    50% { opacity: 0.25; }
  }
  .insight {
    margin-top: 6px;
    font-size: 0.78em;
    opacity: 0.85;
    border-left: 2px solid var(--pulse-amber);
    padding-left: 6px;
  }
  .project-cards { display: flex; flex-direction: column; gap: 10px; margin-bottom: 16px; }
  .project-card { min-width: unset; border-color: var(--vscode-panel-border); }
  .project-card .label { font-weight: 600; opacity: 1; font-size: 0.95em; }
  .session-list { margin-top: 8px; display: flex; flex-direction: column; gap: 6px; }
  .session-row { border-top: 1px solid var(--vscode-panel-border); padding-top: 6px; }
  .session-row-main { display: flex; align-items: center; gap: 6px; font-size: 0.85em; }
  .session-id { opacity: 0.6; font-family: var(--vscode-editor-font-family, monospace); }
  .session-meta { opacity: 0.85; }
  table { border-collapse: collapse; width: 100%; }
  th, td { text-align: left; padding: 4px 8px; border-bottom: 1px solid var(--vscode-panel-border); font-size: 0.9em; }
  .hint, .empty { opacity: 0.8; font-style: italic; }
  .store-path { opacity: 0.6; font-size: 0.8em; word-break: break-all; }
  .recap { opacity: 0.9; }
  svg { display: block; }

  /* Zero-JS tabs (Live/Recent, Past) and, inside Past, the period and
     metric toggles: hidden radio inputs + label[for] buttons + sibling
     selectors to show/hide content. No script-src needed - default-src
     'none' stays exactly as strict as it already was. */
  .tab-input, .toggle-input { position: absolute; opacity: 0; pointer-events: none; }
  .tab-bar, .toggle-bar { display: flex; gap: 4px; margin-bottom: 12px; }
  .toggle-bar { margin-bottom: 8px; }
  .tab-label, .toggle-label {
    cursor: pointer;
    padding: 6px 12px;
    border-radius: 6px;
    font-size: 0.85em;
    opacity: 0.65;
    border: 1px solid transparent;
  }
  .tab-label { font-size: 0.9em; font-weight: 600; padding: 6px 14px; }
  .toggle-label { padding: 3px 10px; border: 1px solid var(--vscode-panel-border); }
  .tab-panel, .history-combo { display: none; }
  #tab-live:checked ~ .tab-panel-live,
  #tab-past:checked ~ .tab-panel-past { display: block; }
  #tab-live:checked ~ .tab-bar .tab-label[for="tab-live"],
  #tab-past:checked ~ .tab-bar .tab-label[for="tab-past"] {
    opacity: 1;
    background: var(--vscode-textBlockQuote-background);
    border-color: var(--pulse-teal);
  }
  #period-week:checked ~ .toggle-bar .toggle-label[for="period-week"],
  #period-month:checked ~ .toggle-bar .toggle-label[for="period-month"],
  #period-all:checked ~ .toggle-bar .toggle-label[for="period-all"],
  #metric-cost:checked ~ .toggle-bar .toggle-label[for="metric-cost"],
  #metric-tokens:checked ~ .toggle-bar .toggle-label[for="metric-tokens"],
  #metric-cache:checked ~ .toggle-bar .toggle-label[for="metric-cache"] {
    opacity: 1;
    background: var(--vscode-textBlockQuote-background);
    border-color: var(--pulse-amber);
  }
  #period-week:checked ~ #metric-cost:checked ~ .history-content .hc-week-cost,
  #period-week:checked ~ #metric-tokens:checked ~ .history-content .hc-week-tokens,
  #period-week:checked ~ #metric-cache:checked ~ .history-content .hc-week-cache,
  #period-month:checked ~ #metric-cost:checked ~ .history-content .hc-month-cost,
  #period-month:checked ~ #metric-tokens:checked ~ .history-content .hc-month-tokens,
  #period-month:checked ~ #metric-cache:checked ~ .history-content .hc-month-cache,
  #period-all:checked ~ #metric-cost:checked ~ .history-content .hc-all-cost,
  #period-all:checked ~ #metric-tokens:checked ~ .history-content .hc-all-tokens,
  #period-all:checked ~ #metric-cache:checked ~ .history-content .hc-all-cache {
    display: block;
  }

  /* Expandable session rows (<details>/<summary>, also native/scriptless). */
  .session-details-list { display: flex; flex-direction: column; gap: 4px; }
  .session-details { border-bottom: 1px solid var(--vscode-panel-border); padding: 4px 0; }
  .session-details summary { cursor: pointer; display: flex; gap: 8px; align-items: baseline; font-size: 0.85em; list-style: none; }
  .session-details summary::-webkit-details-marker { display: none; }
  .session-details summary::before { content: "\\25b8"; opacity: 0.6; margin-right: 2px; }
  .session-details[open] summary::before { content: "\\25be"; }
  .session-expanded { margin-top: 6px; min-width: unset; }
</style>
</head>
<body>
  <div class="brand-header">
    <div class="brand-mark">${brandMarkImg(brandMarkDataUri, 36)}</div>
    <div>
      <div class="brand-title">Vector AI Pulse</div>
      <div class="brand-subtitle">Local-only budget pacing, by iSattva</div>
    </div>
  </div>
${body}
</body>
</html>`;
}
