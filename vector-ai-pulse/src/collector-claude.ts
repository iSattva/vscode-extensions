import * as os from "os";
import * as path from "path";
import * as fs from "fs";
import * as vscode from "vscode";
import { computeCost, ModelRate } from "./pricing";
import { readNewLines, walk } from "./collector-shared";
import { Store } from "./store";

export const claudeProjectsDir = path.join(os.homedir(), ".claude", "projects");

export function claudeCodeDetected(): boolean {
  return fs.existsSync(claudeProjectsDir);
}

export function findSessionFiles(): string[] {
  const out: string[] = [];
  walk(claudeProjectsDir, out, (name) => name.endsWith(".jsonl"));
  return out;
}

// A subagent's own transcript lives at
// <workspace-dir>/<parentSessionId>/subagents/agent-*.jsonl, one level
// deeper than a normal top-level session file (<workspace-dir>/<sessionId>.jsonl),
// and its records carry the *parent's* sessionId - so its usage already
// merges into the parent's session card via aggregateSessions grouping by
// sessionId. Without this, the naive "immediate parent directory" workspace
// derivation would read the literal "subagents" folder name as the project
// name for those records instead of the real one two levels up.
function deriveWorkspace(filePath: string): string {
  const parentDir = path.dirname(filePath);
  if (path.basename(parentDir) === "subagents") {
    return path.basename(path.dirname(path.dirname(parentDir)));
  }
  return path.basename(parentDir);
}

// Returns the count of new usage records found; mutates `store` in place
// but does not save it - callers batch one save() per pass (historical
// scan or a single watcher event) to keep disk churn low during streaming.
export function processFile(store: Store, pricingConfig: Record<string, ModelRate>, filePath: string): number {
  const { lines } = readNewLines(store.fileOffsets, filePath);
  const workspace = deriveWorkspace(filePath);
  const sessionIdFromFile = path.basename(filePath, ".jsonl");
  let found = 0;

  for (const line of lines) {
    let entry: any;
    try {
      entry = JSON.parse(line);
    } catch {
      continue; // one malformed line shouldn't stop ingestion of the rest of the file
    }

    if (entry?.type !== "assistant" || !entry.message?.usage) continue;

    const messageId: string | undefined = entry.message.id;
    if (messageId) {
      if (store.seenMessageIds.includes(messageId)) continue;
      store.seenMessageIds.push(messageId);
    }

    const usage = entry.message.usage;
    const inputTokens = usage.input_tokens ?? 0;
    const outputTokens = usage.output_tokens ?? 0;
    const cacheReadTokens = usage.cache_read_input_tokens ?? 0;
    const cacheCreateTokens = usage.cache_creation_input_tokens ?? 0;
    const model = entry.message.model ?? "unknown";
    const timestamp =
      typeof entry.timestamp === "string" && !Number.isNaN(Date.parse(entry.timestamp))
        ? entry.timestamp
        : new Date().toISOString();

    store.records.push({
      timestamp,
      tool: "claude-code",
      model,
      workspace,
      sessionId: entry.sessionId ?? sessionIdFromFile,
      inputTokens,
      outputTokens,
      cacheReadTokens,
      cacheCreateTokens,
      costUsd: computeCost({ inputTokens, outputTokens, cacheReadTokens, cacheCreateTokens }, model, pricingConfig),
    });
    found++;
  }

  return found;
}

export async function scanHistorical(
  store: Store,
  pricingConfig: Record<string, ModelRate>,
  onProgress?: (done: number, total: number) => void
): Promise<number> {
  const files = findSessionFiles();
  let total = 0;
  for (let i = 0; i < files.length; i++) {
    total += processFile(store, pricingConfig, files[i]);
    onProgress?.(i + 1, files.length);
  }
  return total;
}

export function startWatcher(
  store: Store,
  pricingConfig: () => Record<string, ModelRate>,
  onChange: (found: number) => void
): vscode.Disposable {
  if (!claudeCodeDetected()) {
    return { dispose: () => {} };
  }

  const pattern = new vscode.RelativePattern(vscode.Uri.file(claudeProjectsDir), "**/*.jsonl");
  const watcher = vscode.workspace.createFileSystemWatcher(pattern, false, false, true);

  const handle = (uri: vscode.Uri) => {
    const found = processFile(store, pricingConfig(), uri.fsPath);
    if (found > 0) onChange(found);
  };

  watcher.onDidCreate(handle);
  watcher.onDidChange(handle);
  return watcher;
}
