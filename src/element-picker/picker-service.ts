import * as vscode from "vscode";
import { chromium, Browser, Page } from "playwright-core";
import { readFileSync } from "fs";
import { join } from "path";
import { PickerWsServer, WsMessage } from "./ws-server.js";
import { analyzeSelectors, ElementInfo, SelectorSuggestion } from "./lm-agent.js";

export interface PickElementResult {
  selector: string;
  type: "Playwright" | "CSS";
  elementInfo: ElementInfo;
  alternatives: SelectorSuggestion[];
}

type SelectionResolver = (result: PickElementResult) => void;
type SelectionRejecter = (error: Error) => void;

/**
 * Manages browser launch, float ball injection, and element picking.
 *
 * Responsibilities split between extension and agent:
 * - Extension: launches Chrome with --remote-debugging-port (launchBrowser)
 * - Agent: connects daemon via playwright-cli open --config with cdpEndpoint
 * - This service: connectOverCDP for float ball injection (ensureInjected)
 */
export class PickerService implements vscode.Disposable {
  private static instance: PickerService | null = null;

  private launchedBrowser: Browser | null = null;
  private wsServer: PickerWsServer | null = null;
  private browser: Browser | null = null;
  private page: Page | null = null;
  private injected = false;

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
   * Launch Chrome headed with --remote-debugging-port.
   * Called by extension before opening Copilot Chat.
   * Agent then connects daemon via: playwright-cli open --config (with cdpEndpoint pointing here).
   */
  async launchBrowser(cdpPort: number): Promise<void> {
    if (this.launchedBrowser) return;

    this.launchedBrowser = await chromium.launch({
      headless: false,
      args: [`--remote-debugging-port=${cdpPort}`],
    });
    this.output.appendLine(`[picker] Chrome launched with CDP on port ${cdpPort}`);
  }

  /**
   * Connect to browser via CDP and inject float ball.
   * Browser must already be running (launched by launchBrowser).
   * Daemon must already be connected (by agent via playwright-cli open --config).
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

    // Connect via CDP — browser already running at this port
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
    // Disconnect CDP injection handle
    this.browser?.close().catch(() => {});
    this.browser = null;
    this.page = null;
    // Close launched browser
    this.launchedBrowser?.close().catch(() => {});
    this.launchedBrowser = null;
    this.injected = false;
    PickerService.instance = null;
  }
}
