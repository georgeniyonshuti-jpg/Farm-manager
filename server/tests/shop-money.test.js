import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import {
  getButcherMoney,
  getPayoutSummary,
  getShopTotals,
  markRefundSent,
  payButcher,
  setDeliveryCost,
} from "../src/services/shop/shopMoney.js";

const root = join(dirname(fileURLToPath(import.meta.url)), "../..");
const B1 = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
const O1 = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const O2 = "cccccccc-cccc-4ccc-8ccc-ccccccccccc2";
const actor = { userId: "11111111-1111-4111-8111-111111111111", role: "superuser", audit: null };

function fakeDb(handlers = []) {
  const calls = [];
  const fn = async (sql, params) => {
    calls.push({ sql, params });
    for (const [match, result] of handlers) {
      if (sql.includes(match)) {
        if (result instanceof Error) throw result;
        return { rows: typeof result === "function" ? result(sql, params) : result };
      }
    }
    return { rows: [] };
  };
  fn.calls = calls;
  return fn;
}

describe("payout summary", () => {
  it("groups owed orders by butcher and adds the delivery Cleva owes", async () => {
    const db = fakeDb([
      [
        "JOIN shop_butchers b ON b.id = o.butcher_id",
        [
          { butcherId: B1, shopName: "Remera Meats", payoutPhone: "0788", payoutName: "Jean", orderId: O1, ref: "CK-AAAAAA", payoutRwf: 14080, clevaDeliveryRwf: 0 },
          { butcherId: B1, shopName: "Remera Meats", payoutPhone: "0788", payoutName: "Jean", orderId: O2, ref: "CK-BBBBBB", payoutRwf: 22000, clevaDeliveryRwf: 2000 },
        ],
      ],
      ["status = 'problem'", [{ butcherId: B1, n: 1 }]],
    ]);
    const r = await getPayoutSummary(db);
    assert.equal(r.butchers.length, 1);
    assert.equal(r.butchers[0].totalRwf, 38080);
    assert.equal(r.butchers[0].orders[1].amountRwf, 24000);
    assert.equal(r.butchers[0].heldOrders, 1);
  });

  it("only counts delivered orders without a sent payout", async () => {
    const db = fakeDb();
    await getPayoutSummary(db);
    const sql = db.calls[0].sql;
    assert.ok(sql.includes("o.status IN ('delivered', 'resolved')"));
    assert.ok(sql.includes("x.side = 'butcher_out' AND x.status IN ('pending', 'paid')"));
    assert.ok(sql.includes("COALESCE(o.cleva_delivery_cost_rwf, z.delivery_fee_rwf, 0)"));
  });
});

describe("pay a butcher", () => {
  const body = { reference: "MP 2611 0401", orderIds: [O1, O2], expectedTotalRwf: 38080 };

  it("needs a reference, orders and the amount the desk saw", async () => {
    const db = fakeDb();
    assert.equal((await payButcher(db, B1, { ...body, reference: "x" }, actor)).status, 400);
    assert.equal((await payButcher(db, B1, { ...body, orderIds: [] }, actor)).status, 400);
    assert.equal((await payButcher(db, B1, { ...body, expectedTotalRwf: 0 }, actor)).status, 400);
    assert.equal(db.calls.length, 0);
  });

  it("writes payouts in one statement, guarded by the expected total", async () => {
    const db = fakeDb([["WITH due AS", [{ total: 38080, n: 2, written: 2 }]]]);
    const r = await payButcher(db, B1, body, actor);
    assert.equal(r.ok, true);
    assert.equal(r.reference, "MP26110401");
    assert.equal(db.calls.length, 1);
    const { sql, params } = db.calls[0];
    assert.ok(sql.includes("'butcher_out'") && sql.includes("'delivery_out'"));
    assert.ok(sql.includes("check_total.total = $5"));
    assert.deepEqual(params, [B1, [O1, O2], "MP26110401", actor.userId, 38080]);
  });

  it("refuses when the orders changed since the desk loaded them", async () => {
    const db = fakeDb([["WITH due AS", [{ total: 24000, n: 1, written: 0 }]]]);
    const r = await payButcher(db, B1, body, actor);
    assert.equal(r.status, 409);
  });

  it("refuses a double payout caught by the database", async () => {
    const dup = Object.assign(new Error("dup"), { code: "23505" });
    const r = await payButcher(fakeDb([["WITH due AS", dup]]), B1, body, actor);
    assert.equal(r.status, 409);
  });
});

describe("delivery cost and refunds", () => {
  it("accepts a whole delivery cost only for unpaid free-delivery orders", async () => {
    assert.equal((await setDeliveryCost(fakeDb(), O1, { amountRwf: -1 }, actor)).status, 400);
    assert.equal((await setDeliveryCost(fakeDb(), O1, { amountRwf: 1500.5 }, actor)).status, 400);
    assert.equal((await setDeliveryCost(fakeDb(), O1, { amountRwf: 1500 }, actor)).status, 409);
    const db = fakeDb([["SET cleva_delivery_cost_rwf", [{ id: O1 }]]]);
    assert.equal((await setDeliveryCost(db, O1, { amountRwf: 1500 }, actor)).ok, true);
    assert.ok(db.calls[0].sql.includes("delivery_paid_by = 'cleva'"));
  });

  it("marks a refund sent with its MoMo reference and the order refunded", async () => {
    assert.equal((await markRefundSent(fakeDb(), O1, { reference: "" }, actor)).status, 400);
    assert.equal((await markRefundSent(fakeDb(), O1, { reference: "MP123456" }, actor)).status, 409);
    const db = fakeDb([["side = 'refund' AND status = 'pending'", [{ orderId: O1, amountRwf: 18000 }]]]);
    const r = await markRefundSent(db, O1, { reference: "MP123456" }, actor);
    assert.equal(r.ok, true);
    assert.ok(db.calls[0].sql.includes("payment_status = 'refunded'"));
  });
});

describe("totals", () => {
  it("works out Cleva's net as commission minus the delivery it paid", async () => {
    const db = fakeDb([
      ["generate_series", [{ day: "2026-11-04", placed: 5, paid: 4, paidRwf: 80000, commissionRwf: 8400, clevaDeliveryRwf: 2000, delivered: 3, cancelledAfterPay: 0 }]],
      ["paymentsToCheck", [{ paymentsToCheck: 1, waitingForButcher: 0, inProgress: 2, problems: 0, refundsToSend: 1 }]],
    ]);
    const r = await getShopTotals(db, 7);
    assert.equal(r.days[0].clevaNetRwf, 6400);
    assert.equal(r.now.refundsToSend, 1);
    assert.equal(db.calls[0].params[0], 7);
    assert.ok(db.calls[0].sql.includes("Africa/Kigali"));
  });

  it("keeps the range between 1 and 31 days", async () => {
    const db = fakeDb();
    await getShopTotals(db, 999);
    assert.equal(db.calls[0].params[0], 31);
  });
});

describe("butcher money", () => {
  it("shows what is owed and payouts grouped by reference", async () => {
    const db = fakeDb([
      ["COALESCE(sum(o.butcher_payout_rwf", [{ orders: 2, owedRwf: 38080 }]],
      ["GROUP BY s.reference", [{ reference: "MP1", paidAt: "2026-11-03", amountRwf: 30000, orders: 2 }]],
    ]);
    const r = await getButcherMoney(db, B1);
    assert.equal(r.owed.owedRwf, 38080);
    assert.equal(r.payouts[0].reference, "MP1");
    assert.equal(db.calls[0].params[0], B1);
  });
});

describe("payout migration", () => {
  it("allows one sent payout and one refund per order", () => {
    const sql = readFileSync(join(root, "database/migrations/096_shop_payout_once.sql"), "utf8");
    for (const side of ["butcher_out", "delivery_out", "refund"]) {
      assert.ok(sql.includes(`WHERE side = '${side}' AND status IN ('pending', 'paid')`), side);
    }
  });
});
