import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL(".", import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      "@aifinpay/shared": `${root}packages/shared/src/index.ts`,
      "@aifinpay/aifinpay-adapter": `${root}packages/aifinpay-adapter/src/index.ts`,
      "@aifinpay/demo-ledger": `${root}packages/demo-ledger/src/index.ts`
    }
  },
  test: {
    include: ["**/*.test.ts", "**/*.test.tsx"],
    environmentMatchGlobs: [["apps/wallet-widget/**/*.test.tsx", "jsdom"]],
    setupFiles: ["./test.setup.ts"]
  }
});

