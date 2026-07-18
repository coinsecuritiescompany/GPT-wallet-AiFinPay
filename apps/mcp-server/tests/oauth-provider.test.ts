import { describe, expect, it } from "vitest";
import type { Response } from "express";
import { AiFinPayOAuthProvider } from "../src/auth/oauth-provider.js";

const issuer = new URL("https://wallet.example/");
const resource = new URL("https://wallet.example/mcp");

describe("AiFinPay OAuth provider", () => {
  it("uses PKCE-bound codes and puts public addresses only in access tokens", async () => {
    const provider = new AiFinPayOAuthProvider("test-session-secret-with-at-least-32-characters", issuer, resource);
    const client = await provider.clientsStore.registerClient!({
      redirect_uris: ["https://chatgpt.com/connector/oauth/test"],
      token_endpoint_auth_method: "none"
    });
    let vaultRedirect = "";
    await provider.authorize(client, {
      redirectUri: client.redirect_uris[0]!,
      codeChallenge: "test-pkce-challenge",
      scopes: ["wallet:read"],
      state: "state-123",
      resource
    }, { redirect: (_status: number, url: string) => { vaultRedirect = url; } } as unknown as Response);

    const request = new URL(vaultRedirect).searchParams.get("oauth");
    expect(request).toMatch(/^afp1\.authorize\./);
    const callback = provider.approveAuthorization(request!, {
      evm: "0x1111111111111111111111111111111111111111",
      solana: "5L7xB9arfakeaddress111111111111111",
      near: "a".repeat(64),
      aptos: `0x${"b".repeat(64)}`
    });
    const code = new URL(callback).searchParams.get("code")!;
    expect(await provider.challengeForAuthorizationCode(client, code)).toBe("test-pkce-challenge");

    const tokens = await provider.exchangeAuthorizationCode(client, code, undefined, client.redirect_uris[0], resource);
    const auth = await provider.verifyAccessToken(tokens.access_token);
    expect(auth.scopes).toEqual(["wallet:read"]);
    expect(auth.resource?.href).toBe(resource.href);
    expect(auth.extra?.addresses).toEqual({
      evm: "0x1111111111111111111111111111111111111111",
      solana: "5L7xB9arfakeaddress111111111111111",
      near: "a".repeat(64),
      aptos: `0x${"b".repeat(64)}`
    });
    expect(JSON.stringify(auth.extra)).not.toContain("mnemonic");
    expect(JSON.stringify(auth.extra)).not.toContain("password");
    await expect(provider.exchangeAuthorizationCode(client, code, undefined, client.redirect_uris[0], resource)).rejects.toThrow("already used");
  });

  it("rejects the wrong resource audience", async () => {
    const provider = new AiFinPayOAuthProvider("test-session-secret-with-at-least-32-characters", issuer, resource);
    const client = await provider.clientsStore.registerClient!({ redirect_uris: ["https://chatgpt.com/connector/oauth/test"], token_endpoint_auth_method: "none" });
    await expect(provider.authorize(client, {
      redirectUri: client.redirect_uris[0]!, codeChallenge: "challenge", scopes: ["wallet:read"], resource: new URL("https://attacker.example/mcp")
    }, {} as Response)).rejects.toThrow("does not match");
  });
});
