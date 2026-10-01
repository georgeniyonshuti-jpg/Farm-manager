import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  FOODSERVICE_MIN_BIRDS,
  buyerBirdsFloor,
  defaultHandover,
  defaultProcess,
  deliveryOptionEnabled,
  resolveDeliveryActor,
} from "./marketLogisticsDefaults.ts";

describe("marketLogisticsDefaults", () => {
  it("defaults process to live", () => {
    assert.equal(defaultProcess({ slaughterAvailable: true }), "live");
    assert.equal(defaultProcess({ slaughterAvailable: false }), "live");
    assert.equal(defaultProcess({ tripSlaughterPayer: "farm" }), "live");
  });

  it("defaults live trips to collect even when farm can deliver", () => {
    assert.equal(
      defaultHandover({ process: "live", deliveryAvailable: true }),
      "collect"
    );
  });

  it("defaults slaughter to delivery when farm opted in", () => {
    assert.equal(
      defaultHandover({ process: "slaughter", deliveryAvailable: true }),
      "delivery"
    );
    assert.equal(
      defaultHandover({ process: "slaughter", deliveryAvailable: false }),
      "collect"
    );
  });

  it("only enables delivery option when farm opted in", () => {
    assert.equal(deliveryOptionEnabled({ deliveryAvailable: true }), true);
    assert.equal(deliveryOptionEnabled({ deliveryAvailable: false }), false);
  });

  it("maps collect→buyer and delivery→farm; cleva ops-only", () => {
    assert.equal(resolveDeliveryActor({ collectOrDelivery: "collect" }), "buyer");
    assert.equal(resolveDeliveryActor({ collectOrDelivery: "delivery" }), "farm");
    assert.equal(
      resolveDeliveryActor({ collectOrDelivery: "delivery", deliveryActor: "cleva" }),
      "farm"
    );
    assert.equal(
      resolveDeliveryActor({
        collectOrDelivery: "delivery",
        deliveryActor: "cleva",
        allowCleva: true,
      }),
      "cleva"
    );
  });

  it("floors buyer birds at foodservice min", () => {
    assert.equal(FOODSERVICE_MIN_BIRDS, 10);
    assert.equal(buyerBirdsFloor(null), 10);
    assert.equal(buyerBirdsFloor(20), 20);
    assert.equal(buyerBirdsFloor(5), 10);
  });
});
