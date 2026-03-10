import * as vscode from "vscode";
import { chromium, Browser, Page } from "playwright-core";
import { execFile } from "child_process";
import { promisify } from "util";
import { readFileSync, writeFileSync, unlinkSync } from "fs";
import { join } from "path";
import { mkdirSync } from "fs";
import { tmpdir } from "os";
import { PickerWsServer, WsMessage } from "./ws-server.js";
import { analyzeSelectors, ElementInfo, SelectorSuggestion } from "./lm-agent.js";
import { getLocalCliBin } from "../cli-path.js";

const execFileAsync = promisify(execFile);

export interface PickElementResult {
  selector: string;
  type: "Playwright" | "CSS";
  elementInfo: ElementInfo;
  alternatives: SelectorSuggestion[];
}

type SelectionResolver = (result: PickElementResult) => void;
type SelectionRejecter = (error: Error) => void;

/**
 * Manages float ball injection and element picking.
 *
 * Browser lifecycle (mirrors cdp-bridge.ts pattern from root project):
 * 1. Launch Chrome with --remote-debugging-port=PORT
 * 2. Write CDP config → playwright-cli open --config=<path> to connect daemon
 * 3. connectOverCDP for float ball injection
 *
 * Extension + daemon share the same browser instance.
 */
export class PickerService implements vscode.Disposable {
  private static instance: PickerService | null = null;

  private wsServer: PickerWsServer | null = null;
  private browser: Browser | null = null;
  private page: Page | null = null;
  private injected = false;
  private cdpConfigPath: string | null = null;

  private pendingResolve: SelectionResolver | null = null;
  private pendingReject: SelectionRejecter | null = null;

  private lastSuggestions: SelectorSuggestion[] = [];
  private lastElementInfo: ElementInfo | null = null;

  private output: vscode.OutputChannel;

  private constructor(output: vscode.OutputChannel) {
    this.output = output;
  }

  static getInstance(output: vscode.OutputChannel): PickerService {
    if (!PickerService.instance) {
      PickerService.instance = new PickerService(output);
    }
    return PickerService.instance;
  }

  static disposeIfExists(): void {
    PickerService.instance?.dispose();
  }

  /**
   * Ensure browser is running with CDP, daemon connected, and float ball injected.
   * Reuses cdp-bridge.ts pattern: config file → playwright-cli open --config.
   */
  async ensureInjected(cdpPort: number): Promise<void> {
    if (this.injected && this.page && !this.page.isClosed()) return;

    // Start WebSocket server if needed
    if (!this.wsServer) {
      this.wsServer = new PickerWsServer(
        (msg) => this.handleMessage(msg),
        () => this.output.appendLine("[picker] Float ball connected via WebSocket")
      );
      await this.wsServer.start();
      this.output.appendLine(`[picker] WebSocket server on port ${this.wsServer.port}`);
    }

    // Connect daemon if not already connected (cdp-bridge pattern)
    if (!this.cdpConfigPath) {
      await this.connectDaemon(cdpPort);
    }

    // Connect via CDP for float ball injection
    this.browser = await chromium.connectOverCDP(`http://127.0.0.1:${cdpPort}`);
    const contexts = this.browser.contexts();
    if (contexts.length === 0) throw new Error("No browser contexts found via CDP");
    const pages = contexts[0].pages();
    if (pages.length === 0) throw new Error("No pages found via CDP");
    this.page = pages[0];

    // Inject float-ball.js
    const scriptPath = join(__dirname, "injected", "float-ball.js");
    let script = readFileSync(scriptPath, "utf-8");
    script = script
      .replace(/__WS_PORT__/g, String(this.wsServer.port))
      .replace(/__WS_TOKEN__/g, this.wsServer.token)
      .replace(/__MODE__/g, "agent");

    await this.page.evaluate(script);
    this.injected = true;
    this.output.appendLine("[picker] Float ball injected via CDP");

    // Re-inject on navigation
    this.page.on("load", async () => {
      try {
        let s = readFileSync(scriptPath, "utf-8");
        s = s
          .replace(/__WS_PORT__/g, String(this.wsServer!.port))
          .replace(/__WS_TOKEN__/g, this.wsServer!.token)
          .replace(/__MODE__/g, "agent");
        await this.page!.evaluate(s);
        this.output.appendLine("[picker] Float ball re-injected after navigation");
      } catch (err) {
        this.output.appendLine(`[picker] Re-injection failed: ${err}`);
      }
    });
  }

  /**
   * Write CDP config and connect daemon (same pattern as cdp-bridge.ts).
   * Config: { browser: { cdpEndpoint, isolated: false } }
   * Then: playwright-cli open --config=<path>
   */
  private async connectDaemon(cdpPort: number): Promise<void> {
    const configDir = join(tmpdir(), "playwright-healer");
    mkdirSync(configDir, { recursive: true });
    const configPath = join(configDir, "playwright-cli.json");

    const cdpConfig = {
      browser: {
        cdpEndpoint: `http://localhost:${cdpPort}`,
        isolated: false,
      },
    };
    writeFileSync(configPath, JSON.stringify(cdpConfig, null, 2));
    this.cdpConfigPath = configPath;

    const cliBin = getLocalCliBin();
    try {
      await execFileAsync(
        cliBin,
        ["open", `--config=${configPath}`],
        { shell: true, timeout: 15_000 },
      );
      this.output.appendLine(`[picker] Daemon connected via CDP config (port ${cdpPort})`);
    } catch (err) {
      this.output.appendLine(`[picker] Daemon connection failed: ${err}`);
      // Non-fatal — daemon may already be connected
    }
  }

  pickElement(hint?: string): Promise<PickElementResult> {
    if (!this.injected) {
      return Promise.reject(new Error("Float ball not injected. Call ensureInjected() first."));
    }

    this.pendingReject?.(new Error("Cancelled by new pick request"));

    return new Promise<PickElementResult>((resolve, reject) => {
      this.pendingResolve = resolve;
      this.pendingReject = reject;
      this.wsServer?.send("activate-picker", { hint });
    });
  }

  private async handleMessage(msg: WsMessage): Promise<void> {
    switch (msg.type) {
      case "element-selected": {
        const elementInfo: ElementInfo = msg.payload?.info ?? msg.payload;
        this.lastElementInfo = elementInfo;
        this.wsServer?.send("selector-loading");

        try {
          let ariaSnapshot = "";
          if (this.page && !this.page.isClosed()) {
            try {
              ariaSnapshot = await this.page.locator("body").ariaSnapshot();
            } catch {
              ariaSnapshot = "(snapshot unavailable)";
            }
          }

          const suggestions = await analyzeSelectors(elementInfo, ariaSnapshot);
          this.lastSuggestions = suggestions;
          this.wsServer?.send("selector-results", { selectors: suggestions });
        } catch (err: any) {
          this.wsServer?.send("selector-error", { message: err.message });
        }
        break;
      }

      case "selector-chosen": {
        const { selector, type } = msg.payload;
        if (this.pendingResolve && this.lastElementInfo) {
          this.pendingResolve({
            selector,
            type: type ?? "Playwright",
            elementInfo: this.lastElementInfo,
            alternatives: this.lastSuggestions.filter((s) => s.selector !== selector),
          });
          this.pendingResolve = null;
          this.pendingReject = null;
        }
        this.wsServer?.send("deactivate-picker");
        break;
      }
    }
  }

  cancelPick(): void {
    this.pendingReject?.(new Error("Pick cancelled"));
    this.pendingResolve = null;
    this.pendingReject = null;
    this.wsServer?.send("deactivate-picker");
  }

  dispose(): void {
    this.cancelPick();
    this.wsServer?.stop();
    this.wsServer = null;
    this.browser?.close().catch(() => {});
    this.browser = null;
    this.page = null;
    this.injected = false;
    // Clean up CDP config
    if (this.cdpConfigPath) {
      try { unlinkSync(this.cdpConfigPath); } catch { /* ignore */ }
      this.cdpConfigPath = null;
    }
    PickerService.instance = null;
  }
}
