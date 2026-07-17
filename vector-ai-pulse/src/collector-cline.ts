import * as fs from "fs";
import * as path from "path";
import * as vscode from "vscode";
import { computeCost, ModelRate } from "./pricing";
import { ClineTaskTotals, Store } from "./store";

const CLINE_EXTENSION_STORAGE_FOLDER = "saoudrizwan.claude-dev";

// Cline's globalStorage folder is a sibling of our own - both live under the
// same VS Code product's <user-data-dir>/User/globalStorage/, whatever that
// product happens to be (stable, Insiders, a portable install, or a custom
// --user-data-dir). Deriving it this way means we follow the user's actual
// install instead of guessing a hardcoded OS-specific path that would break
// under Insiders or portable mode.
function clineStorageDir(context: vscode.ExtensionContext): string {
  return path.join(path.dirname(context.globalStorageUri.fsPath), CLINE_EXTENSION_STORAGE_FOLDER);
}

function taskHistoryPath(context: vscode.ExtensionContext): string {
  return path.join(clineStorageDir(context), "state", "taskHistory.json");
}

export function clineDetected(context: vscode.ExtensionContext): boolean {
  return fs.existsSync(taskHistoryPath(context));
}

interface ClineHistoryItem {
  id?: string;
  ts?: number;
  task?: string;
  model?: string;
  tokensIn?: number;
  tokensOut?: number;
  cacheWrites?: number;
  cacheReads?: number;
  totalCost?: number;
}

// taskHistory.json is rewritten wholesale on every update (not appended to),
// and each entry carries CUMULATIVE totals for that task rather than a
// per-message delta - so unlike Claude Code's transcripts, we can't just
// replay new lines. We diff each task's totals against store.clineTaskTotals
// and record only the positive delta since the last pass.
export function processClineHistory(store: Store, pricingConfig: Record<string, ModelRate>, context: vscode.ExtensionContext): number {
  const filePath = taskHistoryPath(context);
  let stat: fs.Stats;
  try {
    stat = fs.statSync(filePath);
  } catch {
    return 0;
  }

  // Skip re-parsing a snapshot we've already fully processed - reuses the
  // fileOffsets map as a generic "last seen marker" store (mtimeMs here,
  // byte offset for JSONL tools), since both are just numbers keyed by path.
  if (store.fileOffsets[filePath] === stat.mtimeMs) return 0;

  let items: ClineHistoryItem[];
  try {
    const raw = fs.readFileSync(filePath, "utf8");
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return 0;
    items = parsed;
  } catch {
    return 0; // still being written, or corrupt - try again next pass
  }

  const workspace = vscode.workspace.workspaceFolders?.[0]?.name ?? "unknown";
  let found = 0;

  for (const item of items) {
    if (!item.id) continue;

    const current: ClineTaskTotals = {
      tokensIn: item.tokensIn ?? 0,
      tokensOut: item.tokensOut ?? 0,
      cacheWrites: item.cacheWrites ?? 0,
      cacheReads: item.cacheReads ?? 0,
      costUsd: item.totalCost ?? 0,
    };
    const prior = store.clineTaskTotals[item.id];

    const deltaInputTokens = Math.max(0, current.tokensIn - (prior?.tokensIn ?? 0));
    const deltaOutputTokens = Math.max(0, current.tokensOut - (prior?.tokensOut ?? 0));
    const deltaCacheWrites = Math.max(0, current.cacheWrites - (prior?.cacheWrites ?? 0));
    const deltaCacheReads = Math.max(0, current.cacheReads - (prior?.cacheReads ?? 0));
    const deltaCostUsd = Math.max(0, current.costUsd - (prior?.costUsd ?? 0));

    store.clineTaskTotals[item.id] = current;

    if (deltaInputTokens === 0 && deltaOutputTokens === 0 && deltaCacheWrites === 0 && deltaCacheReads === 0 && deltaCostUsd === 0) continue;

    const model = item.model ?? "unknown";
    store.records.push({
      timestamp: typeof item.ts === "number" ? new Date(item.ts).toISOString() : new Date().toISOString(),
      tool: "cline",
      model,
      workspace,
      sessionId: item.id,
      inputTokens: deltaInputTokens,
      outputTokens: deltaOutputTokens,
      cacheReadTokens: deltaCacheReads,
      cacheCreateTokens: deltaCacheWrites,
      // Cline already reports totalCost itself; computeCost is only a
      // fallback for the (rare) case totalCost is absent from the entry.
      costUsd: item.totalCost !== undefined ? deltaCostUsd : computeCost(
        { inputTokens: deltaInputTokens, outputTokens: deltaOutputTokens, cacheReadTokens: deltaCacheReads, cacheCreateTokens: deltaCacheWrites },
        model,
        pricingConfig
      ),
    });
    found++;
  }

  store.fileOffsets[filePath] = stat.mtimeMs;
  return found;
}

export function startClineWatcher(
  store: Store,
  pricingConfig: () => Record<string, ModelRate>,
  context: vscode.ExtensionContext,
  onChange: (found: number) => void
): vscode.Disposable {
  if (!clineDetected(context)) {
    return { dispose: () => {} };
  }

  const dir = path.join(clineStorageDir(context), "state");
  const watcher = vscode.workspace.createFileSystemWatcher(new vscode.RelativePattern(vscode.Uri.file(dir), "taskHistory.json"), true, false, true);

  watcher.onDidChange(() => {
    const found = processClineHistory(store, pricingConfig(), context);
    if (found > 0) onChange(found);
  });
  return watcher;
}
