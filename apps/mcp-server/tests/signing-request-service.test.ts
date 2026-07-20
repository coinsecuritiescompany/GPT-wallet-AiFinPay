import { describe, expect, it } from "vitest";
import { SigningRequestService } from "../src/services/signing-request-service.js";

const SECRET = "test-session-secret-at-least-thirty-two-chars";

describe("SigningRequestService", () => {
  const service = new SigningRequestService(SECRET);
  const future = new Date(Date.now() + 60_000).toISOString();

  it("round-trips the intent and user claims from a signed token", () => {
    const token = service.issue({ intentId: "pi_abc", userId: "user-1", expiresAt: future });
    expect(service.verify(token)).toEqual({ intentId: "pi_abc", userId: "user-1", expiresAt: future });
  });

  it("rejects a tampered payload", () => {
    const token = service.issue({ intentId: "pi_abc", userId: "user-1", expiresAt: future });
    const [, signature] = token.split(".");
    const forged = `${Buffer.from("pi_evil|user-1|" + future).toString("base64url")}.${signature}`;
    expect(service.verify(forged)).toBeNull();
  });

  it("rejects a token signed with a different secret", () => {
    const other = new SigningRequestService("another-session-secret-at-least-thirty-2");
    const token = other.issue({ intentId: "pi_abc", userId: "user-1", expiresAt: future });
    expect(service.verify(token)).toBeNull();
  });

  it("rejects an expired token", () => {
    const token = service.issue({ intentId: "pi_abc", userId: "user-1", expiresAt: new Date(Date.now() - 1_000).toISOString() });
    expect(service.verify(token)).toBeNull();
  });

  it("rejects malformed tokens", () => {
    expect(service.verify("")).toBeNull();
    expect(service.verify("no-dot")).toBeNull();
  });
});
