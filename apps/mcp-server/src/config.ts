import { resolve } from "node:path";
import { LIVE_NETWORKS } from "@aifinpay/shared";
import type { LiveNetworkSpec, NetworkId } from "@aifinpay/shared";

export interface SettlementTrustedPin {
  target: string;
  /** EVM runtime code hash, or non-EVM artifact hash. */
  evidenceHash: string;
  /** Frozen reviewed source commit, 40-64 hex. */
  sourceCommit: string;
}
export type SettlementTrustedPins = Record<string, SettlementTrustedPin>;

export interface AppConfig {
  port: number;
  demoMode: boolean;
  databaseUrl: string;
  sessionSecret: string;
  publicUrl: string;
  widgetDomain: string;
  logLevel: string;
  walletMode: "demo" | "mainnet";
  polygonRpcUrls: string[];
  mainnetRpcUrls: Record<string, string[]>;
  mainnetRpcAuth: Record<string, string>;
  signingNetworks: NetworkId[];
  settlementApiOrigin: string;
  /** Independent wallet-side trust anchors, keyed `chain:AIFP-1|AIFP-2`. The
   * settlement API is not allowed to supply its own only trust anchor. */
  settlementPins?: SettlementTrustedPins;
  /** Explicit Casper execution payment. No guessed production gas budget. */
  casperSettlementPaymentMotes?: string;
  /** Maximum Aptos gas units the local wallet will sign for settlement. */
  aptosSettlementMaxGas?: string;
  changeNowApiKey?: string;
  analyticsDashboardToken?: string;
}

function parseRpcList(raw: string | undefined): string[] {
  return (raw ?? "").split(",").map((value) => value.trim()).filter(Boolean);
}

function loadMainnetRpcUrls(env: NodeJS.ProcessEnv, polygonRpcUrls: string[]): Record<string, string[]> {
  const overrides: Record<string, string[]> = {};
  for (const networkId of Object.keys(LIVE_NETWORKS)) {
    const list = parseRpcList(env[`${networkId}_RPC_URLS`]);
    if (list.length) overrides[networkId] = list;
  }
  if (!overrides.POLYGON && polygonRpcUrls.length) overrides.POLYGON = polygonRpcUrls;
  return overrides;
}

function loadMainnetRpcAuth(env: NodeJS.ProcessEnv): Record<string, string> {
  const auth: Record<string, string> = {};
  for (const networkId of Object.keys(LIVE_NETWORKS)) {
    const value = env[`${networkId}_RPC_AUTH`]?.trim();
    if (value) auth[networkId] = value;
  }
  return auth;
}

function loadSigningNetworks(env: NodeJS.ProcessEnv): NetworkId[] {
  const registry = LIVE_NETWORKS as Record<string, LiveNetworkSpec>;
  const requested = parseRpcList(env.AIFINPAY_SIGNING_NETWORKS);
  return requested.filter((id): id is NetworkId => {
    const family = registry[id]?.family;
    return family === "EVM" || family === "SOLANA" || family === "NEAR" || family === "APTOS" || family === "CASPER";
  });
}

function origin(raw: string | undefined, fallback: string): string {
  const value = (raw?.trim() || fallback).replace(/\/$/, "");
  const parsed = new URL(value);
  if (parsed.protocol !== "https:" && parsed.hostname !== "localhost" && parsed.hostname !== "127.0.0.1") {
    throw new Error("AIFINPAY_SETTLEMENT_API_ORIGIN must use HTTPS outside localhost");
  }
  return parsed.origin;
}

function loadSettlementPins(raw: string | undefined): SettlementTrustedPins | undefined {
  if (!raw?.trim()) return undefined;
  let parsed: unknown;
  try { parsed = JSON.parse(raw); }
  catch { throw new Error("AIFINPAY_TRUSTED_SETTLEMENT_PINS_JSON must be valid JSON"); }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("Settlement pins must be an object");
  const out: SettlementTrustedPins = {};
  for (const [key, value] of Object.entries(parsed as Record<string, unknown>)) {
    if (!/^[a-z0-9-]+:AIFP-[12]$/.test(key) || !value || typeof value !== "object" || Array.isArray(value)) {
      throw new Error(`Invalid settlement pin entry: ${key}`);
    }
    const pin = value as Record<string, unknown>;
    const target = String(pin.target ?? "").trim();
    const evidenceHash = String(pin.evidenceHash ?? "").replace(/^0x/, "").toLowerCase();
    const sourceCommit = String(pin.sourceCommit ?? "").toLowerCase();
    if (!target || !/^[0-9a-f]{64}$/.test(evidenceHash) || !/^[0-9a-f]{40,64}$/.test(sourceCommit)) {
      throw new Error(`Incomplete settlement pin: ${key}`);
    }
    out[key] = { target, evidenceHash, sourceCommit };
  }
  return out;
}

function positiveInteger(raw: string | undefined, name: string): string | undefined {
  if (!raw?.trim()) return undefined;
  if (!/^[1-9]\d*$/.test(raw.trim())) throw new Error(`${name} must be a positive integer`);
  return raw.trim();
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const demoMode = env.AIFINPAY_DEMO_MODE !== "false";
  const sessionSecret = env.SESSION_SECRET ?? (demoMode ? "demo-only-session-secret-change-before-production" : "");
  if (!sessionSecret || sessionSecret.length < 32) throw new Error("SESSION_SECRET must contain at least 32 characters");
  const renderOrigin = env.RENDER_EXTERNAL_URL?.replace(/\/$/, "")
    ?? (env.RENDER_EXTERNAL_HOSTNAME ? `https://${env.RENDER_EXTERNAL_HOSTNAME}` : undefined);
  const localOrigin = `http://localhost:${env.PORT ?? 8787}`;
  const polygonRpcUrls = parseRpcList(env.POLYGON_RPC_URLS ?? "https://polygon.drpc.org,https://polygon.publicnode.com");
  return {
    port: Number(env.PORT ?? 8787),
    demoMode,
    databaseUrl: env.DATABASE_URL === ":memory:" ? ":memory:" : resolve(env.DATABASE_URL ?? "./data/aifinpay-demo.sqlite"),
    sessionSecret,
    publicUrl: env.MCP_PUBLIC_URL ?? (renderOrigin ? `${renderOrigin}/mcp` : `${localOrigin}/mcp`),
    widgetDomain: env.WIDGET_PUBLIC_URL ?? renderOrigin ?? localOrigin,
    logLevel: env.LOG_LEVEL ?? "info",
    walletMode: env.AIFINPAY_WALLET_MODE === "demo" ? "demo" : "mainnet",
    polygonRpcUrls,
    mainnetRpcUrls: loadMainnetRpcUrls(env, polygonRpcUrls),
    mainnetRpcAuth: loadMainnetRpcAuth(env),
    signingNetworks: loadSigningNetworks(env),
    settlementApiOrigin: origin(env.AIFINPAY_SETTLEMENT_API_ORIGIN, "https://api.aifinpay.io"),
    ...(loadSettlementPins(env.AIFINPAY_TRUSTED_SETTLEMENT_PINS_JSON) ? { settlementPins: loadSettlementPins(env.AIFINPAY_TRUSTED_SETTLEMENT_PINS_JSON) } : {}),
    ...(positiveInteger(env.CASPER_SETTLEMENT_PAYMENT_MOTES, "CASPER_SETTLEMENT_PAYMENT_MOTES") ? { casperSettlementPaymentMotes: positiveInteger(env.CASPER_SETTLEMENT_PAYMENT_MOTES, "CASPER_SETTLEMENT_PAYMENT_MOTES") } : {}),
    ...(positiveInteger(env.APTOS_SETTLEMENT_MAX_GAS, "APTOS_SETTLEMENT_MAX_GAS") ? { aptosSettlementMaxGas: positiveInteger(env.APTOS_SETTLEMENT_MAX_GAS, "APTOS_SETTLEMENT_MAX_GAS") } : {}),
    ...(env.CHANGENOW_API_KEY?.trim() ? { changeNowApiKey: env.CHANGENOW_API_KEY.trim() } : {}),
    ...(env.ANALYTICS_DASHBOARD_TOKEN?.trim() && env.ANALYTICS_DASHBOARD_TOKEN.trim().length >= 16
      ? { analyticsDashboardToken: env.ANALYTICS_DASHBOARD_TOKEN.trim() } : {})
  };
}
