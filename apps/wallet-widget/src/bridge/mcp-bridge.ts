import type { WidgetData } from "../types.js";

type Listener = (data: WidgetData) => void;
interface Pending { resolve: (value: any) => void; reject: (reason: unknown) => void }

class McpAppsBridge {
  private rpcId = 0;
  private readonly pending = new Map<number, Pending>();
  private readonly listeners = new Set<Listener>();
  private ready: Promise<void> | null = null;

  constructor() {
    window.addEventListener("message", (event) => {
      if (event.source !== window.parent) return;
      const message = event.data as any;
      if (!message || message.jsonrpc !== "2.0") return;
      if (typeof message.id === "number") {
        const pending = this.pending.get(message.id);
        if (!pending) return;
        this.pending.delete(message.id);
        if (message.error) pending.reject(message.error);
        else pending.resolve(message.result);
        return;
      }
      if (message.method === "ui/notifications/tool-result") this.emit(message.params?.structuredContent ?? message.params);
    }, { passive: true });
  }

  initialize(): Promise<void> {
    if (this.ready) return this.ready;
    if (window.parent === window) { this.ready = Promise.resolve(); return this.ready; }
    this.ready = this.request("ui/initialize", {
      appInfo: { name: "aifinpay-wallet-widget", version: "0.1.0" }, appCapabilities: {}, protocolVersion: "2026-01-26"
    }).then(() => { this.notify("ui/notifications/initialized", {}); });
    return this.ready;
  }

  subscribe(listener: Listener): () => void { this.listeners.add(listener); return () => this.listeners.delete(listener); }

  async callTool(name: string, args: Record<string, unknown>): Promise<WidgetData> {
    if (window.parent !== window) {
      await this.initialize();
      const response = await this.request("tools/call", { name, arguments: args }) as { structuredContent?: WidgetData };
      const data = response.structuredContent ?? response as unknown as WidgetData;
      this.emit(data); return data;
    }
    if (window.openai?.callTool) {
      const response = await window.openai.callTool(name, args);
      const data = response.structuredContent ?? { view: "error", error: { code: "INTERNAL_ERROR", message: "Tool returned no data." } };
      this.emit(data); return data;
    }
    throw new Error("MCP Apps bridge is available only inside ChatGPT or another compatible host.");
  }

  private emit(data: WidgetData): void { if (data?.view) this.listeners.forEach((listener) => listener(data)); }
  private notify(method: string, params: unknown): void { window.parent.postMessage({ jsonrpc: "2.0", method, params }, "*"); }
  private request(method: string, params: unknown): Promise<unknown> {
    return new Promise((resolve, reject) => {
      const id = ++this.rpcId; this.pending.set(id, { resolve, reject });
      window.parent.postMessage({ jsonrpc: "2.0", id, method, params }, "*");
    });
  }
}

export const bridge = new McpAppsBridge();
