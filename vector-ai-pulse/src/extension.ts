import * as fs from "fs";
import * as vscode from "vscode";
import { claudeCodeDetected, scanHistorical, startWatcher } from "./collector";
import { fmtUsd } from "./format";
import { computePace, PaceState, worstState } from "./pacing";
import { renderPanelHtml } from "./panel";
import { computeCost, ModelRate } from "./pricing";
import { addRecord, Budget, loadStore, saveStore, Store, storeFileExists, storePath, UsageRecord } from "./store";

let statusBarItem: vscode.StatusBarItem;
let store: Store;
let panel: vscode.WebviewPanel | undefined;
let brandMarkDataUri = "";

const STATE_COLOR: Record<PaceState, string | undefined> = {
  neutral: undefined,
  green: undefined,
  amber: "statusBarItem.warningBackground",
  red: "statusBarItem.errorBackground",
};

const STATE_GLYPH: Record<PaceState, string> = {
  neutral: "$(circle-outline)",
  green: "$(check)",
  amber: "$(warning)",
  red: "$(flame)",
};

function pricingConfig(): Record<string, ModelRate> {
  return vscode.workspace.getConfiguration("vector.aiPulse").get<Record<string, ModelRate>>("pricing") ?? {};
}

function cueStyle(): "standard" | "minimal" | "off" {
  return vscode.workspace.getConfiguration("vector.aiPulse").get<"standard" | "minimal" | "off">("cueStyle") ?? "standard";
}

function trendDays(): number {
  return vscode.workspace.getConfiguration("vector.aiPulse").get<number>("trendDays") ?? 30;
}

function activeSessionWindowMinutes(): number {
  return vscode.workspace.getConfiguration("vector.aiPulse").get<number>("activeSessionWindowMinutes") ?? 10;
}

function refreshStatusBar(): void {
  const style = cueStyle();
  if (style === "off") {
    statusBarItem.hide();
    return;
  }

  const { daily, monthly } = computePace(store.records, store.budget, new Date());
  const state = worstState(daily.state, monthly.state);
  const glyph = STATE_GLYPH[state];

  if (style === "minimal") {
    statusBarItem.text = `${glyph} ${fmtUsd(daily.spend)}`;
  } else {
    const budgetPart = daily.budget !== null ? ` / ${fmtUsd(daily.budget)}` : "";
    statusBarItem.text = `${glyph} ${fmtUsd(daily.spend)}${budgetPart}`;
  }

  const tooltipLines = [
    `Today: ${fmtUsd(daily.spend)}${daily.budget !== null ? ` of ${fmtUsd(daily.budget)}` : " (no daily budget set)"}`,
    `This period: ${fmtUsd(monthly.spend)}${monthly.budget !== null ? ` of ${fmtUsd(monthly.budget)}` : " (no monthly budget set)"}`,
    "Click to open the Pulse panel",
  ];
  statusBarItem.tooltip = new vscode.MarkdownString(tooltipLines.join("\n\n"));

  const bg = STATE_COLOR[state];
  statusBarItem.backgroundColor = bg ? new vscode.ThemeColor(bg) : undefined;
  statusBarItem.show();
}

function refreshPanel(): void {
  if (!panel) return;
  panel.webview.html = renderPanelHtml({
    records: store.records,
    budget: store.budget,
    storePath,
    claudeDetected: claudeCodeDetected(),
    brandMarkDataUri,
    trendDays: trendDays(),
    activeSessionWindowMinutes: activeSessionWindowMinutes(),
  });
}

function refreshAll(): void {
  refreshStatusBar();
  refreshPanel();
}

function openPanel(): void {
  if (panel) {
    panel.reveal();
    return;
  }
  panel = vscode.window.createWebviewPanel("vector.aiPulse.panel", "Vector AI Pulse", vscode.ViewColumn.One, {
    enableScripts: false,
  });
  panel.onDidDispose(() => {
    panel = undefined;
  });
  refreshPanel();
}

async function setBudget(): Promise<void> {
  const dailyInput = await vscode.window.showInputBox({
    prompt: "Daily budget in USD (leave blank for no daily budget)",
    value: store.budget.dailyUsd !== null ? String(store.budget.dailyUsd) : "",
    validateInput: (v) => (v === "" || (!Number.isNaN(Number(v)) && Number(v) >= 0) ? null : "Enter a non-negative number or leave blank"),
  });
  if (dailyInput === undefined) return;

  const monthlyInput = await vscode.window.showInputBox({
    prompt: "Monthly budget in USD (leave blank for no monthly budget)",
    value: store.budget.monthlyUsd !== null ? String(store.budget.monthlyUsd) : "",
    validateInput: (v) => (v === "" || (!Number.isNaN(Number(v)) && Number(v) >= 0) ? null : "Enter a non-negative number or leave blank"),
  });
  if (monthlyInput === undefined) return;

  store.budget = {
    ...store.budget,
    dailyUsd: dailyInput === "" ? null : Number(dailyInput),
    monthlyUsd: monthlyInput === "" ? null : Number(monthlyInput),
  };
  saveStore(store);
  refreshAll();
  vscode.window.showInformationMessage("Vector AI Pulse: budget updated.");
}

async function manualEntry(): Promise<void> {
  const tool = await vscode.window.showQuickPick(["chatgpt", "gemini", "copilot-chat", "other"], {
    placeHolder: "Which tool is this usage for?",
  });
  if (!tool) return;

  const inputTokensStr = await vscode.window.showInputBox({ prompt: "Input tokens", value: "0" });
  if (inputTokensStr === undefined) return;
  const outputTokensStr = await vscode.window.showInputBox({ prompt: "Output tokens", value: "0" });
  if (outputTokensStr === undefined) return;
  const costStr = await vscode.window.showInputBox({
    prompt: "Cost in USD (leave blank to estimate from Sonnet-class rates)",
    value: "",
  });
  if (costStr === undefined) return;

  const inputTokens = Number(inputTokensStr) || 0;
  const outputTokens = Number(outputTokensStr) || 0;
  const costUsd =
    costStr !== "" && !Number.isNaN(Number(costStr))
      ? Number(costStr)
      : computeCost({ inputTokens, outputTokens, cacheReadTokens: 0, cacheCreateTokens: 0 }, "manual", pricingConfig());

  const record: UsageRecord = {
    timestamp: new Date().toISOString(),
    tool,
    model: "manual",
    workspace: vscode.workspace.workspaceFolders?.[0]?.name ?? "unknown",
    sessionId: "manual",
    inputTokens,
    outputTokens,
    cacheReadTokens: 0,
    cacheCreateTokens: 0,
    costUsd,
  };
  addRecord(store, record);
  saveStore(store);
  refreshAll();
  vscode.window.showInformationMessage(`Vector AI Pulse: logged ${tool} entry (${fmtUsd(costUsd)}).`);
}

function csvEscape(value: string): string {
  return /[",\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

async function exportCsv(): Promise<void> {
  const uri = await vscode.window.showSaveDialog({ filters: { CSV: ["csv"] }, saveLabel: "Export" });
  if (!uri) return;

  const header = "timestamp,tool,model,workspace,sessionId,inputTokens,outputTokens,cacheReadTokens,cacheCreateTokens,costUsd";
  const rows = store.records.map((r) =>
    [r.timestamp, r.tool, r.model, r.workspace, r.sessionId, r.inputTokens, r.outputTokens, r.cacheReadTokens, r.cacheCreateTokens, r.costUsd]
      .map((v) => csvEscape(String(v)))
      .join(",")
  );
  const csv = [header, ...rows].join("\n") + "\n";
  await vscode.workspace.fs.writeFile(uri, Buffer.from(csv, "utf8"));
  vscode.window.showInformationMessage(`Vector AI Pulse: exported ${store.records.length} records.`);
}

async function resetData(): Promise<void> {
  const confirmed = await vscode.window.showWarningMessage(
    "This permanently deletes all locally stored Vector AI Pulse usage data. Continue?",
    { modal: true },
    "Reset All Data"
  );
  if (confirmed !== "Reset All Data") return;

  const budget: Budget = store.budget;
  store = loadStore();
  store.records = [];
  store.seenMessageIds = [];
  store.fileOffsets = {};
  store.nudgeLog = [];
  store.budget = budget;
  saveStore(store);
  refreshAll();
  vscode.window.showInformationMessage("Vector AI Pulse: all usage data reset.");
}

export function activate(context: vscode.ExtensionContext): void {
  const isFirstRun = !storeFileExists();
  store = loadStore();

  try {
    const iconPath = context.asAbsolutePath("media/icon.png");
    brandMarkDataUri = `data:image/png;base64,${fs.readFileSync(iconPath).toString("base64")}`;
  } catch {
    brandMarkDataUri = "";
  }

  statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
  statusBarItem.command = "vector.aiPulse.openPanel";
  context.subscriptions.push(statusBarItem);
  refreshStatusBar();

  context.subscriptions.push(
    vscode.commands.registerCommand("vector.aiPulse.openPanel", openPanel),
    vscode.commands.registerCommand("vector.aiPulse.setBudget", setBudget),
    vscode.commands.registerCommand("vector.aiPulse.manualEntry", manualEntry),
    vscode.commands.registerCommand("vector.aiPulse.exportCsv", exportCsv),
    vscode.commands.registerCommand("vector.aiPulse.resetData", resetData),
    vscode.workspace.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration("vector.aiPulse")) refreshAll();
    })
  );

  // Deferred to a follow-up tick: creating a recursive FileSystemWatcher
  // outside any workspace folder is expensive on Windows (native recursive
  // watch setup + AV scanning as it enumerates ~/.claude/projects), and
  // running it inline here was blocking the status bar/commands from
  // appearing for several seconds. Neither the watcher nor the historical
  // scan need to be ready before the UI is.
  setTimeout(() => {
    context.subscriptions.push(
      startWatcher(store, pricingConfig, () => {
        saveStore(store);
        refreshAll();
      })
    );

    if (claudeCodeDetected()) {
      const importPromise = isFirstRun
        ? vscode.window.withProgress(
            { location: vscode.ProgressLocation.Notification, title: "Vector AI Pulse: importing Claude Code history" },
            (progress) =>
              scanHistorical(store, pricingConfig(), (done, total) => {
                progress.report({ message: `${done}/${total} sessions` });
              })
          )
        : scanHistorical(store, pricingConfig());

      importPromise.then((count) => {
        if (count > 0) {
          saveStore(store);
          refreshAll();
          if (isFirstRun) vscode.window.showInformationMessage(`Vector AI Pulse: imported ${count} usage records from Claude Code.`);
        }
      });
    }
  }, 0);

  if (!store.budget.dailyUsd && !store.budget.monthlyUsd && !store.promptedBudgetSetup) {
    store.promptedBudgetSetup = true;
    saveStore(store);
    vscode.window
      .showInformationMessage("Vector AI Pulse is tracking locally. Set a budget to turn on pace warnings.", "Set Budget...")
      .then((choice) => {
        if (choice === "Set Budget...") void setBudget();
      });
  }
}

export function deactivate(): void {
  panel?.dispose();
}
