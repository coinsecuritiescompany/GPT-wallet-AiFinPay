import { createHmac, timingSafeEqual } from "node:crypto";

export interface SigningRequestClaims {
  intentId: string;
  userId: string;
  expiresAt: string;
}

/**
 * Issues and verifies the short-lived token that hands a prepared payment intent
 * to the on-device Vault for signing. Unlike the confirmation token, this one is
 * self-contained: the Vault presents it back to the server without prior context,
 * so verify() decodes the claims (intent + user + expiry) straight from the
 * signed payload. A "sign:" domain prefix keeps it unusable as a confirmation
 * token even though both are HMAC'd with the same session secret.
 */
export class SigningRequestService {
  constructor(private readonly secret: string) {}

  issue(claims: SigningRequestClaims): string {
    const payload = Buffer.from(`${claims.intentId}|${claims.userId}|${claims.expiresAt}`).toString("base64url");
    return `${payload}.${this.sign(payload)}`;
  }

  /** Returns the claims when the token is authentic and unexpired, otherwise null. */
  verify(token: string): SigningRequestClaims | null {
    const [payload, signature] = token.split(".");
    if (!payload || !signature) return null;
    const expected = this.sign(payload);
    if (signature.length !== expected.length) return null;
    if (!timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) return null;
    const [intentId, userId, expiresAt] = Buffer.from(payload, "base64url").toString().split("|");
    if (!intentId || !userId || !expiresAt) return null;
    if (new Date(expiresAt).getTime() <= Date.now()) return null;
    return { intentId, userId, expiresAt };
  }

  private sign(payload: string): string {
    return createHmac("sha256", this.secret).update(`sign:${payload}`).digest("base64url");
  }
}
