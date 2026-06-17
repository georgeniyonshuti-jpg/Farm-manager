import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { buildFlockTombstonePayload } from "../src/services/clevafarm/flockLifecycleSync.js";
import {
  resolveFlockStatusOut,
  rowToPayload,
  FLOCK_STATUS_OUT,
} from "../src/services/clevafarm/entitySerializers.js";
import { buildOutboundRequestBody } from "../src/services/clevafarm/outboundClient.js";

const FLOCK_ID = "a1b2c3d4-e5f6-7890-abcd-ef1234567890";

describe("flock lifecycle sync", () => {
  it("buildFlockTombstonePayload sets Closed, farmRecordDeleted, lifecycleReason", () => {
    const payload = buildFlockTombstonePayload(
      {
        id: FLOCK_ID,
        code: "F-100",
        status: "active",
        initial_count: 5000,
        updated_at: "2026-01-01T00:00:00.000Z",
      },
      { terminalStatus: "closed", reason: "purged" }
    );
    assert.equal(payload.status, "Closed");
    assert.equal(payload.farmRecordDeleted, true);
    assert.equal(payload.lifecycleReason, "purged");
    assert.equal(payload.id, FLOCK_ID);
    assert.ok(typeof payload.contentHash === "string" && payload.contentHash.length === 64);
    assert.ok(payload.updatedAt);
  });

  it("failed_delete tombstone uses Closed status", () => {
    const payload = buildFlockTombstonePayload(
      { id: FLOCK_ID, status: "failed" },
      { reason: "failed_delete" }
    );
    assert.equal(payload.status, "Closed");
    assert.equal(payload.lifecycleReason, "failed_delete");
  });

  it("resolveFlockStatusOut maps known statuses and falls back to Closed", () => {
    assert.equal(resolveFlockStatusOut("active"), "Active");
    assert.equal(resolveFlockStatusOut("archived"), FLOCK_STATUS_OUT.archived);
    assert.equal(resolveFlockStatusOut("purged"), "Closed");
    assert.equal(resolveFlockStatusOut("unknown_xyz"), "Closed");
  });

  it("rowToPayload never sends raw unknown flock status to ERPNext", () => {
    const payload = rowToPayload("flock", {
      id: FLOCK_ID,
      status: "purged",
      updated_at: "2026-02-01T10:00:00.000Z",
    });
    assert.equal(payload.status, "Closed");
  });

  it("buildOutboundRequestBody accepts on_delete event", () => {
    const body = buildOutboundRequestBody(
      "flock",
      { id: FLOCK_ID, status: "Closed", farmRecordDeleted: true },
      { event: "on_delete", correlationId: "outbox-1", entityId: FLOCK_ID }
    );
    assert.equal(body.event, "on_delete");
    assert.equal(body.entityType, "flock");
    assert.equal(body.payload.status, "Closed");
    assert.equal(body.meta.entityId, FLOCK_ID);
  });
});
