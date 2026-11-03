import { describe, expect, it } from "vitest";
import {
  checkoutSignature,
  newIdempotencyKey,
  reuseCheckoutKey,
} from "./idempotency";

describe("newIdempotencyKey", () => {
  it("returns a POS-prefixed key", () => {
    expect(newIdempotencyKey()).toMatch(/^pos-[a-z0-9]+-/);
  });

  it("does not repeat itself", () => {
    expect(newIdempotencyKey()).not.toBe(newIdempotencyKey());
  });
});

describe("checkoutSignature", () => {
  it("ignores line order only as far as the cart actually stores it", () => {
    const first = checkoutSignature([
      { productId: "latte", qty: 1 },
      { productId: "water", qty: 2 },
    ]);

    expect(first).toBe("latte:1|water:2");
    expect(first).not.toBe(
      checkoutSignature([
        { productId: "water", qty: 2 },
        { productId: "latte", qty: 1 },
      ]),
    );
  });

  it("changes when a quantity changes", () => {
    expect(checkoutSignature([{ productId: "latte", qty: 1 }])).not.toBe(
      checkoutSignature([{ productId: "latte", qty: 2 }]),
    );
  });
});

describe("reuseCheckoutKey", () => {
  it("mints a key when there is no checkout in progress", () => {
    const checkout = reuseCheckoutKey(null, "latte:1");

    expect(checkout.signature).toBe("latte:1");
    expect(checkout.key).toMatch(/^pos-/);
  });

  it("keeps the same key when the dialog is reopened for the same cart", () => {
    const first = reuseCheckoutKey(null, "latte:1");
    const second = reuseCheckoutKey(first, "latte:1");

    expect(second).toBe(first);
  });

  it("mints a new key when the cart changed", () => {
    const first = reuseCheckoutKey(null, "latte:1");
    const second = reuseCheckoutKey(first, "latte:2");

    expect(second.key).not.toBe(first.key);
    expect(second.signature).toBe("latte:2");
  });
});
