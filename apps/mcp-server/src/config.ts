import { resolve } from "node:path";
import { LIVE_NETWORKS } from "@aifinpay/shared";
import type { LiveNetworkSpec, NetworkId } from "@aifinpay/shared";

export interface TrustedAifp1Route {
  network: NetworkId;
  chainId: number;
  contract: string;
  runtimeCodeHash: string;
  selector: string;
  routeClass: "merchant-aifp1";
  splitterVersion: "1.3";
  economicsProfile: "AIFP-1:100/0:gross";
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
  aifp1TrustedRoutes: TrustedAifp1Route[];
  aifp1MaxGrossUsd: number;
  changeNowApiKey?: string;
  /** Bearer token for the internal analytics dashboard; unset disables it. */
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

// Only chain families with a complete local signer, exact validator and
// broadcaster may be enabled.
function loadSigningNetworks(env: NodeJS.ProcessEnv): NetworkId[] {
  const registry = LIVE_NETWORKS as Record<string, LiveNetworkSpec>;
  const requested = parseRpcList(env.AIFINPAY_SIGNING_NETWORKS);
  return requested.filter((id): id is NetworkId => {
    const family = registry[id]?.family;
    return family === "EVM" || family === "SOLANA" || family === "NEAR" || family === "APTOS" || family === "CASPER";
  });
}

function loadAifp1TrustedRoutes(env: NodeJS.ProcessEnv): TrustedAifp1Route[] {
  const raw = env.AIFP1_TRUSTED_ROUTES_JSON?.trim();
  if (!raw) return [];
  let parsed: unknown;
  try { parsed = JSON.parse(raw); }
  catch { throw new Error("AIFP1_TRUSTED_ROUTES_JSON must be valid JSON"); }
  if (!Array.isArray(parsed)) throw new Error("AIFP1_TRUSTED_ROUTES_JSON must be a JSON array");
  const networks = LIVE_NETWORKS as Record<string, LiveNetworkSpec>;
  return parsed.map((entry, index): TrustedAifp1Route => {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) throw new Error(`AIFP1 trusted route ${index} is invalid`);
    const item = entry as Record<string, unknown>;
    const network = String(item.network ?? "") as NetworkId;
    const spec = networks[network];
    const chainId = Number(item.chainId);
    const contract = String(item.contract ?? "").toLowerCase();
    const runtimeCodeHash = String(item.runtimeCodeHash ?? "").toLowerCase();
    const selector = String(item.selector ?? "").toLowerCase();
    if (!spec || spec.family !== "EVM" || !Number.isInteger(chainId) || chainId <= 0 || spec.chainId !== chainId) {
      throw new Error(`AIFP1 trusted route ${index} has an invalid EVM network/chainId`);
    }
    if (!/^0x[0-9a-f]{40}$/.test(contract)) throw new Error(`AIFP1 trusted route ${index} has an invalid contract`);
    if (!/^0x[0-9a-f]{64}$/.test(runtimeCodeHash)) throw new Error(`AIFP1 trusted route ${index} has an invalid runtimeCodeHash`);
    if (!/^0x[0-9a-f]{8}$/.test(selector)) throw new Error(`AIFP1 trusted route ${index} has an invalid selector`);
    if (item.routeClass !== "merchant-aifp1" || item.splitterVersion !== "1.3" || item.economicsProfile !== "AIFP-1:100/0:gross") {
      throw new Error(`AIFP1 trusted route ${index} must be merchant-aifp1 / v1.3 / AIFP-1:100/0:gross`);
    }
    return {
      network,
      chainId,
      contract,
      runtimeCodeHash,
      selector,
      routeClass: "merchant-aifp1",
      splitterVersion: "1.3",
      economicsProfile: "AIFP-1:100/0:gross"
    };
  });
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const demoMode = env.AIFINPAY_DEMO_MODE !== "false";
  const sessionSecret = env.SESSION_SECRET ?? (demoMode ? "demo-only-session-secret-change-before-production" : "");
  if (!sessionSecret || sessionSecret.length < 32) throw new Error("SESSION_SECRET must contain at least 32 characters");
  const renderOrigin = env.RENDER_EXTERNAL_URL?.replace(/\/$/, "")
    ?? (env.RENDER_EXTERNAL_HOSTNAME ? `https://${env.RENDER_EXTERNAL_HOSTNAME}` : undefined);
  const localOrigin = `http://localhost:${env.PORT ?? 8787}`;
  const polygonRpcUrls = parseRpcList(env.POLYGON_RPC_URLS ?? "https://polygon.drpc.org,https://polygon.publicnode.com");
  const aifp1MaxGrossUsd = Number(env.AIFP1_MAX_GROSS_USD ?? "1");
  if (!Number.isFinite(aifp1MaxGrossUsd) || aifp1MaxGrossUsd <= 0 || aifp1MaxGrossUsd > 1000) {
    throw new Error("AIFP1_MAX_GROSS_USD must be a positive number not greater than 1000");
  }
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
    aifp1TrustedRoutes: loadAifp1TrustedRoutes(env),
    aifp1MaxGrossUsd,
    ...(env.CHANGENOW_API_KEY?.trim() ? { changeNowApiKey: env.CHANGENOW_API_KEY.trim() } : {}),
    ...(env.ANALYTICS_DASHBOARD_TOKEN?.trim() && env.ANALYTICS_DASHBOARD_TOKEN.trim().length >= 16
      ? { analyticsDashboardToken: env.ANALYTICS_DASHBOARD_TOKEN.trim() } : {})
  };
}
