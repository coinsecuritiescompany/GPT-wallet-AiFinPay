// @vitest-environment node
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const app = readFileSync(resolve(process.cwd(), "apps/wallet-widget/src/App.tsx"), "utf8");
const types = readFileSync(resolve(process.cwd(), "apps/wallet-widget/src/types.ts"), "utf8");
const genericTools = readFileSync(resolve(process.cwd(), "apps/mcp-server/src/tools/register-tools.ts"), "utf8");
const settlementTools = readFileSync(resolve(process.cwd(), "apps/mcp-server/src/tools/register-settlement-tools.ts"), "utf8");

const forbiddenExternalSwapSurface = [
  "list_swap_assets",
  "get_swap_quote",
  "create_swap_order",
  "get_swap_status",
  "swap-form",
  "swap-quote",
  "swap-order",
  "swap-status",
  "ChangeNOW partner key",
  "Cross-chain swap",
];

describe("provider-free production surface", () => {
  it("does not advertise or register the retired external swap/bridge flow", () => {
    const productionSurface = `${app}\n${types}\n${genericTools}\n${settlementTools}`;
    for (const token of forbiddenExternalSwapSurface) {
      expect(productionSurface, `retired external swap surface returned: ${token}`).not.toContain(token);
    }
  });

  it("keeps AiFinPay-funded-route selection as the replacement UX", () => {
    expect(settlementTools).toContain('registerAppTool(server, "select_aifinpay_payment_route"');
    expect(settlementTools).toContain("never calls an exchange, swap service or cross-chain bridge");
  });
});
