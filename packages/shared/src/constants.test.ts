import { describe, expect, it } from "vitest";
import { MAINNET_NETWORKS } from "./constants.js";

describe("AiFinPay mainnet deployment registry", () => {
  it("contains exactly nine EVM and three native deployments", () => {
    const networks = Object.values(MAINNET_NETWORKS);
    expect(networks).toHaveLength(12);
    expect(networks.filter((network) => network.family === "EVM")).toHaveLength(9);
    expect(networks.filter((network) => network.family !== "EVM")).toHaveLength(3);
  });

  it("keeps every declared deployment locked for signing pending verification", () => {
    for (const network of Object.values(MAINNET_NETWORKS)) {
      expect(network.enabledForSigning).toBe(false);
      expect(network.deployment.status).toBe("DEPLOYED_UNVERIFIED");
      expect(network.rpcUrl).toMatch(/^https:\/\//);
      expect(network.explorerBaseUrl).toMatch(/^https:\/\//);
    }
  });

  it("contains valid public identifier shapes for every chain family", () => {
    for (const network of Object.values(MAINNET_NETWORKS)) {
      if (network.family === "EVM") expect(network.deployment.address).toMatch(/^0x[0-9a-fA-F]{40}$/);
      if (network.family === "SOLANA") expect(network.deployment.address).toMatch(/^[1-9A-HJ-NP-Za-km-z]{32,44}$/);
      if (network.family === "NEAR") expect(network.deployment.address).toMatch(/^[0-9a-f]{64}$/);
      if (network.family === "APTOS") expect(network.deployment.address).toMatch(/^0x[0-9a-f]{64}$/);
    }
  });

  it("uses the official BOT Chain mainnet connection parameters", () => {
    expect(MAINNET_NETWORKS.botchain).toMatchObject({
      chainId: 677,
      rpcUrl: "https://rpc.botchain.ai",
      explorerBaseUrl: "https://scan.botchain.ai"
    });
  });
});
