export const NETWORKS = {
  POLYGON_AMOY: {
    id: "POLYGON_AMOY",
    label: "Polygon Amoy",
    chainId: 80002,
    nativeToken: "POL",
    explorerBaseUrl: "https://amoy.polygonscan.com",
    confirmations: 2
  }
} as const;

export const TOKENS = {
  USDC: { symbol: "USDC", decimals: 6, address: "0x0000000000000000000000000000000000001010" },
  POL: { symbol: "POL", decimals: 18, address: null }
} as const;

export const DEMO_USER_ID = "demo-user-001";
export const DEMO_WALLET_ID = "wallet-demo-001";
export const DEMO_WALLET_ADDRESS = "0xA1F1A1000000000000000000000000000000D3F0";
export const DEMO_AGENT_ID = "research-agent";

