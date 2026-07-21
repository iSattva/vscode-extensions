import * as fs from "fs";
import * as os from "os";
import * as path from "path";

export interface UsageRecord {
  timestamp: string;
  tool: string;
  model: string;
  workspace: string;
  sessionId: string;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheCreateTokens: number;
  costUsd: number;
}

export interface Budget {
  dailyUsd: number | null;
  monthlyUsd: number | null;
  periodStartDay: number;
}

export interface NudgeLogEntry {
  nudgeType: string;
  firedAt: string;
  action: "accepted" | "dismissed" | "ignored";
  costDeltaObserved: number;
}

// Cline's taskHistory.json is a rewritten-in-place snapshot (cumulative
// per-task totals), not an append-only log like Claude Code's transcripts,
// so a collector must diff each task's totals against the last-seen values
// here rather than replay lines - this is that per-task "last seen" cursor.
export interface ClineTaskTotals {
  tokensIn: number;
  tokensOut: number;
  cacheWrites: number;
  cacheReads: number;
  costUsd: number;
}

// Codex rollout JSONL lines report token_count.info.last_token_usage as a
// ready-made per-turn delta - but some builds/older lines only carry
// total_token_usage (cumulative), so this tracks the running cumulative
// baseline per session file to diff against when last_token_usage is
// absent, plus the most recently seen model (set by turn_context lines,
// which may have been consumed in an earlier pass and not appear again).
export interface CodexFileState {
  model: string;
  workspace: string;
  cumulativeInputTokens: number;
  cumulativeCachedInputTokens: number;
  cumulativeOutputTokens: number;
  cumulativeReasoningTokens: number;
}

export interface Store {
  version: number;
  records: UsageRecord[];
  seenMessageIds: string[];
  fileOffsets: Record<string, number>;
  clineTaskTotals: Record<string, ClineTaskTotals>;
  codexFileState: Record<string, CodexFileState>;
  budget: Budget;
  nudgeLog: NudgeLogEntry[];
  promptedBudgetSetup: boolean;
}

const STORE_VERSION = 1;
const MAX_SEEN_IDS = 50_000;

export const storeDir = path.join(os.homedir(), ".vector-ai-pulse");
export const storePath = path.join(storeDir, "store.json");

export function storeFileExists(): boolean {
  return fs.existsSync(storePath);
}

export function defaultStore(): Store {
  return {
    version: STORE_VERSION,
    records: [],
    seenMessageIds: [],
    fileOffsets: {},
    clineTaskTotals: {},
    codexFileState: {},
    budget: { dailyUsd: null, monthlyUsd: null, periodStartDay: 1 },
    nudgeLog: [],
    promptedBudgetSetup: false,
  };
}

function isStoreShaped(value: unknown): value is Store {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  return Array.isArray(v.records) && Array.isArray(v.seenMessageIds) && typeof v.fileOffsets === "object";
}

// Older/corrupt stores reset to defaults rather than throwing - this
// extension's whole trust pitch depends on never blocking on its own data.
export function loadStore(): Store {
  try {
    const raw = fs.readFileSync(storePath, "utf8");
    const parsed: unknown = JSON.parse(raw);
    if (!isStoreShaped(parsed)) return defaultStore();
    const fallback = defaultStore();
    return {
      version: STORE_VERSION,
      records: parsed.records,
      seenMessageIds: parsed.seenMessageIds,
      fileOffsets: parsed.fileOffsets,
      clineTaskTotals: typeof (parsed as any).clineTaskTotals === "object" && (parsed as any).clineTaskTotals !== null ? (parsed as any).clineTaskTotals : {},
      codexFileState: typeof (parsed as any).codexFileState === "object" && (parsed as any).codexFileState !== null ? (parsed as any).codexFileState : {},
      budget: { ...fallback.budget, ...(parsed.budget ?? {}) },
      nudgeLog: Array.isArray(parsed.nudgeLog) ? parsed.nudgeLog : [],
      promptedBudgetSetup: Boolean(parsed.promptedBudgetSetup),
    };
  } catch {
    return defaultStore();
  }
}

function recordKey(r: UsageRecord): string {
  return `${r.tool}|${r.sessionId}|${r.timestamp}|${r.inputTokens}|${r.outputTokens}|${r.cacheReadTokens}|${r.cacheCreateTokens}|${r.costUsd}`;
}

// Cumulative counters only ever grow within one file/task's lifetime, so
// taking the max per field always converges toward the true total no matter
// which side (disk vs. this window's memory) has seen more lines so far.
function mergeNumericRecord(
  a: Record<string, number> | undefined,
  b: Record<string, number> | undefined
): Record<string, number> | undefined {
  if (!a) return b;
  if (!b) return a;
  const merged: Record<string, number> = { ...a };
  for (const key of Object.keys(b)) {
    merged[key] = Math.max(merged[key] ?? 0, b[key] ?? 0);
  }
  return merged;
}

// Every VS Code window running this extension holds its own in-memory Store
// loaded at its own startup, and each one's watchers/scanners call saveStore
// independently and concurrently. Without merging, whichever window saves
// last wins and silently erases every accumulated record/offset/state entry
// the other windows had written since - this is what caused Codex (and any
// other tool's) freshly-ingested records to vanish after one window's next
// unrelated save. Every accumulating collection is merged against what's
// currently on disk instead of blindly overwritten; only version/budget/
// promptedBudgetSetup (singleton settings, changed intentionally by user
// action in one window at a time, not by background collectors) stay
// last-write-wins as before.
function mergeWithDisk(store: Store): Store {
  let disk: Store;
  try {
    const raw = fs.readFileSync(storePath, "utf8");
    const parsed: unknown = JSON.parse(raw);
    if (!isStoreShaped(parsed)) return store;
    disk = parsed as Store;
  } catch {
    return store;
  }

  const recordMap = new Map<string, UsageRecord>();
  for (const r of disk.records ?? []) recordMap.set(recordKey(r), r);
  for (const r of store.records) recordMap.set(recordKey(r), r);

  const fileOffsets: Record<string, number> = { ...(disk.fileOffsets ?? {}) };
  for (const [key, value] of Object.entries(store.fileOffsets)) {
    fileOffsets[key] = Math.max(fileOffsets[key] ?? 0, value);
  }

  const clineTaskTotals: Record<string, ClineTaskTotals> = { ...(disk.clineTaskTotals ?? {}) };
  for (const [key, value] of Object.entries(store.clineTaskTotals)) {
    const existingCline = clineTaskTotals[key] as unknown as Record<string, number> | undefined;
    clineTaskTotals[key] = (mergeNumericRecord(existingCline, value as unknown as Record<string, number>) as unknown as ClineTaskTotals) ?? value;
  }

  const codexFileState: Record<string, CodexFileState> = { ...(disk.codexFileState ?? {}) };
  for (const [key, value] of Object.entries(store.codexFileState)) {
    const existing = codexFileState[key];
    const existingCodex = existing as unknown as Record<string, number> | undefined;
    const merged = mergeNumericRecord(existingCodex, value as unknown as Record<string, number>) as unknown as CodexFileState | undefined;
    if (merged) {
      // Attribute the string fields (model, workspace) to whichever side has
      // advanced furthest (larger cumulative input), since that side has
      // seen the most recent lines. mergeNumericRecord treats every field as
      // a number, so these two get garbled by it above and must be
      // re-derived here from whichever source object actually won.
      const existingTotal = existing ? existing.cumulativeInputTokens : -1;
      const winner = value.cumulativeInputTokens >= existingTotal ? value : existing!;
      merged.model = winner.model;
      merged.workspace = winner.workspace;
      codexFileState[key] = merged;
    }
  }

  const nudgeLog = [...(disk.nudgeLog ?? [])];
  const seenNudges = new Set(nudgeLog.map((n) => `${n.nudgeType}|${n.firedAt}`));
  for (const n of store.nudgeLog) {
    const key = `${n.nudgeType}|${n.firedAt}`;
    if (!seenNudges.has(key)) {
      seenNudges.add(key);
      nudgeLog.push(n);
    }
  }

  const seenMessageIds = Array.from(new Set([...(disk.seenMessageIds ?? []), ...store.seenMessageIds]));

  store.records = Array.from(recordMap.values());
  store.fileOffsets = fileOffsets;
  store.clineTaskTotals = clineTaskTotals;
  store.codexFileState = codexFileState;
  store.nudgeLog = nudgeLog;
  store.seenMessageIds = seenMessageIds;
  return store;
}

export interface SaveStoreOptions {
  // Set false only for an explicit user-initiated reset, where the whole
  // point is to discard whatever's on disk rather than merge with it.
  merge?: boolean;
}

export function saveStore(store: Store, options: SaveStoreOptions = {}): void {
  if (options.merge ?? true) mergeWithDisk(store);

  if (store.seenMessageIds.length > MAX_SEEN_IDS) {
    store.seenMessageIds = store.seenMessageIds.slice(store.seenMessageIds.length - MAX_SEEN_IDS);
  }
  fs.mkdirSync(storeDir, { recursive: true });
  const tmpPath = `${storePath}.tmp`;
  fs.writeFileSync(tmpPath, JSON.stringify(store, null, 2), "utf8");
  fs.renameSync(tmpPath, storePath);
}

export function addRecord(store: Store, record: UsageRecord): void {
  store.records.push(record);
}

export function periodBounds(now: Date, periodStartDay: number): { dayStart: Date; monthStart: Date } {
  const dayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  let monthStart = new Date(now.getFullYear(), now.getMonth(), periodStartDay);
  if (monthStart > now) {
    monthStart = new Date(now.getFullYear(), now.getMonth() - 1, periodStartDay);
  }
  return { dayStart, monthStart };
}
