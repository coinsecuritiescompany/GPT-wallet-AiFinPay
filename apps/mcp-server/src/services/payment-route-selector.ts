import type { WalletAdapter } from "@aifinpay/aifinpay-adapter";
import { LIVE_NETWORKS, type LiveNetworkSpec, type NetworkId } from "@aifinpay/shared";

const CHAIN_TO_NETWORK: Record<string, NetworkId> = {
  polygon: "POLYGON", avalanche: "AVALANCHE", arbitrum: "ARBITRUM", bnb: "BNB",
  base: "BASE", unichain: "UNICHAIN", optimism: "OPTIMISM", botchain: "BOTCHAIN",
  xrplevm: "XRPLEVM", solana: "SOLANA", near: "NEAR", aptos: "APTOS", casper: "CASPER",
};

export interface PaymentRouteCandidate {
  chain: string;
  merchantWallet: string;
  grossAmount: string;
  asset?: string;
  orderId: string;
}

export interface PaymentRouteEvaluation extends PaymentRouteCandidate {
  network: NetworkId;
  normalizedAsset: string;
  live: boolean;
  balanceChecked: boolean;
  sufficientBalance: boolean;
  balanceBaseUnits?: string;
  reason: "READY" | "ROUTE_NOT_LIVE" | "ASSET_BALANCE_READER_UNAVAILABLE" | "INSUFFICIENT_BALANCE" | "BALANCE_UNAVAILABLE";
}

export interface PaymentRouteSelection {
  selected: PaymentRouteCandidate | null;
  evaluations: PaymentRouteEvaluation[];
  strategy: "MERCHANT_PRIORITY_FIRST_FUNDED_ROUTE";
  externalSwapOrBridgeUsed: false;
}

function specFor(network: NetworkId): LiveNetworkSpec {
  const spec = (LIVE_NETWORKS as Record<string, LiveNetworkSpec>)[network];
  if (!spec) throw new Error(`Missing network metadata for ${network}`);
  return spec;
}

function backendLive(routeClass: "AIFP-1" | "AIFP-2", chain: string, rows: unknown[]): boolean {
  return rows.some((raw) => {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) return false;
    const row = raw as Record<string, unknown>;
    return row.route_class === routeClass && row.network === chain && row.live === true;
  });
}

function balanceSlot(candidate: PaymentRouteCandidate, network: NetworkId): "POL" | "USDC" | null {
  const spec = specFor(network);
  const requested = String(candidate.asset || spec.native.symbol).toUpperCase();
  if (requested === "NATIVE" || requested === spec.native.symbol.toUpperCase()) return "POL";
  if (requested === "USDC" && spec.usdc) return "USDC";
  return null;
}

export class PaymentRouteSelector {
  constructor(private readonly adapter: WalletAdapter) {}

  async select(input: {
    userId: string;
    routeClass: "AIFP-1" | "AIFP-2";
    candidates: PaymentRouteCandidate[];
    backendRoutes: unknown[];
  }): Promise<PaymentRouteSelection> {
    const evaluations: PaymentRouteEvaluation[] = [];
    for (const candidate of input.candidates) {
      const chain = candidate.chain.toLowerCase();
      const network = CHAIN_TO_NETWORK[chain];
      if (!network) continue;
      const spec = specFor(network);
      const normalizedAsset = String(candidate.asset || spec.native.symbol).toUpperCase();
      const live = backendLive(input.routeClass, chain, input.backendRoutes);
      if (!live) {
        evaluations.push({ ...candidate, chain, network, normalizedAsset, live: false, balanceChecked: false, sufficientBalance: false, reason: "ROUTE_NOT_LIVE" });
        continue;
      }
      const slot = balanceSlot(candidate, network);
      if (!slot) {
        evaluations.push({ ...candidate, chain, network, normalizedAsset, live: true, balanceChecked: false, sufficientBalance: false, reason: "ASSET_BALANCE_READER_UNAVAILABLE" });
        continue;
      }
      try {
        const balance = await this.adapter.getBalance(input.userId, slot, network);
        const sufficientBalance = BigInt(balance.raw) >= BigInt(candidate.grossAmount);
        const evaluation: PaymentRouteEvaluation = {
          ...candidate, chain, network, normalizedAsset, live: true, balanceChecked: true,
          sufficientBalance, balanceBaseUnits: balance.raw,
          reason: sufficientBalance ? "READY" : "INSUFFICIENT_BALANCE",
        };
        evaluations.push(evaluation);
        if (sufficientBalance) {
          return {
            selected: { ...candidate, chain, asset: normalizedAsset },
            evaluations,
            strategy: "MERCHANT_PRIORITY_FIRST_FUNDED_ROUTE",
            externalSwapOrBridgeUsed: false,
          };
        }
      } catch {
        evaluations.push({
          ...candidate, chain, network, normalizedAsset, live: true,
          balanceChecked: false, sufficientBalance: false, reason: "BALANCE_UNAVAILABLE",
        });
      }
    }
    return {
      selected: null,
      evaluations,
      strategy: "MERCHANT_PRIORITY_FIRST_FUNDED_ROUTE",
      externalSwapOrBridgeUsed: false,
    };
  }
}
