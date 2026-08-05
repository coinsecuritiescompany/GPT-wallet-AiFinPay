import { describe, expect, it } from "vitest";
import { LEGACY_WIDGET_URIS, WIDGET_URI } from "../src/tools/register-tools.js";

// ChatGPT caches a widget body against its resource URI, so shipping UI changes
// without bumping the URI leaves users on the old bundle — the server fix is
// deployed and invisible. That happened with the Casper send form: the routing
// fix went live while clients kept running v14. These assertions make the
// contract explicit rather than relying on remembering a comment.
describe("widget resource URI as a cache key", () => {
  const current = WIDGET_URI.match(/wallet-v(\d+)\.html$/);

  it("is a versioned URI", () => {
    expect(current).not.toBeNull();
  });

  it("keeps every earlier version readable so cached descriptors still resolve", () => {
    const version = Number(current![1]);
    expect(LEGACY_WIDGET_URIS).toHaveLength(version - 1);
    for (let earlier = 1; earlier < version; earlier += 1) {
      expect(LEGACY_WIDGET_URIS).toContain(`ui://aifinpay/wallet-v${earlier}.html`);
    }
  });

  it("does not list the current URI as legacy", () => {
    expect(LEGACY_WIDGET_URIS).not.toContain(WIDGET_URI);
  });
});
