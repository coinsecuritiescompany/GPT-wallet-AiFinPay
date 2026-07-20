import { resolve } from "node:path";
import { LIVE_NETWORKS } from "@aifinpay/shared";
import type { LiveNetworkSpec, NetworkId } from "@aifinpay/shared";

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
  // Networks on which local Vault signing + broadcast is switched on, from
  // AIFINPAY_SIGNING_NETWORKS (comma list, e.g. "POLYGON"). Empty = every
  // network stays send-locked, which is the safe default for production.
  signingNetworks: NetworkId[];
}

function parseRpcList(raw: string | undefined): string[] {
  return (raw ?? "").split(",").map((value) => value.trim()).filter(Boolean);
}

// Optional per-network RPC overrides, e.g. BASE_RPC_URLS="https://a,https://b".
// Any network left unset falls back to the public defaults in LIVE_NETWORKS.
function loadMainnetRpcUrls(env: NodeJS.ProcessEnv, polygonRpcUrls: string[]): Record<string, string[]> {
  const overrides: Record<string, string[]> = {};
  for (const networkId of Object.keys(LIVE_NETWORKS)) {
    const list = parseRpcList(env[`${networkId}_RPC_URLS`]);
    if (list.length) overrides[networkId] = list;
  }
  if (!overrides.POLYGON && polygonRpcUrls.length) overrides.POLYGON = polygonRpcUrls;
  return overrides;
}

// Optional per-network RPC Authorization header, e.g. CASPER_RPC_AUTH="<api-key>".
// Needed for key-gated nodes (Casper mainnet). Sent verbatim as the
// Authorization header on that network's JSON-RPC requests.
function loadMainnetRpcAuth(env: NodeJS.ProcessEnv): Record<string, string> {
  const auth: Record<string, string> = {};
  for (const networkId of Object.keys(LIVE_NETWORKS)) {
    const value = env[`${networkId}_RPC_AUTH`]?.trim();
    if (value) auth[networkId] = value;
  }
  return auth;
}

// Only EVM networks can be locally signed today (viem EIP-1559 path). A network
// listed here that is unknown or non-EVM is ignored with no send enabled, so a
// typo can never silently open an unintended chain.
function loadSigningNetworks(env: NodeJS.ProcessEnv): NetworkId[] {
  const registry = LIVE_NETWORKS as Record<string, LiveNetworkSpec>;
  const requested = parseRpcList(env.AIFINPAY_SIGNING_NETWORKS);
  return requested.filter((id): id is NetworkId => registry[id]?.family === "EVM");
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
    signingNetworks: loadSigningNetworks(env)
  };
}
