import { AppError } from "./errors.js";

const DECIMAL_PATTERN = /^(?:0|[1-9]\d*)(?:\.\d+)?$/;

export function parseBaseUnits(amount: string, decimals: number): bigint {
  if (!DECIMAL_PATTERN.test(amount)) {
    throw new AppError("INVALID_AMOUNT", "Use a positive decimal amount without commas or scientific notation.");
  }
  const [whole = "0", fraction = ""] = amount.split(".");
  if (fraction.length > decimals) {
    throw new AppError("INVALID_AMOUNT", `This token supports at most ${decimals} decimal places.`);
  }
  const value = BigInt(whole) * 10n ** BigInt(decimals) + BigInt((fraction + "0".repeat(decimals)).slice(0, decimals));
  if (value <= 0n) throw new AppError("INVALID_AMOUNT", "Amount must be greater than zero.");
  return value;
}

export function formatBaseUnits(value: bigint | string, decimals: number, maxFraction = decimals): string {
  const raw = typeof value === "bigint" ? value : BigInt(value);
  const negative = raw < 0n;
  const absolute = negative ? -raw : raw;
  const scale = 10n ** BigInt(decimals);
  const whole = absolute / scale;
  const fraction = (absolute % scale).toString().padStart(decimals, "0").slice(0, maxFraction).replace(/0+$/, "");
  return `${negative ? "-" : ""}${whole}${fraction ? `.${fraction}` : ""}`;
}

export function normalizeAmount(amount: string, decimals: number): string {
  return formatBaseUnits(parseBaseUnits(amount, decimals), decimals);
}

