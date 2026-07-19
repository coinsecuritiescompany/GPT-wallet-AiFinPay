export const NETWORKS = {
  POLYGON: {
    id: "POLYGON",
    label: "Polygon",
    chainId: 137,
    nativeToken: "POL",
    explorerBaseUrl: "https://polygonscan.com",
    confirmations: 64
  },
  POLYGON_AMOY: {
    id: "POLYGON_AMOY",
    label: "Polygon Amoy",
    chainId: 80002,
    nativeToken: "POL",
    explorerBaseUrl: "https://amoy.polygonscan.com",
    confirmations: 2
  }
} as const;

export type MainnetFamily = "EVM" | "SOLANA" | "NEAR" | "APTOS" | "CASPER";

export interface MainnetDeployment {
  name: "AiFinPayCore" | "B2BSplitter" | "Program" | "Contract" | "Module";
  address: string;
  moduleName?: string;
  status: "DEPLOYED_UNVERIFIED" | "ONCHAIN_CODE_CONFIRMED";
}

export interface MainnetNetwork {
  label: string;
  family: MainnetFamily;
  chainId: number | null;
  nativeToken: string;
  rpcUrl: string;
  explorerBaseUrl: string;
  mode: string;
  enabledForSigning: boolean;
  deployment: MainnetDeployment;
}

// Public deployment metadata only. Live RPC checks on 2026-07-18 confirmed code
// at every identifier, but registry entries stay "DEPLOYED_UNVERIFIED" until
// ABI/source, proxy/admin roles and release equivalence are reviewed as well.
export const MAINNET_NETWORKS = {
  polygon: { label: "Polygon", family: "EVM", chainId: 137, nativeToken: "POL", rpcUrl: "https://polygon.drpc.org", explorerBaseUrl: "https://polygonscan.com", mode: "FULL_CORE", enabledForSigning: false, deployment: { name: "AiFinPayCore", address: "0x1071Bb1C827223D3D0115B0e1f114adAb9ceB94f", status: "DEPLOYED_UNVERIFIED" } },
  avalanche: { label: "Avalanche C-Chain", family: "EVM", chainId: 43114, nativeToken: "AVAX", rpcUrl: "https://api.avax.network/ext/bc/C/rpc", explorerBaseUrl: "https://snowtrace.io", mode: "FULL_CORE", enabledForSigning: false, deployment: { name: "AiFinPayCore", address: "0x147d8ff8c027e24303b5b99cbc8843e1d3df94cc", status: "DEPLOYED_UNVERIFIED" } },
  arbitrum: { label: "Arbitrum One", family: "EVM", chainId: 42161, nativeToken: "ETH", rpcUrl: "https://arb1.arbitrum.io/rpc", explorerBaseUrl: "https://arbiscan.io", mode: "FULL_CORE", enabledForSigning: false, deployment: { name: "AiFinPayCore", address: "0x147d8ff8c027e24303b5b99cbc8843e1d3df94cc", status: "DEPLOYED_UNVERIFIED" } },
  bnb: { label: "BNB Chain", family: "EVM", chainId: 56, nativeToken: "BNB", rpcUrl: "https://bsc-dataseed.binance.org", explorerBaseUrl: "https://bscscan.com", mode: "FULL_CORE", enabledForSigning: false, deployment: { name: "AiFinPayCore", address: "0x29e7519C653E1b383e8Be74675666bbA51bAb542", status: "DEPLOYED_UNVERIFIED" } },
  base: { label: "Base", family: "EVM", chainId: 8453, nativeToken: "ETH", rpcUrl: "https://mainnet.base.org", explorerBaseUrl: "https://basescan.org", mode: "FULL_CORE", enabledForSigning: false, deployment: { name: "AiFinPayCore", address: "0xF03B3387415D557b6ab709D06E8aF0b4ABD6Eb74", status: "DEPLOYED_UNVERIFIED" } },
  unichain: { label: "Unichain", family: "EVM", chainId: 130, nativeToken: "ETH", rpcUrl: "https://mainnet.unichain.org", explorerBaseUrl: "https://uniscan.xyz", mode: "FULL_CORE", enabledForSigning: false, deployment: { name: "AiFinPayCore", address: "0x493dc0e34f13b2fd50bab7156d3850f3b86c6f53", status: "DEPLOYED_UNVERIFIED" } },
  optimism: { label: "Optimism", family: "EVM", chainId: 10, nativeToken: "ETH", rpcUrl: "https://mainnet.optimism.io", explorerBaseUrl: "https://optimistic.etherscan.io", mode: "SPLITTER_ONLY", enabledForSigning: false, deployment: { name: "B2BSplitter", address: "0xee92807decaa3a02f1e165dd7efcd92ab9aa83cb", status: "DEPLOYED_UNVERIFIED" } },
  botchain: { label: "BOT Chain", family: "EVM", chainId: 677, nativeToken: "BOT", rpcUrl: "https://rpc.botchain.ai", explorerBaseUrl: "https://scan.botchain.ai", mode: "SPLITTER_ONLY_RESTRICTED", enabledForSigning: false, deployment: { name: "B2BSplitter", address: "0x271870ABb6e6756D97191eBdb27C1873911bb587", status: "DEPLOYED_UNVERIFIED" } },
  xrplevm: { label: "XRPL EVM", family: "EVM", chainId: 1440000, nativeToken: "XRP", rpcUrl: "https://rpc.xrplevm.org", explorerBaseUrl: "https://explorer.xrplevm.org", mode: "SPLITTER_ONLY_RESTRICTED", enabledForSigning: false, deployment: { name: "B2BSplitter", address: "0xeE92807decAa3A02F1e165dd7Efcd92ab9aA83CB", status: "DEPLOYED_UNVERIFIED" } },
  solana: { label: "Solana", family: "SOLANA", chainId: null, nativeToken: "SOL", rpcUrl: "https://api.mainnet-beta.solana.com", explorerBaseUrl: "https://solscan.io", mode: "FULL_CORE", enabledForSigning: false, deployment: { name: "Program", address: "5g9zWHF1Vv6GiGpA2ZbJQbSCDZd5hAk9AyvabRJvKFx2", status: "DEPLOYED_UNVERIFIED" } },
  near: { label: "NEAR", family: "NEAR", chainId: null, nativeToken: "NEAR", rpcUrl: "https://rpc.mainnet.near.org", explorerBaseUrl: "https://nearblocks.io", mode: "SPLITTER_MVP", enabledForSigning: false, deployment: { name: "Contract", address: "548178623b44c06b5312a415f260e5fe2a2a7c5cc5704b19cbee1d094e7b78eb", status: "DEPLOYED_UNVERIFIED" } },
  aptos: { label: "Aptos", family: "APTOS", chainId: 1, nativeToken: "APT", rpcUrl: "https://fullnode.mainnet.aptoslabs.com/v1", explorerBaseUrl: "https://explorer.aptoslabs.com", mode: "SPLITTER_MVP", enabledForSigning: false, deployment: { name: "Module", address: "0xc5feda4075a4f138a5b4e293a8bd41b9e37b76e5553ff35ee6131f4f046d27fd", moduleName: "splitter", status: "DEPLOYED_UNVERIFIED" } },
  casper: { label: "Casper", family: "CASPER", chainId: null, nativeToken: "CSPR", rpcUrl: "https://node.mainnet.cspr.cloud/rpc", explorerBaseUrl: "https://cspr.live", mode: "FULL_CORE", enabledForSigning: false, deployment: { name: "Contract", address: "9903a5e3948e799196df54b17270bc6769338ac1cc36c9eb47e113f88d23f019", status: "DEPLOYED_UNVERIFIED" } }
} as const satisfies Record<string, MainnetNetwork>;

export const TOKENS = {
  USDC: { symbol: "USDC", decimals: 6, address: "0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359" },
  POL: { symbol: "POL", decimals: 18, address: null }
} as const;

// ---------------------------------------------------------------------------
// Live read-only network registry.
//
// This is the single source of truth the read-only balance adapter uses to
// resolve, per network: which key family the address comes from, which public
// RPC endpoints to try, the native token (symbol + decimals) and — where a
// canonical Circle USDC contract was verified on-chain — the stablecoin.
//
// USDC contracts and decimals below were each confirmed on 2026-07-19 by
// reading symbol() and decimals() from the live contract. Chains without a
// verified `usdc` entry expose the native balance only (never a placeholder).
// ---------------------------------------------------------------------------
export type AddressFamily = "evm" | "solana" | "near" | "aptos" | "casper";
export interface NativeTokenSpec { symbol: string; decimals: number }
export interface UsdcSpec { address: string; decimals: number }

export interface LiveNetworkSpec {
  label: string;
  family: MainnetFamily;
  chainId: number | null;
  rpcUrls: string[];
  explorerBaseUrl: string;
  addressField: AddressFamily;
  native: NativeTokenSpec;
  usdc?: UsdcSpec;
  isTestnet?: boolean;
  // True when the default RPC endpoint needs an Authorization key (set via
  // <NETWORK>_RPC_AUTH). Used by Casper's key-gated mainnet node.
  requiresAuth?: boolean;
}

export const LIVE_NETWORKS = {
  POLYGON: { label: "Polygon", family: "EVM", chainId: 137, addressField: "evm", explorerBaseUrl: "https://polygonscan.com",
    rpcUrls: ["https://polygon.drpc.org", "https://polygon-bor-rpc.publicnode.com"],
    native: { symbol: "POL", decimals: 18 }, usdc: { address: "0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359", decimals: 6 } },
  AVALANCHE: { label: "Avalanche C-Chain", family: "EVM", chainId: 43114, addressField: "evm", explorerBaseUrl: "https://snowtrace.io",
    rpcUrls: ["https://api.avax.network/ext/bc/C/rpc", "https://avalanche-c-chain-rpc.publicnode.com"],
    native: { symbol: "AVAX", decimals: 18 }, usdc: { address: "0xB97EF9Ef8734C71904D8002F8b6Bc66Dd9c48a6E", decimals: 6 } },
  ARBITRUM: { label: "Arbitrum One", family: "EVM", chainId: 42161, addressField: "evm", explorerBaseUrl: "https://arbiscan.io",
    rpcUrls: ["https://arb1.arbitrum.io/rpc", "https://arbitrum-one-rpc.publicnode.com"],
    native: { symbol: "ETH", decimals: 18 }, usdc: { address: "0xaf88d065e77c8cC2239327C5EDb3A432268e5831", decimals: 6 } },
  BNB: { label: "BNB Chain", family: "EVM", chainId: 56, addressField: "evm", explorerBaseUrl: "https://bscscan.com",
    rpcUrls: ["https://bsc-dataseed.binance.org", "https://bsc-rpc.publicnode.com"],
    native: { symbol: "BNB", decimals: 18 }, usdc: { address: "0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d", decimals: 18 } },
  BASE: { label: "Base", family: "EVM", chainId: 8453, addressField: "evm", explorerBaseUrl: "https://basescan.org",
    rpcUrls: ["https://mainnet.base.org", "https://base-rpc.publicnode.com"],
    native: { symbol: "ETH", decimals: 18 }, usdc: { address: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913", decimals: 6 } },
  UNICHAIN: { label: "Unichain", family: "EVM", chainId: 130, addressField: "evm", explorerBaseUrl: "https://uniscan.xyz",
    rpcUrls: ["https://mainnet.unichain.org", "https://unichain-rpc.publicnode.com"],
    native: { symbol: "ETH", decimals: 18 } },
  OPTIMISM: { label: "Optimism", family: "EVM", chainId: 10, addressField: "evm", explorerBaseUrl: "https://optimistic.etherscan.io",
    rpcUrls: ["https://mainnet.optimism.io", "https://optimism-rpc.publicnode.com"],
    native: { symbol: "ETH", decimals: 18 }, usdc: { address: "0x0b2C639c533813f4Aa9D7837CAf62653d097Ff85", decimals: 6 } },
  BOTCHAIN: { label: "BOT Chain", family: "EVM", chainId: 677, addressField: "evm", explorerBaseUrl: "https://scan.botchain.ai",
    rpcUrls: ["https://rpc.botchain.ai"],
    native: { symbol: "BOT", decimals: 18 } },
  XRPLEVM: { label: "XRPL EVM", family: "EVM", chainId: 1440000, addressField: "evm", explorerBaseUrl: "https://explorer.xrplevm.org",
    rpcUrls: ["https://rpc.xrplevm.org"],
    native: { symbol: "XRP", decimals: 18 } },
  SOLANA: { label: "Solana", family: "SOLANA", chainId: null, addressField: "solana", explorerBaseUrl: "https://solscan.io",
    rpcUrls: ["https://api.mainnet-beta.solana.com"],
    native: { symbol: "SOL", decimals: 9 } },
  NEAR: { label: "NEAR", family: "NEAR", chainId: null, addressField: "near", explorerBaseUrl: "https://nearblocks.io",
    rpcUrls: ["https://rpc.mainnet.near.org", "https://free.rpc.fastnear.com"],
    native: { symbol: "NEAR", decimals: 24 } },
  APTOS: { label: "Aptos", family: "APTOS", chainId: 1, addressField: "aptos", explorerBaseUrl: "https://explorer.aptoslabs.com",
    rpcUrls: ["https://fullnode.mainnet.aptoslabs.com/v1"],
    native: { symbol: "APT", decimals: 8 } },
  // Casper 2.0 mainnet. Balances read via the query_balance JSON-RPC method
  // (main_purse_under_public_key). Casper's reliable mainnet RPC is API-key
  // gated, so set CASPER_RPC_URLS + CASPER_RPC_AUTH in the deployment env; the
  // default endpoint below expects an Authorization key. CSPR uses 9 decimals
  // (motes). No canonical USDC on Casper — native CSPR only.
  CASPER: { label: "Casper", family: "CASPER", chainId: null, addressField: "casper", explorerBaseUrl: "https://cspr.live",
    rpcUrls: ["https://node.mainnet.cspr.cloud/rpc"], requiresAuth: true,
    native: { symbol: "CSPR", decimals: 9 } }
} as const satisfies Record<string, LiveNetworkSpec>;

// The 13 mainnet networks the read-only balance layer serves.
export const MAINNET_NETWORK_IDS = [
  "POLYGON", "AVALANCHE", "ARBITRUM", "BNB", "BASE", "UNICHAIN",
  "OPTIMISM", "BOTCHAIN", "XRPLEVM", "SOLANA", "NEAR", "APTOS", "CASPER"
] as const;

// Chain id + explorer for any network, spanning the demo/testnet map (NETWORKS)
// and the 12 live mainnets (LIVE_NETWORKS). Falls back to Polygon.
export function networkMeta(id: string): { chainId: number; explorerBaseUrl: string } {
  const legacy = (NETWORKS as Record<string, { chainId: number; explorerBaseUrl: string }>)[id];
  if (legacy) return { chainId: legacy.chainId, explorerBaseUrl: legacy.explorerBaseUrl };
  const live = (LIVE_NETWORKS as Record<string, LiveNetworkSpec>)[id];
  if (live) return { chainId: live.chainId ?? 0, explorerBaseUrl: live.explorerBaseUrl };
  return { chainId: NETWORKS.POLYGON.chainId, explorerBaseUrl: NETWORKS.POLYGON.explorerBaseUrl };
}

export const DEMO_USER_ID = "demo-user-001";
export const DEMO_WALLET_ID = "wallet-demo-001";
export const DEMO_WALLET_ADDRESS = "0xA1F1A1000000000000000000000000000000D3F0";
export const DEMO_AGENT_ID = "research-agent";
