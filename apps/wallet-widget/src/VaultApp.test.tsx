// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { VaultApp } from "./VaultApp.js";
import type { EncryptedVault } from "./vault-crypto.js";

const vault: EncryptedVault = {
  version: 1,
  cipher: "AES-GCM",
  kdf: "PBKDF2-SHA256",
  iterations: 310_000,
  salt: "public-test-salt",
  iv: "public-test-iv",
  ciphertext: "encrypted-test-material",
  addresses: {
    evm: "0x1111111111111111111111111111111111111111",
    solana: "5L7xB9arfakeaddress111111111111111",
    near: "a".repeat(64),
    aptos: `0x${"b".repeat(64)}`
  },
  createdAt: "2026-07-18T10:00:00.000Z"
};

describe("Vault pairing UI", () => {
  afterEach(() => {
    cleanup();
    localStorage.clear();
    window.history.replaceState({}, "", "/");
    vi.restoreAllMocks();
  });

  it("sends only the pairing token and public addresses", async () => {
    localStorage.setItem("aifinpay.vault.v1", JSON.stringify(vault));
    window.history.replaceState({}, "", "/vault?pair=abcdefghijklmnopqrstuvwxyzABCDEF");
    const request = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({ connected: true, alreadyConnected: true }), { status: 200, headers: { "content-type": "application/json" } }));
    render(<VaultApp />);
    fireEvent.click(screen.getByRole("button", { name: "Connect public addresses to ChatGPT" }));
    await waitFor(() => expect(screen.getByText("✓ Connected. You can return to ChatGPT.")).toBeInTheDocument());
    const body = JSON.parse(request.mock.calls[0]?.[1]?.body as string) as Record<string, unknown>;
    expect(Object.keys(body).sort()).toEqual(["addresses", "token"]);
    expect(body.addresses).toEqual(vault.addresses);
    expect(JSON.stringify(body)).not.toContain(vault.ciphertext);
    expect(JSON.stringify(body)).not.toContain(vault.salt);
  });

  it("removes the encrypted Vault from this device on explicit request", () => {
    localStorage.setItem("aifinpay.vault.v1", JSON.stringify(vault));
    render(<VaultApp />);
    fireEvent.click(screen.getByRole("button", { name: "Remove vault from this device" }));
    expect(localStorage.getItem("aifinpay.vault.v1")).toBeNull();
    expect(screen.getByText("Your wallet for ChatGPT")).toBeInTheDocument();
  });
});
