import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { feedEntrySchema } from "../utils/validation.js";
import {
  assertFeedStockAvailable,
  filterAvailableFeedStock,
  normalizeInventoryTxnType,
} from "../src/services/feedStockService.js";
import { mapInboundPayload } from "../src/services/clevafarm/inboundMappers.js";
import { rowToPayload } from "../src/services/clevafarm/entitySerializers.js";

describe("feed stock service", () => {
  it("normalizeInventoryTxnType maps purchase to procurement_receipt", () => {
    assert.equal(normalizeInventoryTxnType("purchase"), "procurement_receipt");
    assert.equal(normalizeInventoryTxnType("feed_consumption"), "feed_consumption");
  });

  it("filterAvailableFeedStock keeps only positive balances with feedType", () => {
    const rows = filterAvailableFeedStock([
      { feedType: "starter", balanceKg: 100 },
      { feedType: "grower", balanceKg: 0 },
      { feedType: null, balanceKg: 50 },
    ]);
    assert.equal(rows.length, 1);
    assert.equal(rows[0].feedType, "starter");
  });

  it("assertFeedStockAvailable blocks missing type and over-quantity", () => {
    const stock = [{ feedType: "starter", balanceKg: 50 }];
    assert.equal(assertFeedStockAvailable("", 10, stock).ok, false);
    assert.equal(assertFeedStockAvailable("grower", 10, stock).ok, false);
    const over = assertFeedStockAvailable("starter", 60, stock);
    assert.equal(over.ok, false);
    assert.match(String(over.error), /Insufficient stock/);
    assert.equal(assertFeedStockAvailable("starter", 40, stock).ok, true);
  });
});

describe("feed entry schema", () => {
  it("requires feedType", () => {
    const ok = feedEntrySchema.safeParse({ feedKg: 10, feedType: "starter" });
    assert.equal(ok.success, true);
    const bad = feedEntrySchema.safeParse({ feedKg: 10 });
    assert.equal(bad.success, false);
  });
});

describe("feed inbound/outbound mapping", () => {
  it("maps feed_inventory_transaction purchase type for Postgres CHECK", () => {
    const row = mapInboundPayload("feed_inventory_transaction", {
      id: "g1eebc99-9c0b-4ef8-bb6d-6bb9bd380a18",
      transactionType: "purchase",
      quantityKg: 1000,
      deltaKg: 1000,
      actorUserId: "a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11",
    });
    assert.equal(row.transaction_type, "procurement_receipt");
  });

  it("maps feed_log feedType inbound", () => {
    const row = mapInboundPayload("feed_log", {
      id: "f1eebc99-9c0b-4ef8-bb6d-6bb9bd380a16",
      flockId: "a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a12",
      feedKg: 12,
      feedType: "starter",
      enteredByUserId: "a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11",
    });
    assert.equal(row.feed_type, "starter");
  });

  it("rowToPayload includes feedType on feed_log outbound", () => {
    const payload = rowToPayload("feed_log", {
      id: "f1eebc99-9c0b-4ef8-bb6d-6bb9bd380a16",
      flock_id: "a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a12",
      feed_kg: 12,
      feed_type: "starter",
      status: "approved",
      updated_at: "2026-02-01T10:00:00.000Z",
    });
    assert.equal(payload.feedType, "starter");
  });
});
