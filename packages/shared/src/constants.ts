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

export const MAINNET_NETWORKS = {
  polygon: { label: "Polygon", family: "EVM", chainId: 137, nativeToken: "POL", explorerBaseUrl: "https://polygonscan.com", mode: "FULL_CORE", enabledForSigning: false },
  avalanche: { label: "Avalanche C-Chain", family: "EVM", chainId: 43114, nativeToken: "AVAX", explorerBaseUrl: "https://snowtrace.io", mode: "FULL_CORE", enabledForSigning: false },
  arbitrum: { label: "Arbitrum One", family: "EVM", chainId: 42161, nativeToken: "ETH", explorerBaseUrl: "https://arbiscan.io", mode: "FULL_CORE", enabledForSigning: false },
  bnb: { label: "BNB Chain", family: "EVM", chainId: 56, nativeToken: "BNB", explorerBaseUrl: "https://bscscan.com", mode: "FULL_CORE", enabledForSigning: false },
  base: { label: "Base", family: "EVM", chainId: 8453, nativeToken: "ETH", explorerBaseUrl: "https://basescan.org", mode: "FULL_CORE", enabledForSigning: false },
  unichain: { label: "Unichain", family: "EVM", chainId: 130, nativeToken: "ETH", explorerBaseUrl: "https://uniscan.xyz", mode: "FULL_CORE", enabledForSigning: false },
  optimism: { label: "Optimism", family: "EVM", chainId: 10, nativeToken: "ETH", explorerBaseUrl: "https://optimistic.etherscan.io", mode: "SPLITTER_ONLY", enabledForSigning: false },
  botchain: { label: "BOT Chain", family: "EVM", chainId: 677, nativeToken: "BOT", explorerBaseUrl: "https://scan.botchain.ai", mode: "SPLITTER_ONLY_RESTRICTED", enabledForSigning: false },
  xrplevm: { label: "XRPL EVM", family: "EVM", chainId: 1440000, nativeToken: "XRP", explorerBaseUrl: "https://explorer.xrplevm.org", mode: "SPLITTER_ONLY_RESTRICTED", enabledForSigning: false },
  solana: { label: "Solana", family: "SOLANA", chainId: null, nativeToken: "SOL", explorerBaseUrl: "https://explorer.solana.com", mode: "FULL_CORE", enabledForSigning: false },
  near: { label: "NEAR", family: "NEAR", chainId: null, nativeToken: "NEAR", explorerBaseUrl: "https://nearblocks.io", mode: "SPLITTER_MVP", enabledForSigning: false },
  aptos: { label: "Aptos", family: "APTOS", chainId: 1, nativeToken: "APT", explorerBaseUrl: "https://explorer.aptoslabs.com", mode: "SPLITTER_MVP", enabledForSigning: false }
} as const;

export const TOKENS = {
  USDC: { symbol: "USDC", decimals: 6, address: "0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359" },
  POL: { symbol: "POL", decimals: 18, address: null }
} as const;

export const DEMO_USER_ID = "demo-user-001";
export const DEMO_WALLET_ID = "wallet-demo-001";
export const DEMO_WALLET_ADDRESS = "0xA1F1A1000000000000000000000000000000D3F0";
export const DEMO_AGENT_ID = "research-agent";
