import {
  AppError,
  CHANGENOW_NETWORK_CODE,
  canonicalSettlementAsset,
  preferredSettlementTarget,
  type AiFinPayMainnet,
  type SettlementStableSymbol,
  type SwapAsset,
  type SwapQuote
} from "@aifinpay/shared";
import { SwapService } from "./swap-service.js";

export interface SettlementSwapQuote {
  quote: SwapQuote;
  quoteToken: string;
  sourceNetwork: AiFinPayMainnet;
  settlementNetwork: AiFinPayMainnet;
  settlementAsset: SettlementStableSymbol;
  canonicalSettlementAddress: string;
  canonicalSettlementDecimals: number;
  provider: "CHANGENOW";
  executionModel: "EXTERNAL_PROVIDER_ORCHESTRATION";
}

/**
 * Policy layer between an agent balance and an external swap provider.
 *
 * This class does NOT claim AiFinPay owns liquidity or an AMM. ChangeNOW is the
 * current provider adapter. The router's job is to prevent arbitrary model-
 * supplied assets/networks from being treated as a valid settlement target.
 */
export class SettlementSwapRouter {
  constructor(private readonly swaps: SwapService) {}

  async quoteToStable(
    userId: string,
    input: {
      sourceNetwork: AiFinPayMainnet;
      sourceTicker: string;
      fromAmount: string;
      stable?: SettlementStableSymbol;
      targetNetwork?: AiFinPayMainnet;
    }
  ): Promise<SettlementSwapQuote> {
    const sourceProviderNetwork = CHANGENOW_NETWORK_CODE[input.sourceNetwork];
    if (!sourceProviderNetwork) {
      throw new AppError(
        "NETWORK_UNSUPPORTED",
        `${input.sourceNetwork} has no reviewed swap-provider network mapping. Automatic settlement swap is disabled.`,
        400
      );
    }

    const requestedSymbol = input.stable ?? "USDC";
    let target = input.targetNetwork
      ? canonicalSettlementAsset(input.targetNetwork, requestedSymbol)
      : canonicalSettlementAsset(input.sourceNetwork, requestedSymbol);

    if (!target && !input.targetNetwork && requestedSymbol === "USDC") {
      target = preferredSettlementTarget(input.sourceNetwork);
    }
    if (!target) {
      throw new AppError(
        "NETWORK_UNSUPPORTED",
        `${requestedSymbol} is not an issuer-verified AiFinPay settlement asset on ${input.targetNetwork ?? input.sourceNetwork}.`,
        400
      );
    }

    const targetProviderNetwork = CHANGENOW_NETWORK_CODE[target.network];
    if (!targetProviderNetwork) {
      throw new AppError(
        "NETWORK_UNSUPPORTED",
        `${target.network} has no reviewed swap-provider network mapping.`,
        400
      );
    }

    const sourceTicker = String(input.sourceTicker || "").trim().toLowerCase();
    if (!/^[a-z0-9-]{1,30}$/.test(sourceTicker)) {
      throw new AppError("INVALID_AMOUNT", "Invalid source asset ticker.", 400);
    }

    const fromAsset: SwapAsset = {
      ticker: sourceTicker,
      network: sourceProviderNetwork,
      name: sourceTicker.toUpperCase()
    };
    const toAsset: SwapAsset = {
      ticker: target.symbol.toLowerCase(),
      network: targetProviderNetwork,
      name: target.symbol
    };

    // SwapService re-resolves both pairs against ChangeNOW's current active
    // server-side registry. A static policy match is not enough to create an
    // order: the provider must confirm the pair at quote time.
    const { quote, quoteToken } = await this.swaps.quote(userId, fromAsset, toAsset, input.fromAmount);
    return {
      quote,
      quoteToken,
      sourceNetwork: input.sourceNetwork,
      settlementNetwork: target.network,
      settlementAsset: target.symbol,
      canonicalSettlementAddress: target.address,
      canonicalSettlementDecimals: target.decimals,
      provider: "CHANGENOW",
      executionModel: "EXTERNAL_PROVIDER_ORCHESTRATION"
    };
  }
}
