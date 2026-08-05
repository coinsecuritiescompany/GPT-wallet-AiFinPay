import type { WidgetData } from "../types.js";

type Listener = (data: WidgetData) => void;
interface Pending {
  resolve: (value: any) => void;
  reject: (reason: unknown) => void;
  timer: ReturnType<typeof window.setTimeout>;
}

// toolResponseMetadata is the canonical ChatGPT field containing the full MCP
// result envelope. Android can update this field without updating toolOutput.
const HOST_RESULT_KEYS = ["toolOutput", "toolResponseMetadata", "toolResult", "toolResponse", "output"] as const;

function widgetDataFrom(value: unknown): WidgetData | undefined {
  if (!value || typeof value !== "object") return undefined;
  const record = value as Record<string, unknown>;
  if (typeof record.view === "string" && record.view) return record as unknown as WidgetData;
  for (const key of [
    "structuredContent", "result", "data", "output", "toolResult", "toolResponse",
    // ChatGPT exposes the full tool envelope under these metadata fields.
    "call_tool_result", "mcp_tool_result"
  ]) {
    const candidate = widgetDataFrom(record[key]);
    if (candidate) return candidate;
  }
  return undefined;
}

function hostResultValues(): unknown[] {
  const openai = window.openai as unknown as Record<string, unknown> | undefined;
  if (!openai) return [];
  return HOST_RESULT_KEYS.map((key) => openai[key]);
}

/** Normalize every host shape observed on desktop and Android before React mounts. */
export function hostWidgetData(): WidgetData | undefined {
  for (const value of hostResultValues()) {
    const candidate = widgetDataFrom(value);
    if (candidate) return candidate;
  }
  return undefined;
}

function resultFingerprint(value: unknown): string {
  const data = widgetDataFrom(value);
  if (!data) return "";
  try { return JSON.stringify(data); }
  catch {
    const record = data as unknown as Record<string, unknown>;
    return `${data.view}:${String(record.intent ?? "")}`;
  }
}

/** Snapshot every Android/desktop result slot, including the canonical metadata envelope. */
export function hostResultFingerprint(): string {
  return hostResultValues().map(resultFingerprint).join("|");
}

function expectedViewsForTool(name: string): Set<string> | null {
  if (name === "open_wallet" || name === "open_wallet_current" || name === "create_wallet_pairing" || name === "get_wallet_summary") {
    return new Set(["wallet", "error", "not-connected"]);
  }
  if ((name.startsWith("prepare_") && name.endsWith("_transfer")) || name === "prepare_transfer") {
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

function mobileHandoffPrompt(name: string, args: Record<string, unknown>): string | null {
  if (name !== "prepare_casper_transfer") return null;
  const recipient = typeof args.recipient === "string" ? args.recipient : "";
  const amount = typeof args.amount === "string" ? args.amount : "";
  const idempotencyKey = typeof args.idempotencyKey === "string" ? args.idempotencyKey : "";
  if (!recipient || !amount || !idempotencyKey) return null;
  return [
    "Prepare this AiFinPay Casper transfer now and render the transfer review widget.",
    `Call prepare_casper_transfer with recipient=${recipient}, amount=${amount}, idempotencyKey=${idempotencyKey}.`,
    "The wallet UI may already have initiated the same request, so reuse the exact idempotency key and do not create a second payment.",
    "Do not submit or broadcast anything. Wait for me to open the AiFinPay Vault, review, enter my password, and sign locally."
  ].join(" ");
}

export class McpAppsBridge {
  private rpcId = 0;
  private readonly pending = new Map<number, Pending>();
  private readonly listeners = new Set<Listener>();
  private ready: Promise<void> | null = null;
  private lastPushed: { data: WidgetData; at: number } | null = null;
  private readonly pushWaiters: Array<(data: WidgetData) => void> = [];
  private stopResizeObserver: (() => void) | null = null;
  private activeTool: string | null = null;

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
          if (!this.activeTool || acceptsToolResult(this.activeTool, pushed)) this.emit(pushed);
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
        if (hostResultFingerprint() === beforeFingerprint) return null;
        for (const value of hostResultValues()) {
          const data = widgetDataFrom(value);
          if (acceptsToolResult(name, data)) return data;
        }
        return null;
      };
      const waiter = (data: WidgetData) => { if (acceptsToolResult(name, data)) finish(data); };
      this.pushWaiters.push(waiter);
      const onGlobals = () => { const data = fresh(); if (data) finish(data); };
      window.addEventListener("openai:set_globals", onGlobals);
      poller = window.setInterval(() => { const data = fresh(); if (data) finish(data); }, 100);
      timer = window.setTimeout(() => finish(null), timeoutMs);
    });
  }

  private async handoffMissingResult(name: string, args: Record<string, unknown>): Promise<WidgetData | null> {
    const prompt = mobileHandoffPrompt(name, args);
    if (!prompt) return null;
    if (window.openai?.sendFollowUpMessage) {
      await window.openai.sendFollowUpMessage({ prompt });
    } else if (this.hostWindow !== window) {
      this.notify("ui/message", { role: "user", content: [{ type: "text", text: prompt }] });
    } else {
      return null;
    }
    return {
      view: "error",
      error: {
        code: "MOBILE_HANDOFF",
        message: "Mobile ChatGPT did not return the tool result to this card. The same idempotent transfer has been handed off to the chat; use the new review card below. Nothing has been broadcast."
      }
    };
  }

  subscribe(listener: Listener): () => void { this.listeners.add(listener); return () => this.listeners.delete(listener); }

  async callTool(name: string, args: Record<string, unknown>, options: { emit?: boolean } = {}): Promise<WidgetData> {
    const shouldEmit = options.emit ?? true;
    const startedAt = Date.now();
    const beforeFingerprint = hostResultFingerprint();
    this.activeTool = name;
    try {
      if (window.openai?.callTool) {
        const response = await window.openai.callTool(name, args);
        let data = widgetDataFrom(response);
        if (!acceptsToolResult(name, data)) {
          data = await this.awaitPushedResult(name, 12_000, beforeFingerprint, startedAt) ?? undefined;
        }
        if (!data) {
          const handoff = await this.handoffMissingResult(name, args);
          if (handoff) return handoff;
        }
        data = data ?? { view: "error", error: { code: "INTERNAL_ERROR", message: `No usable result was returned for ${name}.` } };
        if (shouldEmit) this.emit(data);
        return data;
      }

      if (this.hostWindow !== window) {
        await this.initialize();
        const response = await this.request("tools/call", { name, arguments: args }, 30_000);
        let data = widgetDataFrom(response);
        if (!acceptsToolResult(name, data)) {
          data = await this.awaitPushedResult(name, 12_000, beforeFingerprint, startedAt) ?? undefined;
        }
        if (!data) {
          const handoff = await this.handoffMissingResult(name, args);
          if (handoff) return handoff;
        }
        data = data ?? { view: "error", error: { code: "INTERNAL_ERROR", message: `No usable result was returned for ${name}.` } };
        if (shouldEmit) this.emit(data);
        return data;
      }

      throw new Error("MCP Apps bridge is available only inside ChatGPT or another compatible host.");
    } finally {
      if (this.activeTool === name) this.activeTool = null;
    }
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