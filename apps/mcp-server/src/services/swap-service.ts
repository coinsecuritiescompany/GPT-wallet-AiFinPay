import { AppError, type SwapAsset, type SwapOrder, type SwapQuote } from "@aifinpay/shared";

/**
 * Compatibility stub retained while older ChatGPT clients may still cache swap
 * tool descriptors. AiFinPay production payments deliberately have NO external
 * swap/bridge/exchange provider. This class performs zero network requests and
 * cannot be enabled by an API key or environment variable.
 */
export class SwapService {
  constructor(_legacyApiKey: string | undefined, _secret: string) {
    void _legacyApiKey;
    void _secret;
  }

  get enabled(): boolean { return false; }

  private unavailable(): never {
    throw new AppError(
      "SWAP_UNAVAILABLE",
      "Third-party swap and bridge services are disabled by AiFinPay payment architecture. Choose a funded AiFinPay settlement route on the destination network instead.",
      501,
    );
  }

  async listAssets(): Promise<SwapAsset[]> { return this.unavailable(); }

  async quote(
    _userId: string,
    _fromAsset: SwapAsset,
    _toAsset: SwapAsset,
    _fromAmount: string,
  ): Promise<{ quote: SwapQuote; quoteToken: string }> {
    void _userId; void _fromAsset; void _toAsset; void _fromAmount;
    return this.unavailable();
  }

  async createOrder(
    _userId: string,
    _quoteToken: string,
    _resolveAddress: (asset: SwapAsset) => string,
  ): Promise<{ order: SwapOrder; orderReference: string }> {
    void _userId; void _quoteToken; void _resolveAddress;
    return this.unavailable();
  }

  async status(_userId: string, _orderReference: string): Promise<Record<string, unknown>> {
    void _userId; void _orderReference;
    return this.unavailable();
  }
}
