import { randomUUID } from "node:crypto";
import { createPublicClient, http, type Address } from "viem";
import {
  AIFINPAY_TREASURY_NETWORKS,
  LIVE_NETWORKS,
  assertNoExternalTreasuryProviders,
  treasuryAssetsForNetwork,
  type AiFinPayMainnet,
  type LiveNetworkSpec,
} from "@aifinpay/shared";
import type { AppConfig } from "../config.js";
import type { Store, TreasuryBalanceSnapshot } from "../storage/store.js";
import { TREASURY_NETWORK_ID, TreasuryBalanceReader } from "./treasury-balances.js";

const SAFE_ABI = [
  { type: "function", name: "getOwners", stateMutability: "view", inputs: [], outputs: [{ name: "", type: "address[]" }] },
  { type: "function", name: "getThreshold", stateMutability: "view", inputs: [], outputs: [{ name: "", type: "uint256" }] },
] as const;

const EVM_NETWORKS = new Set<AiFinPayMainnet>([
  "polygon", "avalanche", "arbitrum", "bnb", "base", "unichain", "optimism", "botchain", "xrplevm",
]);

export interface TreasuryReadiness {
  ready: boolean;
  model: "LOCAL_CHAIN_CUSTODY";
  networks: number;
  externalPaymentProviders: 0;
  automaticCrossChainMovement: false;
  evmSafes: Array<{ network: AiFinPayMainnet; address: string; owners: string[]; threshold: number }>;
}

export interface TreasurySnapshotRun {
  observed: TreasuryBalanceSnapshot[];
  errors: Array<{ network: AiFinPayMainnet; asset: string; error: string }>;
}

function rpcUrl(config: AppConfig, network: AiFinPayMainnet): string {
  const id = TREASURY_NETWORK_ID[network];
  const override = config.mainnetRpcUrls[id]?.[0];
  if (override) return override;
  const spec = (LIVE_NETWORKS as Record<string, LiveNetworkSpec>)[id];
  const url = spec?.rpcUrls?.[0];
  if (!url) throw new Error(`RPC is not configured for ${network}`);
  return url;
}

export class TreasuryAccountingService {
  readonly enabled: boolean;
  private readonly reader?: TreasuryBalanceReader;
  private running = false;

  constructor(private readonly store: Store, private readonly config: AppConfig) {
    this.enabled = config.treasury.enabled;
    if (!this.enabled) return;
    if (!config.treasury.addresses) throw new Error("Treasury accounting addresses are missing");
    assertNoExternalTreasuryProviders();
    this.reader = new TreasuryBalanceReader(config.treasury.addresses, config.mainnetRpcUrls, config.mainnetRpcAuth);
  }

  async verifyReadiness(): Promise<TreasuryReadiness> {
    if (!this.enabled || !this.config.treasury.addresses || !this.reader) {
      return {
        ready: false, model: "LOCAL_CHAIN_CUSTODY", networks: 13,
        externalPaymentProviders: 0, automaticCrossChainMovement: false, evmSafes: [],
      };
    }
    assertNoExternalTreasuryProviders();
    const evmSafes: TreasuryReadiness["evmSafes"] = [];
    for (const network of AIFINPAY_TREASURY_NETWORKS) {
      if (!EVM_NETWORKS.has(network)) continue;
      const address = this.config.treasury.addresses[network];
      const id = TREASURY_NETWORK_ID[network];
      const auth = this.config.mainnetRpcAuth[id];
      const client = createPublicClient({
        transport: http(rpcUrl(this.config, network), {
          timeout: 8_000,
          ...(auth ? { fetchOptions: { headers: { authorization: auth } } } : {}),
        }),
      });
      const code = await client.getCode({ address: address as Address });
      if (!code || code === "0x") throw new Error(`${network} treasury ${address} has no contract code; production EVM treasury must be a multisig Safe`);
      let owners: readonly Address[];
      let thresholdRaw: bigint;
      try {
        [owners, thresholdRaw] = await Promise.all([
          client.readContract({ address: address as Address, abi: SAFE_ABI, functionName: "getOwners" }),
          client.readContract({ address: address as Address, abi: SAFE_ABI, functionName: "getThreshold" }),
        ]);
      } catch (error) {
        throw new Error(`${network} treasury ${address} does not expose Safe getOwners/getThreshold: ${String(error)}`);
      }
      const threshold = Number(thresholdRaw);
      const unique = new Set(owners.map((owner) => owner.toLowerCase()));
      if (owners.length < 2 || unique.size !== owners.length || threshold < 2 || threshold > owners.length) {
        throw new Error(`${network} treasury Safe has unsafe signer configuration owners=${owners.length} threshold=${threshold}`);
      }
      evmSafes.push({ network, address, owners: [...owners], threshold });
    }
    return {
      ready: evmSafes.length === 9,
      model: "LOCAL_CHAIN_CUSTODY",
      networks: AIFINPAY_TREASURY_NETWORKS.length,
      externalPaymentProviders: 0,
      automaticCrossChainMovement: false,
      evmSafes,
    };
  }

  async snapshotAll(): Promise<TreasurySnapshotRun> {
    if (!this.enabled || !this.reader || !this.config.treasury.addresses) return { observed: [], errors: [] };
    if (this.running) return { observed: [], errors: [{ network: "polygon", asset: "scheduler", error: "snapshot already running" }] };
    this.running = true;
    const observed: TreasuryBalanceSnapshot[] = [];
    const errors: TreasurySnapshotRun["errors"] = [];
    try {
      await this.verifyReadiness();
      for (const network of AIFINPAY_TREASURY_NETWORKS) {
        for (const asset of treasuryAssetsForNetwork(network)) {
          try {
            const balance = await this.reader.read(network, asset);
            const snapshot: TreasuryBalanceSnapshot = {
              id: `tb_${randomUUID()}`,
              network,
              address: balance.address,
              asset,
              symbol: balance.symbol,
              raw: balance.raw.toString(),
              decimals: balance.decimals,
              tokenAddress: balance.tokenAddress,
              observedAt: balance.observedAt,
            };
            this.store.saveTreasuryBalanceSnapshot(snapshot);
            observed.push(snapshot);
          } catch (error) {
            errors.push({ network, asset, error: error instanceof Error ? error.message : String(error) });
          }
        }
      }
      return { observed, errors };
    } finally {
      this.running = false;
    }
  }

  latest(): TreasuryBalanceSnapshot[] {
    return this.store.latestTreasuryBalances();
  }
}
