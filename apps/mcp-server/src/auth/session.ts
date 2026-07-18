import { AppError, DEMO_USER_ID } from "@aifinpay/shared";

export interface AuthenticatedUser { userId: string; source: "demo" | "oauth" }

export class SessionAuth {
  constructor(private readonly demoMode: boolean) {}

  resolve(): AuthenticatedUser {
    if (this.demoMode) return { userId: DEMO_USER_ID, source: "demo" };
    throw new AppError("AUTH_REQUIRED", "Connect your AiFinPay account before using the wallet.", 401);
  }
}

