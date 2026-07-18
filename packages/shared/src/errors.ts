export const ERROR_CODES = [
  "AUTH_REQUIRED", "WALLET_NOT_FOUND", "NETWORK_UNSUPPORTED", "TOKEN_UNSUPPORTED",
  "INVALID_ADDRESS", "INVALID_AMOUNT", "INSUFFICIENT_FUNDS", "INSUFFICIENT_GAS",
  "POLICY_BLOCKED", "CONFIRMATION_REQUIRED", "INTENT_EXPIRED", "DUPLICATE_REQUEST",
  "SIGNING_FAILED", "RPC_UNAVAILABLE", "TRANSACTION_REVERTED", "RATE_LIMITED", "INTERNAL_ERROR"
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
  return { code: "INTERNAL_ERROR", message: "AiFinPay could not complete this request." };
}

