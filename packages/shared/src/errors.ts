export const ERROR_CODES = [
  "AUTH_REQUIRED", "WALLET_NOT_FOUND", "NETWORK_UNSUPPORTED", "TOKEN_UNSUPPORTED",
  "INVALID_ADDRESS", "INVALID_AMOUNT", "INSUFFICIENT_FUNDS", "INSUFFICIENT_GAS",
  "POLICY_BLOCKED", "CONFIRMATION_REQUIRED", "INTENT_EXPIRED", "DUPLICATE_REQUEST",
  "SIGNING_FAILED", "RPC_UNAVAILABLE", "TRANSACTION_REVERTED", "RATE_LIMITED",
  "SWAP_UNAVAILABLE", "QUOTE_EXPIRED", "INTERNAL_ERROR"
] as const;

export type ErrorCode = typeof ERROR_CODES[number];

export class AppError extends Error {
  constructor(public readonly code: ErrorCode, message: string, public readonly status = 400) {
    super(message);
    this.name = "AppError";
  }
}

export function safeError(error: unknown): { code: ErrorCode; message: string } {
  if (error instanceof AppError) return { code: error.code, message: error.message };
  // Workspace packages and bundled runtimes can load more than one copy of
  // this class, making `instanceof` fail across the module boundary. Accept
  // only the same branded error name plus an allowlisted code.
  if (error && typeof error === "object") {
    const candidate = error as { name?: unknown; code?: unknown; message?: unknown };
    if (
      candidate.name === "AppError"
      && typeof candidate.code === "string"
      && (ERROR_CODES as readonly string[]).includes(candidate.code)
      && typeof candidate.message === "string"
    ) return { code: candidate.code as ErrorCode, message: candidate.message };
  }
  return { code: "INTERNAL_ERROR", message: "AiFinPay could not complete this request." };
}
