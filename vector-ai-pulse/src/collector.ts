import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import * as vscode from "vscode";
import { computeCost, ModelRate } from "./pricing";
import { Store } from "./store";

export const claudeProjectsDir = path.join(os.homedir(), ".claude", "projects");

export function claudeCodeDetected(): boolean {
  return fs.existsSync(claudeProjectsDir);
}

function walk(dir: string, out: string[]): void {
  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else if (entry.isFile() && entry.name.endsWith(".jsonl")) out.push(full);
  }
}

export function findSessionFiles(): string[] {
  const out: string[] = [];
  walk(claudeProjectsDir, out);
  return out;
}

// Splits on raw bytes (0x0a), not the decoded string, so multi-byte UTF-8
// content never throws off the byte offset we persist - '\n' can't appear
// as a continuation byte in valid UTF-8, so this is safe.
// Returns the count of new usage records found; mutates `store` in place
// but does not save it - callers batch one save() per pass (historical
// scan or a single watcher event) to keep disk churn low during streaming.
export function processFile(store: Store, pricingConfig: Record<string, ModelRate>, filePath: string): number {
  const priorOffset = store.fileOffsets[filePath] ?? 0;
  let stat: fs.Stats;
  try {
    stat = fs.statSync(filePath);
  } catch {
    return 0;
  }

  // File truncated or rotated out from under us - restart from the top;
  // seenMessageIds dedup prevents double-counting anything already recorded.
  const start = priorOffset > stat.size ? 0 : priorOffset;
  if (start >= stat.size) return 0;

  const fd = fs.openSync(filePath, "r");
  const length = stat.size - start;
  const buf = Buffer.alloc(length);
  fs.readSync(fd, buf, 0, length, start);
  fs.closeSync(fd);

  const workspace = path.basename(path.dirname(filePath));
  const sessionIdFromFile = path.basename(filePath, ".jsonl");

  let pos = 0;
  let consumed = 0;
  let found = 0;

  while (true) {
    const nl = buf.indexOf(0x0a, pos);
    if (nl === -1) break; // partial trailing line (still being written) - held back for next pass
    const line = buf.toString("utf8", pos, nl).trim();
    pos = nl + 1;
    consumed = pos;
    if (!line) continue;

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

  store.fileOffsets[filePath] = start + consumed;
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
