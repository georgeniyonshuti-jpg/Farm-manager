import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { rowToPayload } from "../src/services/clevafarm/entitySerializers.js";
import {
  enrichOutboundInventoryFields,
  feedTypeForErpNext,
  inventoryTxnTypeForErpNext,
} from "../src/services/clevafarm/outboundInventoryEnrichment.js";

const FLOCK_ID = "b0eebc99-9c0b-4ef8-bb6d-6bb9bd380a12";
const COMPANY_ID = "c0eebc99-9c0b-4ef8-bb6d-6bb9bd380a13";
const FEED_ENTRY_ID = "d0eebc99-9c0b-4ef8-bb6d-6bb9bd380a14";
const ACTOR_ID = "a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11";

function mockDbQuery(companyId = COMPANY_ID) {
  return async (sql, params) => {
    if (sql.includes("FROM poultry_flocks") && params?.[0] === FLOCK_ID) {
      return { rows: [{ id: companyId }] };
    }
    if (sql.includes("FROM users") && params?.[0] === ACTOR_ID) {
      return { rows: [{ id: companyId }] };
    }
    return { rows: [] };
  };
}

describe("outbound inventory enrichment", () => {
  it("inventoryTxnTypeForErpNext maps Postgres and inbound aliases", () => {
    assert.equal(inventoryTxnTypeForErpNext("procurement_receipt"), "Procurement Receipt");
    assert.equal(inventoryTxnTypeForErpNext("feed_consumption"), "Feed Consumption");
    assert.equal(inventoryTxnTypeForErpNext("adjustment"), "Adjustment");
    assert.equal(inventoryTxnTypeForErpNext("purchase"), "Procurement Receipt");
    assert.equal(inventoryTxnTypeForErpNext("consumption"), "Feed Consumption");
  });

  it("feedTypeForErpNext title-cases config keys", () => {
    assert.equal(feedTypeForErpNext("starter"), "Starter");
    assert.equal(feedTypeForErpNext("grower"), "Grower");
    assert.equal(feedTypeForErpNext("finisher"), "Finisher");
    assert.equal(feedTypeForErpNext("supplement"), "Supplement");
  });

  it("feed_inventory_transaction: maps type, feedType, feedLogId, companyId, contentHash", async () => {
    const row = {
      id: "g1eebc99-9c0b-4ef8-bb6d-6bb9bd380a18",
      transaction_type: "procurement_receipt",
      flock_id: FLOCK_ID,
      feed_type: "starter",
      feed_entry_id: FEED_ENTRY_ID,
      quantity_kg: 100,
      delta_kg: 100,
      actor_user_id: ACTOR_ID,
      updated_at: "2026-02-01T10:00:00.000Z",
    };
    let payload = rowToPayload("feed_inventory_transaction", row);
    const beforeHash = payload.contentHash;

    payload = await enrichOutboundInventoryFields(
      "feed_inventory_transaction",
      row,
      payload,
      mockDbQuery()
    );

    assert.equal(payload.transactionType, "Procurement Receipt");
    assert.equal(payload.feedType, "Starter");
    assert.equal(payload.feedEntryId, FEED_ENTRY_ID);
    assert.equal(payload.feedLogId, FEED_ENTRY_ID);
    assert.equal(payload.companyId, COMPANY_ID);
    assert.notEqual(payload.contentHash, beforeHash);
  });

  it("feed_inventory_transaction: companyId falls back to actor user when no flock", async () => {
    const row = {
      id: "g1eebc99-9c0b-4ef8-bb6d-6bb9bd380a19",
      transaction_type: "feed_consumption",
      feed_type: "grower",
      quantity_kg: 10,
      delta_kg: -10,
      actor_user_id: ACTOR_ID,
      updated_at: "2026-02-01T10:00:00.000Z",
    };
    let payload = rowToPayload("feed_inventory_transaction", row);
    payload = await enrichOutboundInventoryFields(
      "feed_inventory_transaction",
      row,
      payload,
      mockDbQuery()
    );

    assert.equal(payload.transactionType, "Feed Consumption");
    assert.equal(payload.feedType, "Grower");
    assert.equal(payload.companyId, COMPANY_ID);
  });

  it("ignores non feed_inventory_transaction entity types", async () => {
    const row = { id: "x", transaction_type: "procurement_receipt" };
    const payload = { id: "x", transactionType: "procurement_receipt" };
    const out = await enrichOutboundInventoryFields("feed_log", row, payload, mockDbQuery());
    assert.equal(out.transactionType, "procurement_receipt");
    assert.equal(out.companyId, undefined);
  });
});
