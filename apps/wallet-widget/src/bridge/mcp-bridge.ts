import type { WidgetData } from "../types.js";

type Listener = (data: WidgetData) => void;
interface Pending {
  resolve: (value: any) => void;
  reject: (reason: unknown) => void;
  timer: ReturnType<typeof window.setTimeout>;
}

export class McpAppsBridge {
  private rpcId = 0;
  private readonly pending = new Map<number, Pending>();
  private readonly listeners = new Set<Listener>();
  private ready: Promise<void> | null = null;
  private stopResizeObserver: (() => void) | null = null;

  constructor(private readonly hostWindow: Window = window.parent) {
    window.addEventListener("message", (event) => {
      if (event.source !== this.hostWindow) return;
      const message = event.data as any;
      if (!message || message.jsonrpc !== "2.0") return;
      if (typeof message.id === "number") {
        const pending = this.pending.get(message.id);
        if (!pending) return;
        this.pending.delete(message.id);
        window.clearTimeout(pending.timer);
        if (message.error) pending.reject(message.error);
        else pending.resolve(message.result);
        return;
      }
      if (message.method === "ui/notifications/tool-result") this.emit(message.params?.structuredContent ?? message.params);
    }, { passive: true });
  }

  initialize(): Promise<void> {
    if (this.ready) return this.ready;
    if (this.hostWindow === window) { this.ready = Promise.resolve(); return this.ready; }
    this.ready = this.request("ui/initialize", {
      appInfo: { name: "aifinpay-wallet-widget", version: "0.3.0" }, appCapabilities: {}, protocolVersion: "2026-01-26"
    }, 3_500).then((result) => {
      const hostContext = (result as { hostContext?: { platform?: string } } | undefined)?.hostContext;
      if (hostContext?.platform) document.documentElement.dataset.platform = hostContext.platform;
      this.notify("ui/notifications/initialized", {});
      this.setupResizeNotifications();
    });
    return this.ready;
  }

  subscribe(listener: Listener): () => void { this.listeners.add(listener); return () => this.listeners.delete(listener); }

  async callTool(name: string, args: Record<string, unknown>, options: { emit?: boolean } = {}): Promise<WidgetData> {
    const shouldEmit = options.emit ?? true;
    if (this.hostWindow !== window) {
      try {
        await this.initialize();
        const response = await this.request("tools/call", { name, arguments: args }, 20_000) as { structuredContent?: WidgetData };
        const data = response.structuredContent ?? response as unknown as WidgetData;
        if (shouldEmit) this.emit(data);
        return data;
      } catch (bridgeError) {
        // Some mobile ChatGPT builds expose the compatibility API but do not
        // complete the MCP Apps postMessage handshake. Never leave the wallet
        // on an infinite spinner: fall back to the host API when it is present.
        if (!window.openai?.callTool) throw bridgeError;
      }
    }
    if (window.openai?.callTool) {
      const response = await window.openai.callTool(name, args);
      const data = response.structuredContent ?? { view: "error", error: { code: "INTERNAL_ERROR", message: "Tool returned no data." } };
      if (shouldEmit) this.emit(data);
      return data;
    }
    throw new Error("MCP Apps bridge is available only inside ChatGPT or another compatible host.");
  }

  private emit(data: WidgetData): void { if (data?.view) this.listeners.forEach((listener) => listener(data)); }
  private notify(method: string, params: unknown): void { this.hostWindow.postMessage({ jsonrpc: "2.0", method, params }, "*"); }
  private request(method: string, params: unknown, timeoutMs = 10_000): Promise<unknown> {
    return new Promise((resolve, reject) => {
      const id = ++this.rpcId;
      const timer = window.setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`${method} timed out after ${timeoutMs}ms`));
      }, timeoutMs);
      this.pending.set(id, { resolve, reject, timer });
      this.hostWindow.postMessage({ jsonrpc: "2.0", id, method, params }, "*");
    });
  }

  private setupResizeNotifications(): void {
    if (this.stopResizeObserver || typeof ResizeObserver === "undefined") return;
    let frame = 0;
    const report = () => {
      window.cancelAnimationFrame(frame);
      frame = window.requestAnimationFrame(() => {
        const root = document.documentElement;
        this.notify("ui/notifications/size-changed", {
          width: Math.ceil(window.innerWidth),
          height: Math.ceil(Math.max(root.scrollHeight, root.getBoundingClientRect().height))
        });
      });
    };
    const observer = new ResizeObserver(report);
    observer.observe(document.documentElement);
    observer.observe(document.body);
    report();
    this.stopResizeObserver = () => {
      window.cancelAnimationFrame(frame);
      observer.disconnect();
    };
  }
}

export const bridge = new McpAppsBridge();
