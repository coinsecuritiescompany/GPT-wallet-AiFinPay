import type { PaymentIntentStatus } from "@aifinpay/shared";

const transitions: Record<PaymentIntentStatus, readonly PaymentIntentStatus[]> = {
  DRAFT: ["REQUIRES_CONFIRMATION", "AUTO_APPROVED", "BLOCKED", "EXPIRED"],
  REQUIRES_CONFIRMATION: ["CONFIRMED", "CANCELLED", "EXPIRED"],
  AUTO_APPROVED: ["CONFIRMED", "CANCELLED", "EXPIRED"],
  BLOCKED: [],
  CONFIRMED: ["SIGNING", "CANCELLED"],
  SIGNING: ["SUBMITTED", "FAILED"],
  SUBMITTED: ["PENDING", "COMPLETED", "FAILED"],
  PENDING: ["COMPLETED", "FAILED"],
  COMPLETED: [],
  FAILED: [],
  CANCELLED: [],
  EXPIRED: []
};

export function canTransition(from: PaymentIntentStatus, to: PaymentIntentStatus): boolean {
  return transitions[from].includes(to);
}

export function assertTransition(from: PaymentIntentStatus, to: PaymentIntentStatus): void {
  if (!canTransition(from, to)) throw new Error(`Invalid payment intent transition: ${from} -> ${to}`);
}

