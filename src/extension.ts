// playwright-healer/src/extension.ts
import * as vscode from "vscode";
import { execFile } from "child_process";
import { ResolveDefinitionTool, FindReferencesTool, GetTypeInfoTool } from "./tools/lsp.js";
import { ApplyEditTool } from "./tools/apply-edit.js";
import { HealCodeLensProvider } from "./ui/codelens.js";
import { TestExplorerProvider, TestFileItem, TestCaseItem } from "./ui/test-explorer.js";
import { getLocalCliBin } from "./cli-path.js";

export function activate(context: vscode.ExtensionContext) {
  const output = vscode.window.createOutputChannel("Playwright Healer");
  output.appendLine("Playwright Healer activated");

  // ── Install playwright-cli skill in workspace ────────
  installSkill(output);

  // ── Tools (only VS Code-native ones that agent can't do via terminal) ──
  context.subscriptions.push(
    vscode.lm.registerTool("playwright-healer_resolve_definition", new ResolveDefinitionTool()),
    vscode.lm.registerTool("playwright-healer_find_references", new FindReferencesTool()),
    vscode.lm.registerTool("playwright-healer_get_type_info", new GetTypeInfoTool()),
    vscode.lm.registerTool("playwright-healer_apply_edit", new ApplyEditTool()),
  );

  // ── Test Explorer (Sidebar) ──────────────────────────
  const testExplorer = new TestExplorerProvider();
  const treeView = vscode.window.createTreeView("playwright-healer.testExplorer", {
    treeDataProvider: testExplorer,
    showCollapseAll: true,
  });
  testExplorer.refresh();

  const watcher = vscode.workspace.createFileSystemWatcher("**/*.test.ts");
  watcher.onDidChange(() => testExplorer.refresh());
  watcher.onDidCreate(() => testExplorer.refresh());
  watcher.onDidDelete(() => testExplorer.refresh());

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
      "playwright-healer.investigate",
      (item?: TestCaseItem) => {
        if (item) runInvestigation(output, item.fileUri, item.testName);
      }
    ),
    vscode.commands.registerCommand(
      "playwright-healer.investigateFile",
      (item?: TestFileItem) => {
        if (item) runInvestigation(output, item.resourceUri);
      }
    ),
    vscode.commands.registerCommand(
      "playwright-healer.runFile",
      (fileUri?: vscode.Uri, testName?: string) => {
        const uri = fileUri ?? vscode.window.activeTextEditor?.document.uri;
        if (!uri) {
          vscode.window.showErrorMessage("No test file open");
          return;
        }
        runInvestigation(output, uri, testName);
      }
    ),
    vscode.commands.registerCommand("playwright-healer.refreshTests", () => {
      testExplorer.refresh();
    }),
    vscode.commands.registerCommand("playwright-healer.stop", () => {
      const bin = getLocalCliBin();
      execFile(bin, ["close"], { shell: true }, () => {});
      vscode.window.showInformationMessage("Browser closed");
    }),
  );

  // ── Status Bar ─────────────────────────────────────────
  const statusBar = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100);
  statusBar.text = "$(beaker) Playwright Healer";
  statusBar.tooltip = "Open test explorer";
  statusBar.command = "playwright-healer.testExplorer.focus";
  statusBar.show();
  context.subscriptions.push(statusBar, treeView, watcher, output);
}

/** Run `playwright-cli install --skills` in workspace to install standard SKILL.md */
function installSkill(output: vscode.OutputChannel) {
  const bin = getLocalCliBin();
  const cwd = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
  if (!cwd) return;

  execFile(bin, ["install", "--skills"], { shell: true, cwd }, (err, stdout, stderr) => {
    if (err) {
      output.appendLine(`Skill install error: ${err.message}`);
      return;
    }
    if (stdout) output.appendLine(stdout.trim());
    if (stderr) output.appendLine(stderr.trim());
  });
}

function runInvestigation(
  output: vscode.OutputChannel,
  fileUri: vscode.Uri,
  testName?: string,
) {
  // Open Copilot Chat with prompt file → auto-selects Playwright Healer agent
  // Browser opening is handled by the agent (step 2 in agent instructions)
  const file = vscode.workspace.asRelativePath(fileUri);
  const target = testName ? `the test "${testName}" in ${file}` : `all tests in ${file}`;

  const prompt = `#prompt:investigate ${target}`;

  vscode.commands.executeCommand("workbench.action.chat.open", { query: prompt });
}

export function deactivate() {}
