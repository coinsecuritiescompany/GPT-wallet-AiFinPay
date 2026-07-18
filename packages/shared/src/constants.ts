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

export type MainnetFamily = "EVM" | "SOLANA" | "NEAR" | "APTOS";

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
  aptos: { label: "Aptos", family: "APTOS", chainId: 1, nativeToken: "APT", rpcUrl: "https://fullnode.mainnet.aptoslabs.com/v1", explorerBaseUrl: "https://explorer.aptoslabs.com", mode: "SPLITTER_MVP", enabledForSigning: false, deployment: { name: "Module", address: "0xc5feda4075a4f138a5b4e293a8bd41b9e37b76e5553ff35ee6131f4f046d27fd", moduleName: "splitter", status: "DEPLOYED_UNVERIFIED" } }
} as const satisfies Record<string, MainnetNetwork>;

export const TOKENS = {
  USDC: { symbol: "USDC", decimals: 6, address: "0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359" },
  POL: { symbol: "POL", decimals: 18, address: null }
} as const;

export const DEMO_USER_ID = "demo-user-001";
export const DEMO_WALLET_ID = "wallet-demo-001";
export const DEMO_WALLET_ADDRESS = "0xA1F1A1000000000000000000000000000000D3F0";
export const DEMO_AGENT_ID = "research-agent";
