import * as vscode from "vscode";
import * as path from "path";
import * as fs from "fs";
import { spawn, ChildProcess } from "child_process";

export class ScreencastPanel {
  private static instance: ScreencastPanel | undefined;
  private panel: vscode.WebviewPanel;
  private showProcess: ChildProcess | undefined;

  private constructor(
    panel: vscode.WebviewPanel,
    private extensionUri: vscode.Uri
  ) {
    this.panel = panel;
    this.panel.onDidDispose(() => this.dispose());
    this.panel.webview.onDidReceiveMessage((msg) => {
      vscode.commands.executeCommand(`playwright-healer.${msg.command}`);
    });
  }

  static create(extensionUri: vscode.Uri): ScreencastPanel {
    if (ScreencastPanel.instance) {
      ScreencastPanel.instance.panel.reveal();
      return ScreencastPanel.instance;
    }

    const panel = vscode.window.createWebviewPanel(
      "playwrightScreencast",
      "Playwright Screencast",
      vscode.ViewColumn.Beside,
      { enableScripts: true, retainContextWhenHidden: true }
    );

    const instance = new ScreencastPanel(panel, extensionUri);
    ScreencastPanel.instance = instance;
    return instance;
  }

  async start(showUrl?: string) {
    if (!showUrl) {
      this.showProcess = spawn("playwright-cli", ["show"], { shell: true });
      showUrl = "http://localhost:9323";
      await new Promise((r) => setTimeout(r, 2000));
    }

    const htmlPath = path.join(this.extensionUri.fsPath, "webview", "screencast.html");
    let html = fs.readFileSync(htmlPath, "utf8");
    html = html.replace("{{SHOW_URL}}", showUrl);
    this.panel.webview.html = html;
  }

  updateStatus(status: string) {
    this.panel.webview.postMessage({ status });
  }

  private dispose() {
    this.showProcess?.kill();
    ScreencastPanel.instance = undefined;
  }
}
