import * as vscode from "vscode";

export function activate(context: vscode.ExtensionContext) {
  const output = vscode.window.createOutputChannel("Playwright Healer");
  output.appendLine("Playwright Healer activated");

  context.subscriptions.push(
    vscode.commands.registerCommand("playwright-healer.runFile", () => {
      vscode.window.showInformationMessage("Run File: not implemented yet");
    }),
    vscode.commands.registerCommand("playwright-healer.showScreencast", () => {
      vscode.window.showInformationMessage("Screencast: not implemented yet");
    }),
    vscode.commands.registerCommand("playwright-healer.stop", () => {
      vscode.window.showInformationMessage("Stop: not implemented yet");
    }),
    output
  );
}

export function deactivate() {}
