import type { WidgetData } from "../types.js";

type Listener = (data: WidgetData) => void;
interface Pending {
  resolve: (value: any) => void;
  reject: (reason: unknown) => void;
  timer: ReturnType<typeof window.setTimeout>;
}

function widgetDataFrom(value: unknown): WidgetData | undefined {
  if (!value || typeof value !== "object") return undefined;
  const record = value as Record<string, unknown>;
  if (typeof record.view === "string" && record.view) return record as unknown as WidgetData;
  for (const key of ["structuredContent", "result", "data", "output", "toolResult", "toolResponse"]) {
    const nested = record[key];
    const candidate = widgetDataFrom(nested);
    if (candidate) return candidate;
  }
  return undefined;
}

function resultFingerprint(value: unknown): string {
  const data = widgetDataFrom(value);
  if (!data) return "";
  try { return JSON.stringify(data); }
  catch { return `${data.view}:${String((data as Record<string, unknown>).intent ?? "")}`; }
}

function expectedViewsForTool(name: string): Set<string> | null {
  if (name === "open_wallet" || name === "open_wallet_current" || name === "create_wallet_pairing" || name === "get_wallet_summary") {
    return new Set(["wallet", "error", "not-connected"]);
  }
  if (name.startsWith("prepare_") && name.endsWith("_transfer")) {
    return new Set(["transfer-preview", "blocked", "error", "mainnet-signing-locked"]);
  }
  if (name === "prepare_transfer") {
    return new Set(["transfer-preview", "blocked", "error", "mainnet-signing-locked"]);
  }
  if (name === "confirm_transfer" || name.startsWith("submit_")) {
    return new Set(["receipt", "pending", "error", "blocked"]);
  }
  return null;
}

function acceptsToolResult(name: string, data: WidgetData | undefined): data is WidgetData {
  if (!data?.view) return false;
  const expected = expectedViewsForTool(name);
  return !expected || expected.has(data.view);
}

export class McpAppsBridge {
  private rpcId = 0;
  private readonly pending = new Map<number, Pending>();
  private readonly listeners = new Set<Listener>();
  private ready: Promise<void> | null = null;
  private lastPushed: { data: WidgetData; at: number } | null = null;
  private readonly pushWaiters: Array<(data: WidgetData) => void> = [];
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
      if (message.method === "ui/notifications/tool-result") {
        const pushed = widgetDataFrom(message.params?.structuredContent ?? message.params);
        if (pushed) {
          this.lastPushed = { data: pushed, at: Date.now() };
          this.pushWaiters.slice().forEach((resolve) => resolve(pushed));
          this.emit(pushed);
        }
      }
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

  private awaitPushedResult(name: string, timeoutMs: number, beforeFingerprint: string, startedAt: number): Promise<WidgetData | null> {
    if (this.lastPushed && this.lastPushed.at >= startedAt && acceptsToolResult(name, this.lastPushed.data)) {
      return Promise.resolve(this.lastPushed.data);
    }
    return new Promise((resolve) => {
      let settled = false;
      let timer = 0;
      let poller = 0;
      const finish = (data: WidgetData | null) => {
        if (settled) return;
        settled = true;
        window.clearTimeout(timer);
        window.clearInterval(poller);
        window.removeEventListener("openai:set_globals", onGlobals);
        const index = this.pushWaiters.indexOf(waiter);
        if (index >= 0) this.pushWaiters.splice(index, 1);
        resolve(data);
      };

      const fresh = (): WidgetData | null => {
        const output = window.openai?.toolOutput;
        const data = widgetDataFrom(output);
        if (!acceptsToolResult(name, data)) return null;
        return resultFingerprint(output) === beforeFingerprint ? null : data;
      };

      const waiter = (data: WidgetData) => {
        if (acceptsToolResult(name, data)) finish(data);
      };
      this.pushWaiters.push(waiter);
      const onGlobals = () => { const data = fresh(); if (data) finish(data); };
      window.addEventListener("openai:set_globals", onGlobals);
      poller = window.setInterval(() => { const data = fresh(); if (data) finish(data); }, 100);
      timer = window.setTimeout(() => finish(null), timeoutMs);
    });
  }

  subscribe(listener: Listener): () => void { this.listeners.add(listener); return () => this.listeners.delete(listener); }

  async callTool(name: string, args: Record<string, unknown>, options: { emit?: boolean } = {}): Promise<WidgetData> {
    const shouldEmit = options.emit ?? true;
    const startedAt = Date.now();
    const beforeFingerprint = resultFingerprint(window.openai?.toolOutput);
    if (this.hostWindow !== window) {
      try {
        await this.initialize();
        const response = await this.request("tools/call", { name, arguments: args }, 20_000);
        let data = widgetDataFrom(response);
        if (!acceptsToolResult(name, data)) data = await this.awaitPushedResult(name, 10_000, beforeFingerprint, startedAt) ?? undefined;
        if (data) {
          if (shouldEmit) this.emit(data);
          return data;
        }
      } catch (bridgeError) {
        if (!window.openai?.callTool) throw bridgeError;
      }
    }
    if (window.openai?.callTool) {
      const response = await window.openai.callTool(name, args);
      let data = widgetDataFrom(response);
      if (!acceptsToolResult(name, data)) data = await this.awaitPushedResult(name, 10_000, beforeFingerprint, startedAt) ?? undefined;
      data = data ?? { view: "error", error: { code: "INTERNAL_ERROR", message: `No usable result was returned for ${name}.` } };
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
