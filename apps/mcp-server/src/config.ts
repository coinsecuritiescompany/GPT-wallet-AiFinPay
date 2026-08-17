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

export const TREASURY_NETWORK_KEYS = [
  "polygon", "avalanche", "arbitrum", "bnb", "base", "unichain", "optimism",
  "botchain", "xrplevm", "solana", "near", "aptos", "casper",
] as const;
export type TreasuryNetworkKey = typeof TREASURY_NETWORK_KEYS[number];
export type TreasuryAddressPins = Record<TreasuryNetworkKey, string>;

export interface TreasuryAccountingConfig {
  enabled: boolean;
  /** Exact AiFinPay-controlled local treasury address for every product network. */
  addresses?: TreasuryAddressPins;
  /** Read-only snapshot interval. This service never signs or moves funds. */
  intervalSeconds: number;
}

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
  /** Independent wallet-side trust anchors, keyed `chain:AIFP-1|AIFP-2`. */
  settlementPins?: SettlementTrustedPins;
  /** Explicit Casper execution payment. No guessed production gas budget. */
  casperSettlementPaymentMotes?: string;
  /** Maximum Aptos gas units the local wallet will sign for settlement. */
  aptosSettlementMaxGas?: string;
  analyticsDashboardToken?: string;
  treasury: TreasuryAccountingConfig;
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

function validEvm(value: string): boolean { return /^0x[a-fA-F0-9]{40}$/.test(value) && !/^0x0{40}$/i.test(value); }
function validSolana(value: string): boolean { return /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(value); }
function validNear(value: string): boolean { return /^[a-z0-9._-]{2,64}$/.test(value) || /^[a-f0-9]{64}$/.test(value); }
function validAptos(value: string): boolean { return /^0x[a-fA-F0-9]{64}$/.test(value); }
function validCasper(value: string): boolean { return /^0(1[a-fA-F0-9]{64}|2[a-fA-F0-9]{66})$/.test(value); }

function loadTreasuryAddresses(raw: string | undefined): TreasuryAddressPins | undefined {
  if (!raw?.trim()) return undefined;
  let parsed: unknown;
  try { parsed = JSON.parse(raw); }
  catch { throw new Error("AIFINPAY_TREASURY_ADDRESSES_JSON must be valid JSON"); }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("Treasury addresses must be an object");
  const input = parsed as Record<string, unknown>;
  const allowed = new Set<string>(TREASURY_NETWORK_KEYS);
  for (const key of Object.keys(input)) if (!allowed.has(key)) throw new Error(`Unknown treasury network key: ${key}`);
  const out = {} as TreasuryAddressPins;
  for (const network of TREASURY_NETWORK_KEYS) {
    const value = String(input[network] ?? "").trim();
    if (!value) throw new Error(`Missing local treasury address for ${network}`);
    const valid = network === "solana" ? validSolana(value)
      : network === "near" ? validNear(value)
      : network === "aptos" ? validAptos(value)
      : network === "casper" ? validCasper(value)
      : validEvm(value);
    if (!valid) throw new Error(`Invalid local treasury address for ${network}`);
    out[network] = value;
  }
  return out;
}

function loadTreasuryConfig(env: NodeJS.ProcessEnv): TreasuryAccountingConfig {
  const enabled = env.AIFINPAY_TREASURY_ACCOUNTING_ENABLED === "true";
  const addresses = loadTreasuryAddresses(env.AIFINPAY_TREASURY_ADDRESSES_JSON);
  const intervalSeconds = Number(env.AIFINPAY_TREASURY_ACCOUNTING_INTERVAL_SECONDS ?? 900);
  if (!Number.isInteger(intervalSeconds) || intervalSeconds < 60 || intervalSeconds > 86_400) {
    throw new Error("AIFINPAY_TREASURY_ACCOUNTING_INTERVAL_SECONDS must be 60..86400");
  }
  if (enabled && !addresses) throw new Error("Treasury accounting requires AIFINPAY_TREASURY_ADDRESSES_JSON with all 13 local treasuries");
  return { enabled, ...(addresses ? { addresses } : {}), intervalSeconds };
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const demoMode = env.AIFINPAY_DEMO_MODE !== "false";
  const sessionSecret = env.SESSION_SECRET ?? (demoMode ? "demo-only-session-secret-change-before-production" : "");
  if (!sessionSecret || sessionSecret.length < 32) throw new Error("SESSION_SECRET must contain at least 32 characters");
  const renderOrigin = env.RENDER_EXTERNAL_URL?.replace(/\/$/, "")
    ?? (env.RENDER_EXTERNAL_HOSTNAME ? `https://${env.RENDER_EXTERNAL_HOSTNAME}` : undefined);
  const localOrigin = `http://localhost:${env.PORT ?? 8787}`;
  const polygonRpcUrls = parseRpcList(env.POLYGON_RPC_URLS ?? "https://polygon.drpc.org,https://polygon.publicnode.com");
  const settlementPins = loadSettlementPins(env.AIFINPAY_TRUSTED_SETTLEMENT_PINS_JSON);
  const casperPayment = positiveInteger(env.CASPER_SETTLEMENT_PAYMENT_MOTES, "CASPER_SETTLEMENT_PAYMENT_MOTES");
  const aptosGas = positiveInteger(env.APTOS_SETTLEMENT_MAX_GAS, "APTOS_SETTLEMENT_MAX_GAS");
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
    ...(settlementPins ? { settlementPins } : {}),
    ...(casperPayment ? { casperSettlementPaymentMotes: casperPayment } : {}),
    ...(aptosGas ? { aptosSettlementMaxGas: aptosGas } : {}),
    ...(env.ANALYTICS_DASHBOARD_TOKEN?.trim() && env.ANALYTICS_DASHBOARD_TOKEN.trim().length >= 16
      ? { analyticsDashboardToken: env.ANALYTICS_DASHBOARD_TOKEN.trim() } : {}),
    treasury: loadTreasuryConfig(env),
  };
}
