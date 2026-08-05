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
        const pushed = message.params?.structuredContent ?? message.params;
        // The host may deliver a tool's result here rather than in the call's
        // own response. Keep the latest so a viewless response can use it.
        if (pushed?.view) {
          this.lastPushed = { data: pushed, at: Date.now() };
          this.pushWaiters.splice(0).forEach((resolve) => resolve(pushed));
        }
        this.emit(pushed);
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

  /**
   * Tools that carry an output template are rendered by the host, which may
   * return an empty acknowledgement to the caller and deliver the real payload
   * as a tool-result notification instead. Treating the empty response as the
   * answer makes a working transfer look like a dead button, so wait briefly
   * for the push before concluding anything.
   */
  private awaitPushedResult(timeoutMs = 6_000, since?: WidgetData): Promise<WidgetData | null> {
    if (this.lastPushed && Date.now() - this.lastPushed.at < timeoutMs) {
      return Promise.resolve(this.lastPushed.data);
    }
    return new Promise((resolve) => {
      let settled = false;
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

      // The result can reach a widget three different ways depending on the
      // host build, so watch all of them rather than assume one.
      //   1. a ui/notifications/tool-result push (desktop MCP Apps path)
      //   2. window.openai.toolOutput being replaced, announced by an event
      //   3. the same global changing with no event at all, seen on mobile
      //      builds that expose the compatibility API but never complete the
      //      postMessage handshake
      const fresh = (): WidgetData | null => {
        const output = window.openai?.toolOutput;
        if (!output?.view) return null;
        return output === since ? null : output;
      };

      const waiter = (data: WidgetData) => finish(data);
      this.pushWaiters.push(waiter);

      const onGlobals = () => { const data = fresh(); if (data) finish(data); };
      window.addEventListener("openai:set_globals", onGlobals);

      const poller = window.setInterval(() => { const data = fresh(); if (data) finish(data); }, 150);
      const timer = window.setTimeout(() => finish(null), timeoutMs);
    });
  }

  subscribe(listener: Listener): () => void { this.listeners.add(listener); return () => this.listeners.delete(listener); }

  async callTool(name: string, args: Record<string, unknown>, options: { emit?: boolean } = {}): Promise<WidgetData> {
    const shouldEmit = options.emit ?? true;
    // Remember the global as it stands, so a value left over from an earlier
    // call is never mistaken for the answer to this one.
    const before = window.openai?.toolOutput;
    if (this.hostWindow !== window) {
      try {
        await this.initialize();
        const response = await this.request("tools/call", { name, arguments: args }, 20_000) as { structuredContent?: WidgetData };
        let data = response.structuredContent ?? response as unknown as WidgetData;
        if (!data?.view) {
          const pushed = await this.awaitPushedResult(6_000, before);
          if (pushed) return pushed;
        }
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
      let data = response.structuredContent as WidgetData | undefined;
      if (!data?.view) {
        const pushed = await this.awaitPushedResult(6_000, before);
        if (pushed) return pushed;
      }
      data = data ?? { view: "error", error: { code: "INTERNAL_ERROR", message: "Tool returned no data." } };
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
