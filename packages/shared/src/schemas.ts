import { z } from "zod";

export const networkSchema = z.enum([
  "POLYGON", "POLYGON_AMOY",
  "AVALANCHE", "ARBITRUM", "BNB", "BASE", "UNICHAIN", "OPTIMISM", "BOTCHAIN", "XRPLEVM",
  "SOLANA", "NEAR", "APTOS", "CASPER"
]);
// Public callers should use NATIVE for the selected network's gas asset.
// POL remains accepted for backwards compatibility with the original Polygon-
// only tool contract; both values normalize to the internal native-asset slot.
export const tokenSchema = z.enum(["USDC", "NATIVE", "POL"]).transform((value) => value === "USDC" ? "USDC" as const : "POL" as const);
export const evmAddressSchema = z.string().regex(/^0x[a-fA-F0-9]{40}$/, "Expected a valid EVM address").transform((v) => v.toLowerCase());
export const solanaAddressSchema = z.string().regex(/^[1-9A-HJ-NP-Za-km-z]{32,44}$/, "Expected a valid Solana address");
export const transferRecipientSchema = z.union([evmAddressSchema, solanaAddressSchema]);
export const decimalAmountSchema = z.string().regex(/^(?:0|[1-9]\d*)(?:\.\d+)?$/, "Use a decimal string without scientific notation").refine((v) => BigInt(v.replace(".", "")) > 0n, "Amount must be positive");
export const idempotencyKeySchema = z.string().min(8).max(128).regex(/^[a-zA-Z0-9_.:-]+$/);
