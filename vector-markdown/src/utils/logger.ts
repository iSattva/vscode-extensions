import * as vscode from "vscode";

let channel: vscode.OutputChannel | undefined;

export function getLogger(): vscode.OutputChannel {
  if (!channel) {
    channel = vscode.window.createOutputChannel("Vector Markdown");
  }
  return channel;
}
