import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { rowToPayload } from "../src/services/clevafarm/entitySerializers.js";
import {
  enrichOutboundUserFields,
  normalizeOutboundUserId,
} from "../src/services/clevafarm/outboundUserEnrichment.js";

const USER_ID = "a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11";
const USER_EMAIL = "feeder@example.com";

function mockDbQuery(email = USER_EMAIL) {
  return async (sql, params) => {
    if (sql.includes("FROM users") && params?.[0] === USER_ID) {
      return { rows: [{ email }] };
    }
    return { rows: [] };
  };
}

describe("outbound user enrichment", () => {
  it("normalizeOutboundUserId rejects invalid tokens", () => {
    assert.equal(normalizeOutboundUserId("user"), null);
    assert.equal(normalizeOutboundUserId(""), null);
    assert.equal(normalizeOutboundUserId(USER_ID), USER_ID);
  });

  it("feed_log: sets recordedBy, logDate, enteredByEmail from row + user lookup", async () => {
    const row = {
      id: "f1eebc99-9c0b-4ef8-bb6d-6bb9bd380a16",
      flock_id: "b0eebc99-9c0b-4ef8-bb6d-6bb9bd380a12",
      feed_kg: 12,
      feed_type: "starter",
      entered_by_user_id: USER_ID,
      recorded_at: "2026-02-01T08:00:00.000Z",
      status: "approved",
      updated_at: "2026-02-01T10:00:00.000Z",
    };
    let payload = rowToPayload("feed_log", row);
    const beforeHash = payload.contentHash;

    payload = await enrichOutboundUserFields("feed_log", row, payload, mockDbQuery());

    assert.equal(payload.enteredByUserId, USER_ID);
    assert.equal(payload.recordedBy, USER_ID);
    assert.equal(payload.logDate, payload.recordedAt);
    assert.equal(payload.enteredByEmail, USER_EMAIL);
    assert.notEqual(payload.recordedBy, "user");
    assert.notEqual(payload.contentHash, beforeHash);
  });

  it("feed_log: never sets recordedBy to user when row has invalid token", async () => {
    const row = {
      id: "f1eebc99-9c0b-4ef8-bb6d-6bb9bd380a16",
      flock_id: "b0eebc99-9c0b-4ef8-bb6d-6bb9bd380a12",
      feed_kg: 12,
      feed_type: "starter",
      entered_by_user_id: "user",
      recorded_at: "2026-02-01T08:00:00.000Z",
      status: "approved",
      updated_at: "2026-02-01T10:00:00.000Z",
    };
    let payload = rowToPayload("feed_log", row);
    payload = await enrichOutboundUserFields("feed_log", row, payload, mockDbQuery());

    assert.equal(payload.recordedBy, undefined);
    assert.equal(payload.enteredByEmail, undefined);
    assert.equal(payload.logDate, payload.recordedAt);
  });

  it("feed_inventory_transaction: sets actorUserEmail and recordedBy", async () => {
    const row = {
      id: "g1eebc99-9c0b-4ef8-bb6d-6bb9bd380a18",
      transaction_type: "feed_consumption",
      quantity_kg: 10,
      delta_kg: -10,
      actor_user_id: USER_ID,
      feed_type: "starter",
      updated_at: "2026-02-01T10:00:00.000Z",
    };
    let payload = rowToPayload("feed_inventory_transaction", row);
    payload = await enrichOutboundUserFields(
      "feed_inventory_transaction",
      row,
      payload,
      mockDbQuery()
    );

    assert.equal(payload.actorUserId, USER_ID);
    assert.equal(payload.recordedBy, USER_ID);
    assert.equal(payload.actorUserEmail, USER_EMAIL);
  });
});
