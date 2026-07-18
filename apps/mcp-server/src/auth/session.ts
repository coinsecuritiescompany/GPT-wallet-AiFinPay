import { AppError, DEMO_USER_ID } from "@aifinpay/shared";
import type { AuthInfo } from "@modelcontextprotocol/sdk/server/auth/types.js";
import type { PublicWalletAddresses } from "./oauth-provider.js";

export interface AuthenticatedUser { userId: string; source: "demo" | "oauth"; addresses?: PublicWalletAddresses }

export class SessionAuth {
  constructor(private readonly demoMode: boolean) {}

  resolve(authInfo?: AuthInfo): AuthenticatedUser {
    const userId = authInfo?.extra?.userId;
    const addresses = authInfo?.extra?.addresses;
    if (typeof userId === "string" && addresses && typeof addresses === "object") {
      const candidate = addresses as Record<string, unknown>;
      if (typeof candidate.evm === "string" && typeof candidate.solana === "string" && typeof candidate.near === "string" && typeof candidate.aptos === "string") {
        return { userId, source: "oauth", addresses: candidate as unknown as PublicWalletAddresses };
      }
    }
    if (this.demoMode) return { userId: DEMO_USER_ID, source: "demo" };
    throw new AppError("AUTH_REQUIRED", "Connect your AiFinPay account before using the wallet.", 401);
  }
}
