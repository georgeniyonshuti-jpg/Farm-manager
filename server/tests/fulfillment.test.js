import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  applyOpenException,
  applyOpsSettle,
  applyPlanLogistics,
  applyResolveException,
  applySideConfirm,
  commissionInputs,
  detectActualsConflict,
  handshakePhase,
  normalizeActuals,
  projectFulfillmentContacts,
} from "../src/services/pipeline/fulfillment.js";

const reserved = {
  status: "committed",
  birds: 100,
  agreedPricePerKg: 4000,
  avgWeightKg: 1.8,
  exceptionKind: "none",
};

describe("handshakePhase", () => {
  it("starts reserved and becomes planned after logistics", () => {
    assert.equal(handshakePhase(reserved), "reserved");
    assert.equal(handshakePhase({ ...reserved, collectOrDelivery: "collect" }), "planned");
  });

  it("holds committed unpaid trades in awaiting_payment", () => {
    assert.equal(handshakePhase({ ...reserved, buyerPaymentStatus: "unpaid" }), "awaiting_payment");
    assert.equal(handshakePhase({ ...reserved, buyerPaymentStatus: "pending" }), "awaiting_payment");
    assert.equal(handshakePhase({ ...reserved, buyerPaymentStatus: "paid" }), "reserved");
    assert.equal(
      applyPlanLogistics({ ...reserved, buyerPaymentStatus: "unpaid" }, { collectOrDelivery: "collect" }, "u1", "now")
        .error,
      "Buyer must pay Cleva before handover can be planned."
    );
    assert.equal(
      applySideConfirm({ ...reserved, buyerPaymentStatus: "unpaid" }, "buyer", { actualBirds: 100 }, "u1", "now")
        .error,
      "Buyer must pay Cleva before the order can be confirmed."
    );
  });

  it("requires both sides before settled", () => {
    assert.equal(
      handshakePhase({ ...reserved, buyerConfirmedAt: "2026-09-23T10:00:00Z" }),
      "buyer_confirmed"
    );
    assert.equal(
      handshakePhase({
        ...reserved,
        buyerConfirmedAt: "2026-09-23T10:00:00Z",
        farmerConfirmedAt: "2026-09-23T11:00:00Z",
      }),
      "settled"
    );
  });

  it("open exception beats a single confirm", () => {
    assert.equal(
      handshakePhase({
        ...reserved,
        buyerConfirmedAt: "2026-09-23T10:00:00Z",
        exceptionKind: "no_show",
        exceptionOpenedAt: "2026-09-23T12:00:00Z",
      }),
      "exception"
    );
  });
});

describe("actuals conflict", () => {
  it("flags bird short and price dispute", () => {
    const first = normalizeActuals({ actualBirds: 100, actualWeightKg: 1.8, actualPricePerKg: 4000 }, reserved);
    assert.equal(detectActualsConflict(first, { ...first, actualBirds: 80 })?.kind, "short");
    assert.equal(detectActualsConflict(first, { ...first, actualPricePerKg: 3600 })?.kind, "price_dispute");
    assert.equal(detectActualsConflict(first, { ...first, actualWeightKg: 1.81 }), null);
  });
});

describe("applySideConfirm", () => {
  it("first confirm does not settle or accrue", () => {
    const r = applySideConfirm(reserved, "buyer", { actualBirds: 100, actualWeightKg: 1.8 }, "u1", "now");
    assert.equal(r.settle, false);
    assert.ok(r.patch.buyerConfirmedAt);
    assert.equal(r.patch.status, undefined);
  });

  it("matching second confirm settles", () => {
    const afterBuyer = {
      ...reserved,
      buyerConfirmedAt: "t1",
      actualBirds: 100,
      actualWeightKg: 1.8,
      actualPricePerKg: 4000,
    };
    const r = applySideConfirm(afterBuyer, "farmer", { actualBirds: 100, actualWeightKg: 1.8 }, "u2", "t2");
    assert.equal(r.settle, true);
    assert.equal(r.patch.status, "delivered");
    assert.ok(r.patch.farmerConfirmedAt);
  });

  it("conflicting second confirm opens exception and does not settle", () => {
    const afterBuyer = {
      ...reserved,
      buyerConfirmedAt: "t1",
      actualBirds: 100,
      actualWeightKg: 1.8,
      actualPricePerKg: 4000,
    };
    const r = applySideConfirm(afterBuyer, "farmer", { actualBirds: 70 }, "u2", "t2");
    assert.equal(r.settle, false);
    assert.equal(r.conflict.kind, "short");
    assert.equal(r.patch.exceptionKind, "short");
    assert.equal(r.patch.farmerConfirmedAt, null);
  });

  it("blocks confirm while exception is open", () => {
    const r = applySideConfirm(
      { ...reserved, exceptionKind: "no_show", exceptionOpenedAt: "t" },
      "buyer",
      {},
      "u1",
      "now"
    );
    assert.match(r.error, /exception/i);
  });
});

describe("exceptions and ops settle", () => {
  it("failed exception marks the trade failed", () => {
    const r = applyOpenException(reserved, "failed", "No-show", "u1", "now");
    assert.equal(r.failed, true);
    assert.equal(r.patch.status, "failed");
  });

  it("ops settle closes both sides", () => {
    const r = applyOpsSettle(reserved, { actualBirds: 98, actualWeightKg: 1.7 }, "ops", "now");
    assert.equal(r.settle, true);
    assert.equal(r.patch.status, "delivered");
    assert.ok(r.patch.buyerConfirmedAt);
    assert.ok(r.patch.farmerConfirmedAt);
  });

  it("resolve settle uses actuals for commission inputs", () => {
    const open = {
      ...reserved,
      exceptionKind: "short",
      exceptionOpenedAt: "t",
    };
    const r = applyResolveException(open, "settle", { actualBirds: 90, actualWeightKg: 1.6 }, "ok", "ops", "now");
    assert.equal(r.settle, true);
    const c = commissionInputs({ ...open, ...r.patch }, r.patch);
    assert.equal(c.birds, 90);
    assert.equal(c.avgWeightKg, 1.6);
  });
});

describe("logistics and contacts", () => {
  it("plans collect/slaughter on a reserved match", () => {
    const r = applyPlanLogistics(reserved, { collectOrDelivery: "collect", slaughterMode: "farm" }, "u1", "now");
    assert.equal(r.patch.collectOrDelivery, "collect");
    assert.equal(r.patch.slaughterMode, "farm");
    assert.equal(r.patch.deliveryActor, "buyer");
  });

  it("forces buyer actor on collect and farm on delivery", () => {
    const collect = applyPlanLogistics(reserved, { collectOrDelivery: "collect", deliveryActor: "farm" }, "u1", "now");
    assert.equal(collect.patch.deliveryActor, "buyer");
    const delivery = applyPlanLogistics(reserved, { collectOrDelivery: "delivery" }, "u1", "now");
    assert.equal(delivery.patch.deliveryActor, "farm");
  });

  it("rejects self-serve cleva delivery actor", () => {
    const r = applyPlanLogistics(
      reserved,
      { collectOrDelivery: "delivery", deliveryActor: "cleva", allowCleva: false },
      "u1",
      "now"
    );
    assert.equal(r.error, "Only ops can set Cleva delivery.");
  });

  it("allows ops to set cleva delivery and need-delivery notes", () => {
    const r = applyPlanLogistics(
      reserved,
      {
        collectOrDelivery: "delivery",
        deliveryActor: "cleva",
        allowCleva: true,
        needClevaDelivery: true,
      },
      "ops",
      "now"
    );
    assert.equal(r.patch.deliveryActor, "cleva");
    assert.match(String(r.patch.logisticsNotes), /NEED_CLEVA_DELIVERY/);
  });

  it("hides farm phone from buyer unless disclosed", () => {
    const match = { farmPhone: "0788", buyerPhone: "0722", discloseContact: false };
    assert.equal(projectFulfillmentContacts(match, "buyer").farmPhone, null);
    assert.equal(projectFulfillmentContacts({ ...match, discloseContact: true }, "buyer").farmPhone, "0788");
    assert.equal(projectFulfillmentContacts(match, "farmer").buyerPhone, "0722");
  });
});
