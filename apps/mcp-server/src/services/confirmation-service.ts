import { createHmac, timingSafeEqual } from "node:crypto";

export class ConfirmationService {
  constructor(private readonly secret: string) {}

  issue(subject: string, userId: string, expiresAt: string): string {
    const payload = Buffer.from(`${subject}|${userId}|${expiresAt}`).toString("base64url");
    const signature = createHmac("sha256", this.secret).update(payload).digest("base64url");
    return `${payload}.${signature}`;
  }

  verify(token: string, subject: string, userId: string, expiresAt: string): boolean {
    const [payload, signature] = token.split(".");
    if (!payload || !signature) return false;
    const expectedPayload = Buffer.from(`${subject}|${userId}|${expiresAt}`).toString("base64url");
    const expected = createHmac("sha256", this.secret).update(expectedPayload).digest("base64url");
    if (payload !== expectedPayload || signature.length !== expected.length) return false;
    return timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
  }
}

