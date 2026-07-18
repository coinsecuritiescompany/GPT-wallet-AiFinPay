import { z } from "zod";

export const networkSchema = z.enum(["POLYGON_AMOY"]);
export const tokenSchema = z.enum(["USDC", "POL"]);
export const evmAddressSchema = z.string().regex(/^0x[a-fA-F0-9]{40}$/, "Expected a valid EVM address").transform((v) => v.toLowerCase());
export const decimalAmountSchema = z.string().regex(/^(?:0|[1-9]\d*)(?:\.\d+)?$/, "Use a decimal string without scientific notation").refine((v) => BigInt(v.replace(".", "")) > 0n, "Amount must be positive");
export const idempotencyKeySchema = z.string().min(8).max(128).regex(/^[a-zA-Z0-9_.:-]+$/);

