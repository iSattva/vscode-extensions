import * as os from "os";
import * as path from "path";
import * as fs from "fs";
import * as vscode from "vscode";
import { computeCost, ModelRate } from "./pricing";
import { readNewLines, walk } from "./collector-shared";
import { CodexFileState, Store } from "./store";

// $CODEX_HOME defaults to ~/.codex; Codex CLI writes one JSONL transcript
// per session under sessions/<year>/<month>/<day>/rollout-*.jsonl.
export function codexSessionsDir(): string {
  const codexHome = process.env.CODEX_HOME || path.join(os.homedir(), ".codex");
  return path.join(codexHome, "sessions");
}

export function codexDetected(): boolean {
  return fs.existsSync(codexSessionsDir());
}

export function findCodexSessionFiles(): string[] {
  const out: string[] = [];
  walk(codexSessionsDir(), out, (name) => name.startsWith("rollout-") && name.endsWith(".jsonl"));
  return out;
}

interface TokenUsage {
  input_tokens?: number;
  cached_input_tokens?: number;
  output_tokens?: number;
  reasoning_output_tokens?: number;
}

function defaultFileState(): CodexFileState {
  return {
    model: "unknown",
    workspace: "unknown",
    cumulativeInputTokens: 0,
    cumulativeCachedInputTokens: 0,
    cumulativeOutputTokens: 0,
    cumulativeReasoningTokens: 0,
  };
}

// The exact rollout JSONL schema isn't officially documented by OpenAI and
// has changed shape across Codex CLI versions - this parsing is best-effort,
// reverse-engineered (cross-checked against community tooling), and should
// degrade to "no record" rather than throw on anything unrecognized.
function extractModel(entry: any): string | undefined {
  const model = entry?.payload?.model ?? entry?.model;
  return typeof model === "string" ? model : undefined;
}

// session_meta and turn_context lines carry the session's actual working
// directory - this is the project the Codex session ran in, which is
// unrelated to whatever workspace the VS Code window hosting this panel
// happens to have open. Split on both separators since a rollout file can
// in principle be produced on either Windows or POSIX.
function extractWorkspaceName(entry: any): string | undefined {
  const cwd = entry?.payload?.cwd;
  if (typeof cwd !== "string" || !cwd) return undefined;
  const parts = cwd.split(/[\\/]/).filter(Boolean);
  return parts.length > 0 ? parts[parts.length - 1] : undefined;
}

function extractTokenCountInfo(entry: any): { last?: TokenUsage; total?: TokenUsage } | undefined {
  const payload = entry?.payload?.type === "token_count" ? entry.payload : entry?.type === "token_count" ? entry : undefined;
  if (!payload) return undefined;
  const info = payload.info ?? payload;
  return { last: info?.last_token_usage, total: info?.total_token_usage };
}

// Returns the count of new usage records found; mutates `store` in place
// but does not save it - callers batch one save() per pass, matching the
// Claude Code and Cline collectors.
export function processCodexFile(store: Store, pricingConfig: Record<string, ModelRate>, filePath: string): number {
  const { lines } = readNewLines(store.fileOffsets, filePath);
  if (lines.length === 0) return 0;

  const state = store.codexFileState[filePath] ?? defaultFileState();
  const sessionId = path.basename(filePath, ".jsonl");
  let found = 0;

  for (const line of lines) {
    let entry: any;
    try {
      entry = JSON.parse(line);
    } catch {
      continue;
    }

    const model = extractModel(entry);
    if (model) state.model = model;

    const workspaceName = extractWorkspaceName(entry);
    if (workspaceName) state.workspace = workspaceName;

    const tokenCount = extractTokenCountInfo(entry);
    if (!tokenCount) continue;

    let deltaInput: number;
    let deltaCachedInput: number;
    let deltaOutput: number;
    let deltaReasoning: number;

    if (tokenCount.last) {
      deltaInput = tokenCount.last.input_tokens ?? 0;
      deltaCachedInput = tokenCount.last.cached_input_tokens ?? 0;
      deltaOutput = tokenCount.last.output_tokens ?? 0;
      deltaReasoning = tokenCount.last.reasoning_output_tokens ?? 0;
    } else if (tokenCount.total) {
      deltaInput = Math.max(0, (tokenCount.total.input_tokens ?? 0) - state.cumulativeInputTokens);
      deltaCachedInput = Math.max(0, (tokenCount.total.cached_input_tokens ?? 0) - state.cumulativeCachedInputTokens);
      deltaOutput = Math.max(0, (tokenCount.total.output_tokens ?? 0) - state.cumulativeOutputTokens);
      deltaReasoning = Math.max(0, (tokenCount.total.reasoning_output_tokens ?? 0) - state.cumulativeReasoningTokens);
    } else {
      continue;
    }

    state.cumulativeInputTokens += deltaInput;
    state.cumulativeCachedInputTokens += deltaCachedInput;
    state.cumulativeOutputTokens += deltaOutput;
    state.cumulativeReasoningTokens += deltaReasoning;

    if (deltaInput === 0 && deltaCachedInput === 0 && deltaOutput === 0 && deltaReasoning === 0) continue;

    // Reasoning tokens are billed as output tokens; Codex doesn't currently
    // expose a cache-write count (a known gap upstream), so cacheCreateTokens
    // stays 0 here.
    const outputTokens = deltaOutput + deltaReasoning;
    store.records.push({
      timestamp: typeof entry.timestamp === "string" && !Number.isNaN(Date.parse(entry.timestamp)) ? entry.timestamp : new Date().toISOString(),
      tool: "codex",
      model: state.model,
      workspace: state.workspace,
      sessionId,
      inputTokens: deltaInput,
      outputTokens,
      cacheReadTokens: deltaCachedInput,
      cacheCreateTokens: 0,
      costUsd: computeCost({ inputTokens: deltaInput, outputTokens, cacheReadTokens: deltaCachedInput, cacheCreateTokens: 0 }, state.model, pricingConfig),
    });
    found++;
  }

  store.codexFileState[filePath] = state;
  return found;
}

export async function scanCodexHistorical(
  store: Store,
  pricingConfig: Record<string, ModelRate>,
  onProgress?: (done: number, total: number) => void
): Promise<number> {
  const files = findCodexSessionFiles();
  let total = 0;
  for (let i = 0; i < files.length; i++) {
    total += processCodexFile(store, pricingConfig, files[i]);
    onProgress?.(i + 1, files.length);
  }
  return total;
}

export function startCodexWatcher(
  store: Store,
  pricingConfig: () => Record<string, ModelRate>,
  onChange: (found: number) => void
): vscode.Disposable {
  if (!codexDetected()) {
    return { dispose: () => {} };
  }

  const pattern = new vscode.RelativePattern(vscode.Uri.file(codexSessionsDir()), "**/rollout-*.jsonl");
  const watcher = vscode.workspace.createFileSystemWatcher(pattern, false, false, true);

  const handle = (uri: vscode.Uri) => {
    const found = processCodexFile(store, pricingConfig(), uri.fsPath);
    if (found > 0) onChange(found);
  };

  watcher.onDidCreate(handle);
  watcher.onDidChange(handle);
  return watcher;
}
