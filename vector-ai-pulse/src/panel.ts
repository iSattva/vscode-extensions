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
};

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

function dailyTrend(records: UsageRecord[], days: number): { date: string; costUsd: number }[] {
  const byDate = new Map<string, number>();
  for (const r of records) {
    const d = r.timestamp.slice(0, 10); // YYYY-MM-DD
    byDate.set(d, (byDate.get(d) ?? 0) + r.costUsd);
  }
  const out: { date: string; costUsd: number }[] = [];
  const now = new Date();
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - i);
    const key = d.toISOString().slice(0, 10);
    out.push({ date: key, costUsd: byDate.get(key) ?? 0 });
  }
  return out;
}

interface SessionAgg {
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
}

function aggregateSessions(records: UsageRecord[]): Map<string, SessionAgg> {
  const map = new Map<string, SessionAgg>();
  for (const r of records) {
    const ts = Date.parse(r.timestamp);
    const existing = map.get(r.sessionId);
    if (existing) {
      existing.costUsd += r.costUsd;
      existing.totalTokens += tokenTotal(r);
      existing.inputTokens += r.inputTokens;
      existing.cacheReadTokens += r.cacheReadTokens;
      existing.firstAt = Math.min(existing.firstAt, ts);
      existing.lastAt = Math.max(existing.lastAt, ts);
      existing.model = r.model; // last-seen model for the session
    } else {
      map.set(r.sessionId, {
        sessionId: r.sessionId,
        tool: r.tool,
        model: r.model,
        workspace: r.workspace,
        costUsd: r.costUsd,
        totalTokens: tokenTotal(r),
        inputTokens: r.inputTokens,
        cacheReadTokens: r.cacheReadTokens,
        firstAt: ts,
        lastAt: ts,
      });
    }
  }
  return map;
}

function topSessions(records: UsageRecord[], n: number): SessionAgg[] {
  return [...aggregateSessions(records).values()].sort((a, b) => b.costUsd - a.costUsd).slice(0, n);
}

function isActiveSession(s: SessionAgg, now: number, windowMinutes: number): boolean {
  return s.tool === "claude-code" && now - s.lastAt <= windowMinutes * 60_000;
}

function activeSessions(records: UsageRecord[], windowMinutes: number, now: number): SessionAgg[] {
  return [...aggregateSessions(records).values()].filter((s) => isActiveSession(s, now, windowMinutes)).sort((a, b) => b.lastAt - a.lastAt);
}

function medianSessionCost(records: UsageRecord[]): number {
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
function sessionInsight(s: SessionAgg, medianCost: number): string | null {
  if (s.tool !== "claude-code") return null;
  if (medianCost > 0 && s.costUsd > Math.max(3 * medianCost, 5)) {
    return `One of your priciest sessions (~${(s.costUsd / medianCost).toFixed(1)}x your typical session) - large accumulated context across many turns is the likely driver. Consider splitting unrelated work into fresh sessions.`;
  }
  if (/opus/i.test(s.model) && medianCost > 0 && s.costUsd < medianCost * 0.5) {
    return "Premium model used for a below-typical-cost session - a lighter model may have been enough.";
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

function buildTrendSvg(trend: { date: string; costUsd: number }[]): string {
  const width = 600;
  const height = 140;
  const padding = 20;
  const max = Math.max(1e-9, ...trend.map((d) => d.costUsd));
  const slot = (width - padding * 2) / trend.length;
  const barWidth = Math.max(1, slot - 2);

  const bars = trend
    .map((d, i) => {
      const barHeight = (d.costUsd / max) * (height - padding * 2);
      const x = padding + i * slot;
      const y = height - padding - barHeight;
      return `<rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${barWidth.toFixed(1)}" height="${Math.max(0, barHeight).toFixed(1)}" fill="url(#pulseBarGrad)"><title>${escapeHtml(d.date)}: ${fmtUsd(d.costUsd)}</title></rect>`;
    })
    .join("");

  const labels = trend
    .map((d, i) => i)
    .filter((i) => i % 5 === 0)
    .map((i) => {
      const x = padding + i * slot;
      return `<text x="${x.toFixed(1)}" y="${height - 4}" font-size="9" style="fill:var(--vscode-descriptionForeground, #999)">${escapeHtml(trend[i].date.slice(5))}</text>`;
    })
    .join("");

  return `<svg viewBox="0 0 ${width} ${height}" width="100%" height="${height}" role="img" aria-label="30-day cost trend">
    <defs>
      <linearGradient id="pulseBarGrad" x1="0%" y1="100%" x2="0%" y2="0%">
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

function buildTopSessionsTable(sessions: SessionAgg[]): string {
  if (sessions.length === 0) return `<p class="empty">No sessions yet.</p>`;
  return `<table>
    <tr><th>Session</th><th>Tool</th><th>Model</th><th>Workspace</th><th>Cost</th><th>Tokens</th></tr>
    ${sessions
      .map(
        (s) =>
          `<tr><td>${escapeHtml(s.sessionId.slice(0, 8))}</td><td>${escapeHtml(s.tool)}</td><td>${escapeHtml(s.model)}</td><td>${escapeHtml(s.workspace)}</td><td>${fmtUsd(s.costUsd)}</td><td>${fmtTokens(s.totalTokens)}</td></tr>`
      )
      .join("")}
  </table>`;
}

function buildActiveSessionsHtml(sessions: SessionAgg[], now: number, medianCost: number): string {
  if (sessions.length === 0) return "";
  return `<h2>Active now</h2>
  <div class="cards">
    ${sessions
      .map((s) => {
        const insight = sessionInsight(s, medianCost);
        return `<div class="card active-session">
          <div class="label"><span class="live-dot"></span>${escapeHtml(s.workspace)}</div>
          <div class="value">${fmtUsd(s.costUsd)}</div>
          <div class="sub">${escapeHtml(s.model)} - ${fmtTokens(s.totalTokens)} tok - running ${fmtDuration(now - s.firstAt)}</div>
          ${insight ? `<div class="insight">${escapeHtml(insight)}</div>` : ""}
        </div>`;
      })
      .join("")}
  </div>`;
}

function buildProjectCardsHtml(records: UsageRecord[], now: number, activeWindowMinutes: number, medianCost: number): string {
  const groups = groupSessionsByWorkspace(records, 8, 5);
  if (groups.length === 0) return "";

  return `<h2>By project</h2>
  <div class="project-cards">
    ${groups
      .map((g) => {
        const totalCost = g.sessions.reduce((s, x) => s + x.costUsd, 0);
        const rows = g.sessions
          .map((s) => {
            const active = isActiveSession(s, now, activeWindowMinutes);
            const insight = sessionInsight(s, medianCost);
            const duration = fmtDuration((active ? now : s.lastAt) - s.firstAt);
            return `<div class="session-row">
              <div class="session-row-main">
                ${active ? `<span class="live-dot"></span>` : ""}
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

export interface PanelInput {
  records: UsageRecord[];
  budget: Budget;
  storePath: string;
  claudeDetected: boolean;
  brandMarkDataUri: string;
  trendDays: number;
  activeSessionWindowMinutes: number;
}

export function renderPanelHtml(input: PanelInput): string {
  const { records, budget, storePath, claudeDetected, brandMarkDataUri, trendDays, activeSessionWindowMinutes } = input;
  const now = new Date();
  const { daily, monthly } = computePace(records, budget, now);
  const { dayStart, monthStart } = periodBounds(now, budget.periodStartDay);
  const dailyTokens = records.filter((r) => new Date(r.timestamp) >= dayStart).reduce((s, r) => s + tokenTotal(r), 0);
  const monthlyTokens = records.filter((r) => new Date(r.timestamp) >= monthStart).reduce((s, r) => s + tokenTotal(r), 0);
  const active = activeSessions(records, activeSessionWindowMinutes, now.getTime());
  const medianCost = medianSessionCost(records);

  const emptyMessage = claudeDetected
    ? "No usage recorded yet. Claude Code sessions are picked up automatically as you use them - or log a manual entry for other tools."
    : "No supported tools detected on this machine (Claude Code wasn't found at ~/.claude/projects). Use <b>Vector AI Pulse: Log Manual Entry...</b> to track usage from other tools.";

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

  return shellHtml(
    `
    ${buildActiveSessionsHtml(active, now.getTime(), medianCost)}
    ${budgetPrompt}
    <div class="card recommendation sev-${recommendation.severity}">${escapeHtml(recommendation.text)}</div>
    <div class="cards">
      <div class="card">
        <div class="label">Today</div>
        <div class="value">${fmtUsd(daily.spend)}${daily.budget !== null ? ` / ${fmtUsd(daily.budget)}` : ""}</div>
        <div class="sub">${fmtTokens(dailyTokens)} tokens${daily.projected !== null ? ` - projected ${fmtUsd(daily.projected)}` : ""}</div>
      </div>
      <div class="card">
        <div class="label">This period</div>
        <div class="value">${fmtUsd(monthly.spend)}${monthly.budget !== null ? ` / ${fmtUsd(monthly.budget)}` : ""}</div>
        <div class="sub">${fmtTokens(monthlyTokens)} tokens${monthly.projected !== null ? ` - projected ${fmtUsd(monthly.projected)}, ${daysLeftInMonth}d left` : ""}</div>
      </div>
    </div>

    ${buildProjectCardsHtml(records, now.getTime(), activeSessionWindowMinutes, medianCost)}

    <h2>Spend by model over time</h2>
    ${buildModelSpendOverTimeTable(modelSpendOverTime(records, now, dayStart))}

    <h2>Last ${trendDays} days</h2>
    ${buildTrendSvg(dailyTrend(records, trendDays))}

    <h2>By tool (all time)</h2>
    ${buildBreakdownTable(groupByKey(records, "tool"), "Tool")}

    <h2>By model (all time)</h2>
    ${buildBreakdownTable(groupByKey(records, "model"), "Model")}

    <h2>Top 5 most expensive sessions (all time)</h2>
    ${buildTopSessionsTable(topSessions(records, 5))}

    <h2>Your data</h2>
    <p>${records.length} records, stored locally, human-readable, never transmitted:</p>
    <p class="store-path">${escapeHtml(storePath)}</p>
  `,
    brandMarkDataUri
  );
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
  body { font-family: var(--vscode-font-family); color: var(--vscode-foreground); margin: 0; padding: 0 16px 16px; }
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
    font-size: 1.25em;
    font-weight: 700;
    background: linear-gradient(90deg, var(--pulse-teal), var(--pulse-amber));
    -webkit-background-clip: text;
    background-clip: text;
    color: ${BRAND.textOnDark};
    -webkit-text-fill-color: transparent;
  }
  .brand-header .brand-subtitle { font-size: 0.8em; color: ${BRAND.subtleOnDark}; margin-top: 2px; }
  h2 { font-size: 1em; margin-top: 20px; opacity: 0.9; }
  .cards { display: flex; gap: 12px; margin-bottom: 16px; }
  .card { border: 1px solid var(--vscode-panel-border); border-radius: 6px; padding: 10px 14px; min-width: 160px; }
  .card .label { opacity: 0.7; font-size: 0.85em; }
  .card .value { font-size: 1.4em; font-weight: 600; }
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
  .active-session { border-color: var(--pulse-teal); }
  .live-dot {
    display: inline-block;
    width: 7px;
    height: 7px;
    border-radius: 50%;
    background: var(--pulse-teal);
    margin-right: 5px;
    animation: pulse-dot 1.6s ease-in-out infinite;
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
  .project-card { min-width: unset; }
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
  svg { display: block; }
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
