import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import {
  MAX_QTY_PER_LINE,
  commissionFor,
  meetsMinimum,
  publicQuoteView,
  quoteShopOrder,
} from "../src/services/shop/shopQuote.js";

const root = join(dirname(fileURLToPath(import.meta.url)), "../..");

const products = [
  { id: "p-s", sku: "CK-S", name: "Small chicken", weight_min_kg: 1.1, weight_max_kg: 1.3, price_rwf: 6500, active: true },
  { id: "p-m", sku: "CK-M", name: "Medium chicken", weight_min_kg: 1.4, weight_max_kg: 1.6, price_rwf: 8000, active: true },
  { id: "p-l", sku: "CK-L", name: "Large chicken", weight_min_kg: 1.7, weight_max_kg: 2.0, price_rwf: 9500, active: false },
];
const zone = { id: "z1", name: "Kicukiro centre", delivery_fee_rwf: 2000, free_delivery_over_rwf: 25000 };
const settings = { commission_pct: 12, min_order_rwf: 10000, min_order_items: 2 };

function quote(items, z = zone, s = settings) {
  return quoteShopOrder({ items, products, zone: z, settings: s });
}

describe("shop quote", () => {
  it("matches the worked example in the plan", () => {
    const q = quote([{ sku: "CK-M", qty: 2 }]);
    assert.equal(q.ok, true);
    assert.equal(q.subtotalRwf, 16000);
    assert.equal(q.deliveryFeeRwf, 2000);
    assert.equal(q.totalRwf, 18000);
    assert.equal(q.deliveryPaidBy, "customer");
    assert.equal(q.commissionRwf, 1920);
    assert.equal(q.butcherPayoutRwf, 16080);
    assert.equal(q.amountToFreeDeliveryRwf, 9000);
    assert.equal(q.commissionRwf + q.butcherPayoutRwf, q.totalRwf);
  });

  it("gives free delivery at the threshold and Cleva pays it", () => {
    const below = quote([{ sku: "CK-M", qty: 3 }]);
    assert.equal(below.subtotalRwf, 24000);
    assert.equal(below.deliveryFeeRwf, 2000);

    const at = quoteShopOrder({
      items: [{ sku: "CK-M", qty: 3 }],
      products,
      zone: { ...zone, free_delivery_over_rwf: 24000 },
      settings,
    });
    assert.equal(at.deliveryFeeRwf, 0);
    assert.equal(at.deliveryPaidBy, "cleva");
    assert.equal(at.amountToFreeDeliveryRwf, null);
    assert.equal(at.butcherPayoutRwf, 24000 - commissionFor(24000, 12));
  });

  it("takes commission on the subtotal only, never on delivery", () => {
    const withFee = quote([{ sku: "CK-M", qty: 2 }]);
    const noFee = quote([{ sku: "CK-M", qty: 2 }], { ...zone, delivery_fee_rwf: 0, free_delivery_over_rwf: null });
    assert.equal(withFee.commissionRwf, noFee.commissionRwf);
    assert.equal(noFee.deliveryPaidBy, "cleva");
  });

  it("rounds commission to the nearest franc", () => {
    assert.equal(commissionFor(6500, 12.5), 813);
    assert.equal(commissionFor(1001, 10), 100);
  });

  it("refuses an order below both minimums", () => {
    const q = quote([{ sku: "CK-S", qty: 1 }]);
    assert.equal(q.ok, false);
    assert.equal(q.code, "below_minimum");
    assert.equal(q.subtotalRwf, 6500);
  });

  it("accepts an order that meets either minimum", () => {
    assert.equal(quote([{ sku: "CK-S", qty: 2 }]).ok, true);
    assert.equal(meetsMinimum(1, 10000, { minOrderItems: 2, minOrderRwf: 10000 }), true);
    assert.equal(meetsMinimum(1, 9999, { minOrderItems: 2, minOrderRwf: 10000 }), false);
    assert.equal(meetsMinimum(1, 1, { minOrderItems: 0, minOrderRwf: 0 }), true);
    assert.equal(meetsMinimum(3, 1, { minOrderItems: 0, minOrderRwf: 10000 }), false);
  });

  it("says not served when the sector has no zone", () => {
    const q = quote([{ sku: "CK-M", qty: 2 }], null);
    assert.equal(q.ok, false);
    assert.equal(q.code, "not_served");
  });

  it("refuses unknown, inactive and bad quantities", () => {
    assert.equal(quote([]).code, "empty");
    assert.equal(quote([{ sku: "NOPE", qty: 1 }]).code, "unknown_product");
    assert.equal(quote([{ sku: "CK-L", qty: 2 }]).code, "inactive_product");
    assert.equal(quote([{ sku: "CK-M", qty: 0 }]).code, "bad_qty");
    assert.equal(quote([{ sku: "CK-M", qty: 1.5 }]).code, "bad_qty");
    assert.equal(quote([{ sku: "CK-M", qty: MAX_QTY_PER_LINE + 1 }]).code, "too_many");
  });

  it("merges repeated items into one line and finds products by id", () => {
    const q = quote([{ sku: "CK-M", qty: 1 }, { productId: "p-m", qty: 2 }]);
    assert.equal(q.ok, true);
    assert.equal(q.lines.length, 1);
    assert.equal(q.lines[0].qty, 3);
    assert.equal(q.lines[0].lineTotalRwf, 24000);
  });

  it("copies the price into the line, so a later price change does not reach it", () => {
    const q = quote([{ sku: "CK-M", qty: 2 }]);
    products[1].price_rwf = 9999;
    try {
      assert.equal(q.lines[0].unitPriceRwf, 8000);
      assert.equal(q.subtotalRwf, 16000);
    } finally {
      products[1].price_rwf = 8000;
    }
  });

  it("hides commission and butcher payout from the customer view", () => {
    const view = publicQuoteView(quote([{ sku: "CK-M", qty: 2 }]));
    assert.equal("commissionRwf" in view, false);
    assert.equal("commissionPct" in view, false);
    assert.equal("butcherPayoutRwf" in view, false);
    assert.equal(view.totalRwf, 18000);
  });
});

describe("butcher shop migration", () => {
  const sql = readFileSync(join(root, "database/migrations/095_butcher_shop.sql"), "utf8");

  it("starts the shop closed and keeps totals consistent", () => {
    assert.match(sql, /is_open\s+BOOLEAN NOT NULL DEFAULT false/);
    assert.ok(sql.includes("CHECK (total_rwf = subtotal_rwf + delivery_fee_rwf)"));
    assert.ok(sql.includes("CHECK (line_total_rwf = unit_price_rwf * qty)"));
  });

  it("adds butcher to the recruitment and contract want checks", () => {
    for (const table of ["recruitment_contacts", "seller_contract_templates", "seller_contracts"]) {
      assert.ok(
        sql.includes(`ADD CONSTRAINT ${table}_want_check CHECK (want IN ('sell', 'buy', 'scout', 'butcher'))`),
        table
      );
    }
  });

  it("stores only the tracking token hash", () => {
    assert.ok(sql.includes("track_token_hash"));
    assert.equal(/track_token\s+TEXT/.test(sql), false);
  });
});
