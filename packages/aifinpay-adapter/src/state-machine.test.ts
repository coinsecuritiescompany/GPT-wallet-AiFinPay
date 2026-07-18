import { describe, expect, it } from "vitest";
import { assertTransition, canTransition } from "./state-machine.js";

describe("payment intent state machine", () => {
  it("accepts the prepared-to-confirmed path", () => expect(canTransition("REQUIRES_CONFIRMATION", "CONFIRMED")).toBe(true));
  it("fails closed on invalid replay transitions", () => expect(() => assertTransition("COMPLETED", "SIGNING")).toThrow("Invalid payment intent transition"));
});

