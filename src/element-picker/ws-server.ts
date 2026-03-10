import { WebSocketServer, WebSocket } from "ws";
import { randomBytes } from "crypto";
import type { IncomingMessage } from "http";

export interface WsMessage {
  type: string;
  payload?: any;
}

export class PickerWsServer {
  private wss: WebSocketServer | null = null;
  private client: WebSocket | null = null;
  readonly token: string;
  private _port = 0;

  constructor(
    private onMessage: (msg: WsMessage) => void,
    private onConnect?: () => void
  ) {
    this.token = randomBytes(16).toString("hex");
  }

  get port(): number {
    return this._port;
  }

  start(): Promise<void> {
    return new Promise((resolve) => {
      this.wss = new WebSocketServer({ host: "127.0.0.1", port: 0 });
      this.wss.on("listening", () => {
        const addr = this.wss!.address();
        this._port = typeof addr === "object" && addr !== null ? addr.port : 0;
        resolve();
      });
      this.wss.on("connection", (ws: WebSocket, req: IncomingMessage) => {
        const url = new URL(req.url ?? "", `http://${req.headers.host}`);
        if (url.searchParams.get("token") !== this.token) {
          ws.close(4001, "Unauthorized");
          return;
        }
        this.client = ws;
        this.onConnect?.();
        ws.on("message", (raw) => {
          try {
            const msg: WsMessage = JSON.parse(raw.toString());
            this.onMessage(msg);
          } catch { /* ignore malformed */ }
        });
        ws.on("close", () => {
          if (this.client === ws) this.client = null;
        });
      });
    });
  }

  send(type: string, payload?: any): void {
    if (this.client?.readyState === WebSocket.OPEN) {
      this.client.send(JSON.stringify({ type, payload }));
    }
  }

  hasClient(): boolean {
    return this.client?.readyState === WebSocket.OPEN;
  }

  stop(): void {
    this.client?.close();
    this.client = null;
    this.wss?.close();
    this.wss = null;
  }
}
