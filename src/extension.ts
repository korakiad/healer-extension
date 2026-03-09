// playwright-healer/src/extension.ts
import * as vscode from "vscode";
import { ExecuteCliTool } from "./tools/execute-cli.js";
import { ResolveDefinitionTool, FindReferencesTool, GetTypeInfoTool } from "./tools/lsp.js";
import { ApplyEditTool } from "./tools/apply-edit.js";
import { HealCodeLensProvider } from "./ui/codelens.js";
import { ScreencastPanel } from "./ui/screencast.js";

export function activate(context: vscode.ExtensionContext) {
  const output = vscode.window.createOutputChannel("Playwright Healer");
  output.appendLine("Playwright Healer activated");

  // ── Tools ──────────────────────────────────────────────
  context.subscriptions.push(
    vscode.lm.registerTool("playwright-healer_execute_cli", new ExecuteCliTool()),
    vscode.lm.registerTool("playwright-healer_resolve_definition", new ResolveDefinitionTool()),
    vscode.lm.registerTool("playwright-healer_find_references", new FindReferencesTool()),
    vscode.lm.registerTool("playwright-healer_get_type_info", new GetTypeInfoTool()),
    vscode.lm.registerTool("playwright-healer_apply_edit", new ApplyEditTool()),
  );

  // ── CodeLens ───────────────────────────────────────────
  context.subscriptions.push(
    vscode.languages.registerCodeLensProvider(
      { language: "typescript", pattern: "**/*.test.ts" },
      new HealCodeLensProvider()
    )
  );

  // ── Commands ───────────────────────────────────────────
  context.subscriptions.push(
    vscode.commands.registerCommand(
      "playwright-healer.runFile",
      async (fileUri?: vscode.Uri, testName?: string) => {
        const uri = fileUri ?? vscode.window.activeTextEditor?.document.uri;
        if (!uri) {
          vscode.window.showErrorMessage("No test file open");
          return;
        }
        // Open screencast
        const screencast = ScreencastPanel.create();
        await screencast.start();
        screencast.updateStatus(`Running: ${testName ?? uri.fsPath}`);

        // Trigger Copilot Chat with healing context
        const errorContext = testName
          ? `Heal the failing test "${testName}" in ${uri.fsPath}`
          : `Heal failing tests in ${uri.fsPath}`;

        vscode.commands.executeCommand("workbench.action.chat.open", {
          query: errorContext,
        });
      }
    )
  );

  context.subscriptions.push(
    vscode.commands.registerCommand("playwright-healer.showScreencast", () => {
      const screencast = ScreencastPanel.create();
      screencast.start();
    }),
    vscode.commands.registerCommand("playwright-healer.openScreencast", () => {
      vscode.env.openExternal(vscode.Uri.parse("http://localhost:9323"));
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand("playwright-healer.stop", () => {
      vscode.window.showInformationMessage("Test run stopped");
    })
  );

  // ── Status Bar ─────────────────────────────────────────
  const statusBar = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100);
  statusBar.text = "$(beaker) Playwright Healer";
  statusBar.command = "playwright-healer.showScreencast";
  statusBar.show();
  context.subscriptions.push(statusBar, output);
}

export function deactivate() {}
