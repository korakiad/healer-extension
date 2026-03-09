import * as vscode from "vscode";
import { spawn, ChildProcess } from "child_process";

const SHOW_URL = "http://localhost:9323";

export class ScreencastPanel {
  private static instance: ScreencastPanel | undefined;
  private panel: vscode.WebviewPanel;
  private showProcess: ChildProcess | undefined;

  private constructor(panel: vscode.WebviewPanel) {
    this.panel = panel;
    this.panel.onDidDispose(() => this.dispose());
    this.panel.webview.onDidReceiveMessage((msg) => {
      vscode.commands.executeCommand(`playwright-healer.${msg.command}`);
    });
  }

  static create(): ScreencastPanel {
    if (ScreencastPanel.instance) {
      ScreencastPanel.instance.panel.reveal();
      return ScreencastPanel.instance;
    }

    const panel = vscode.window.createWebviewPanel(
      "playwrightScreencast",
      "Playwright Healer",
      vscode.ViewColumn.Beside,
      { enableScripts: true, retainContextWhenHidden: true }
    );

    const instance = new ScreencastPanel(panel);
    ScreencastPanel.instance = instance;
    return instance;
  }

  async start() {
    // Spawn playwright-cli show (serves screencast on local port)
    this.showProcess = spawn("playwright-cli", ["show"], { shell: true });
    await new Promise((r) => setTimeout(r, 2000));

    // Open screencast in external browser (WebView CSP blocks http:// iframes)
    vscode.env.openExternal(vscode.Uri.parse(SHOW_URL));

    // WebView shows status + controls only
    this.panel.webview.html = this.getStatusHtml("Connected — screencast opened in browser");
  }

  updateStatus(status: string) {
    this.panel.webview.postMessage({ status });
  }

  private getStatusHtml(status: string): string {
    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <style>
    body {
      margin: 0; padding: 24px; background: #1e1e1e; color: #ccc;
      font-family: var(--vscode-font-family, sans-serif);
      font-size: 13px;
    }
    h2 { color: #fff; margin: 0 0 16px; }
    .status { margin: 12px 0; padding: 8px 12px; background: #252526; border-radius: 4px; }
    .actions { margin-top: 16px; display: flex; gap: 8px; }
    button {
      padding: 6px 14px; border: 1px solid #555; border-radius: 3px;
      background: #0e639c; color: white; cursor: pointer; font-size: 13px;
    }
    button:hover { background: #1177bb; }
    button.danger { background: #c72e2e; }
    button.danger:hover { background: #e03e3e; }
    button.secondary { background: #3c3c3c; }
    button.secondary:hover { background: #505050; }
    .hint { color: #888; font-size: 12px; margin-top: 12px; }
  </style>
</head>
<body>
  <h2>Playwright Healer</h2>
  <div class="status" id="status">${status}</div>
  <div class="actions">
    <button onclick="postMsg('runFile')">Heal Run</button>
    <button class="secondary" onclick="openScreencast()">Open Screencast</button>
    <button class="danger" onclick="postMsg('stop')">Stop</button>
  </div>
  <div class="hint">Screencast opens in your default browser. Use Copilot Chat for healing.</div>
  <script>
    const vscode = acquireVsCodeApi();
    function postMsg(command) { vscode.postMessage({ command }); }
    function openScreencast() { vscode.postMessage({ command: 'openScreencast' }); }
    window.addEventListener("message", (e) => {
      if (e.data?.status) {
        document.getElementById("status").textContent = e.data.status;
      }
    });
  </script>
</body>
</html>`;
  }

  private dispose() {
    this.showProcess?.kill();
    ScreencastPanel.instance = undefined;
  }
}
