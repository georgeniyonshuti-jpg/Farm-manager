import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { isAcceptLate, isPaymentOverdue, nextShopOrderStatus } from "../src/services/shop/orderStatus.js";

const ops = { kind: "ops" };
const customer = { kind: "customer" };
const system = { kind: "system" };
const butcherA = { kind: "butcher", butcherId: "b-a" };
const butcherB = { kind: "butcher", butcherId: "b-b" };

function order(status, extra = {}) {
  return { status, butcherId: "b-a", paymentStatus: "unpaid", ...extra };
}

describe("shop order status", () => {
  it("walks the happy path", () => {
    const steps = [
      ["placed", "pay_sent", customer, "payment_pending"],
      ["payment_pending", "confirm_payment", ops, "paid"],
      ["paid", "accept", butcherA, "accepted"],
      ["accepted", "ready", butcherA, "ready"],
      ["ready", "out", butcherA, "out_for_delivery"],
      ["out_for_delivery", "delivered", butcherA, "delivered"],
    ];
    for (const [from, action, actor, to] of steps) {
      const r = nextShopOrderStatus(order(from), action, actor);
      assert.equal(r.ok, true, `${from} ${action}`);
      assert.equal(r.to, to);
    }
  });

  it("sets payment status with the payment steps", () => {
    assert.equal(nextShopOrderStatus(order("placed"), "pay_sent", customer).paymentStatus, "pending");
    assert.equal(nextShopOrderStatus(order("payment_pending"), "confirm_payment", ops).paymentStatus, "paid");
    const rejected = nextShopOrderStatus(order("payment_pending"), "reject_payment", ops);
    assert.equal(rejected.to, "placed");
    assert.equal(rejected.paymentStatus, "unpaid");
  });

  it("does not let a butcher accept an unpaid order", () => {
    for (const status of ["placed", "payment_pending"]) {
      const r = nextShopOrderStatus(order(status), "accept", butcherA);
      assert.equal(r.ok, false);
      assert.equal(r.code, "wrong_status");
    }
  });

  it("hides another butcher's order as not found", () => {
    const r = nextShopOrderStatus(order("paid"), "accept", butcherB);
    assert.equal(r.ok, false);
    assert.equal(r.code, "not_found");
    assert.equal(nextShopOrderStatus(order("paid"), "accept", { kind: "butcher" }).code, "not_found");
  });

  it("keeps butchers to their own steps", () => {
    for (const action of ["confirm_payment", "cancel", "assign", "resolve"]) {
      assert.equal(nextShopOrderStatus(order("paid"), action, butcherA).code, "forbidden", action);
    }
  });

  it("lets ops take butcher steps but not the customer", () => {
    assert.equal(nextShopOrderStatus(order("paid"), "accept", ops).to, "accepted");
    assert.equal(nextShopOrderStatus(order("paid"), "accept", customer).code, "forbidden");
  });

  it("needs a butcher before butcher steps", () => {
    assert.equal(nextShopOrderStatus(order("paid", { butcherId: null }), "accept", ops).code, "unassigned");
  });

  it("only ops cancels, with a reason, and a paid order needs a refund", () => {
    assert.equal(nextShopOrderStatus(order("paid"), "cancel", customer).code, "forbidden");
    assert.equal(nextShopOrderStatus(order("paid"), "cancel", ops).code, "bad_input");

    const unpaid = nextShopOrderStatus(order("placed"), "cancel", ops, { reason: "Customer asked" });
    assert.equal(unpaid.to, "cancelled");
    assert.equal(unpaid.needsRefund, false);

    const paid = nextShopOrderStatus(order("ready", { paymentStatus: "paid" }), "cancel", ops, { reason: "Butcher closed" });
    assert.equal(paid.to, "cancelled");
    assert.equal(paid.needsRefund, true);

    assert.equal(nextShopOrderStatus(order("delivered"), "cancel", ops, { reason: "x" }).code, "wrong_status");
  });

  it("reassigns before the order leaves, and the new butcher must accept", () => {
    const r = nextShopOrderStatus(order("accepted"), "assign", ops, { butcherId: "b-b" });
    assert.equal(r.to, "paid");
    assert.equal(r.butcherId, "b-b");
    assert.equal(nextShopOrderStatus(order("out_for_delivery"), "assign", ops, { butcherId: "b-b" }).code, "wrong_status");
    assert.equal(nextShopOrderStatus(order("paid"), "assign", ops).code, "bad_input");
  });

  it("expires only unpaid placed orders", () => {
    assert.equal(nextShopOrderStatus(order("placed"), "expire", system).to, "expired");
    assert.equal(nextShopOrderStatus(order("payment_pending"), "expire", system).code, "wrong_status");
  });

  it("reports and resolves a problem after delivery", () => {
    assert.equal(nextShopOrderStatus(order("ready"), "report_problem", customer, { problemKind: "short" }).code, "wrong_status");
    assert.equal(nextShopOrderStatus(order("delivered"), "report_problem", customer, { problemKind: "nope" }).code, "bad_input");
    assert.equal(nextShopOrderStatus(order("delivered"), "report_problem", customer, { problemKind: "short" }).to, "problem");
    assert.equal(nextShopOrderStatus(order("problem"), "resolve", ops).to, "resolved");
  });

  it("refuses unknown statuses and actions", () => {
    assert.equal(nextShopOrderStatus(order("nope"), "accept", ops).code, "bad_status");
    assert.equal(nextShopOrderStatus(order("paid"), "teleport", ops).code, "unknown_action");
  });
});

describe("shop order timers", () => {
  const now = new Date("2026-11-03T10:00:00Z");

  it("flags unpaid orders past the pay window", () => {
    assert.equal(isPaymentOverdue({ status: "placed", placedAt: "2026-11-03T09:29:00Z" }, 30, now), true);
    assert.equal(isPaymentOverdue({ status: "placed", placedAt: "2026-11-03T09:31:00Z" }, 30, now), false);
    assert.equal(isPaymentOverdue({ status: "payment_pending", placedAt: "2026-11-03T08:00:00Z" }, 30, now), false);
  });

  it("counts accept time from payment confirmation", () => {
    const o = { status: "paid", placedAt: "2026-11-03T08:00:00Z", paidConfirmedAt: "2026-11-03T09:50:00Z" };
    assert.equal(isAcceptLate(o, 20, now), false);
    assert.equal(isAcceptLate({ ...o, paidConfirmedAt: "2026-11-03T09:30:00Z" }, 20, now), true);
    assert.equal(isAcceptLate({ ...o, status: "accepted" }, 20, now), false);
  });
});
