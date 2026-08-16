import { AppError, type AiFinPayMainnet, type SettlementStableSymbol } from "@aifinpay/shared";
import type { SwapService } from "./swap-service.js";

/** Compatibility adapter for older cached MCP schemas. */
export class SettlementSwapRouter {
  constructor(_legacySwapService: SwapService) { void _legacySwapService; }

  async quoteToStable(
    _userId: string,
    _input: {
      sourceNetwork: AiFinPayMainnet;
      sourceTicker: string;
      fromAmount: string;
      stable?: SettlementStableSymbol;
      targetNetwork?: AiFinPayMainnet;
    },
  ): Promise<never> {
    void _userId; void _input;
    throw new AppError(
      "SWAP_UNAVAILABLE",
      "Cross-chain settlement swaps are disabled. Select a funded AiFinPay settlement route on a network supported by the merchant.",
      501,
    );
  }
}
