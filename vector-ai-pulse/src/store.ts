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

export interface Store {
  version: number;
  records: UsageRecord[];
  seenMessageIds: string[];
  fileOffsets: Record<string, number>;
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
      budget: { ...fallback.budget, ...(parsed.budget ?? {}) },
      nudgeLog: Array.isArray(parsed.nudgeLog) ? parsed.nudgeLog : [],
      promptedBudgetSetup: Boolean(parsed.promptedBudgetSetup),
    };
  } catch {
    return defaultStore();
  }
}

export function saveStore(store: Store): void {
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
