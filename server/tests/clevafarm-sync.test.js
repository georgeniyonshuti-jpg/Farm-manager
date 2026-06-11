import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  ENTITY_DEPENDENCY_ORDER,
  ENTITY_DEFS,
  isValidEntityType,
  listEntityTypes,
} from "../src/services/clevafarm/entityRegistry.js";
import { rowToPayload, payloadToRow, FLOCK_STATUS_OUT } from "../src/services/clevafarm/entitySerializers.js";
import { isClevaFarmInboundSync, withInboundSync } from "../src/services/clevafarm/inboundContext.js";
import {
  isClevaFarmSecretConfigured,
  verifyClevaFarmSecret,
} from "../src/services/clevafarm/clevafarmSecret.js";

describe("clevafarm entity registry", () => {
  it("lists 23 entity types in dependency order", () => {
    assert.equal(listEntityTypes().length, 23);
    assert.equal(ENTITY_DEPENDENCY_ORDER.length, 23);
    for (const t of ENTITY_DEPENDENCY_ORDER) {
      assert.ok(ENTITY_DEFS[t], `missing def for ${t}`);
      assert.ok(isValidEntityType(t));
    }
  });
});

describe("clevafarm serializers", () => {
  it("maps flock status for outbound webhook", () => {
    const payload = rowToPayload("flock", { id: "a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11", status: "active" });
    assert.equal(payload.status, "Active");
    assert.equal(payload.id, "a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11");
  });

  it("omits check-in photos from payload", () => {
    const payload = rowToPayload("farm_checkin", {
      id: "a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11",
      photo_url: "data:image/png;base64,xxx",
      photo_urls: ["a"],
      flock_id: "b1eebc99-9c0b-4ef8-bb6d-6bb9bd380a12",
    });
    assert.equal(payload.photoUrl, undefined);
    assert.equal(payload.hasPhotos, true);
    assert.equal(payload.flockId, "b1eebc99-9c0b-4ef8-bb6d-6bb9bd380a12");
  });

  it("round-trips flock status inbound", () => {
    const row = payloadToRow("flock", { id: "x", status: "Completed" });
    assert.equal(row.status, "archived");
    assert.equal(FLOCK_STATUS_OUT.archived, "Completed");
  });
});

describe("clevafarm inbound context", () => {
  it("sets inbound flag inside withInboundSync", async () => {
    assert.equal(isClevaFarmInboundSync(), false);
    await withInboundSync(async () => {
      assert.equal(isClevaFarmInboundSync(), true);
    });
    assert.equal(isClevaFarmInboundSync(), false);
  });
});

describe("clevafarm secret", () => {
  it("rejects missing secret when configured", () => {
    const prev = process.env.CLEVAFARM_API_SECRET;
    process.env.CLEVAFARM_API_SECRET = "test-secret";
    try {
      assert.equal(isClevaFarmSecretConfigured(), true);
      assert.equal(verifyClevaFarmSecret("test-secret"), true);
      assert.equal(verifyClevaFarmSecret("wrong"), false);
      assert.equal(verifyClevaFarmSecret(undefined), false);
    } finally {
      process.env.CLEVAFARM_API_SECRET = prev;
    }
  });
});
