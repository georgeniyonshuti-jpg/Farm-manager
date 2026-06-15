import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  ENTITY_DEPENDENCY_ORDER,
  ENTITY_DEFS,
  isValidEntityType,
  listEntityTypes,
} from "../src/services/clevafarm/entityRegistry.js";
import { rowToPayload, payloadToRow, FLOCK_STATUS_OUT } from "../src/services/clevafarm/entitySerializers.js";
import {
  mapInboundPayload,
  INBOUND_ALLOWED_COLUMNS,
  INBOUND_ERPNEXT_ENTITY_TYPES,
  applyInsertDefaults,
} from "../src/services/clevafarm/inboundMappers.js";
import { resolvePostgresId, resolveInboundForeignKeys } from "../src/services/clevafarm/fkResolver.js";
import { isClevaFarmInboundSync, withInboundSync } from "../src/services/clevafarm/inboundContext.js";
import {
  isClevaFarmSecretConfigured,
  verifyClevaFarmSecret,
} from "../src/services/clevafarm/clevafarmSecret.js";
import { emitEntitySync, initClevaFarmEmit } from "../src/services/clevafarm/emitEntitySync.js";
import { InboundValidationError } from "../src/services/clevafarm/inboundErrors.js";
import { upsertEntityFromPayload } from "../src/services/clevafarm/inboundUpsert.js";

const FLOCK_ID = "a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11";
const USER_ID = "b1eebc99-9c0b-4ef8-bb6d-6bb9bd380a12";
const MEDICINE_ID = "c1eebc99-9c0b-4ef8-bb6d-6bb9bd380a13";

/** ERPNext desk-style payloads (fat keys, Frappe names allowed on FK fields). */
const GOLDEN_INBOUND = {
  flock: {
    id: FLOCK_ID,
    name: "FLOCK-001",
    flockLabel: "Batch A",
    code: "FLOCK-001",
    breedCode: "ROSS308",
    placementDate: "2026-01-15",
    initialCount: 5000,
    status: "Active",
    targetWeightKg: 2.4,
    hatcherySource: "Kigali Hatch",
  },
  farm_supplier: { id: "d1eebc99-9c0b-4ef8-bb6d-6bb9bd380a14", name: "  Agro Feed  Ltd  " },
  farm_barn: { id: "e1eebc99-9c0b-4ef8-bb6d-6bb9bd380a15", name: "Barn North" },
  feed_log: {
    id: "f1eebc99-9c0b-4ef8-bb6d-6bb9bd380a16",
    flockId: FLOCK_ID,
    feedKg: 120.5,
    logDate: "2026-02-01T08:00:00Z",
    enteredByUserId: USER_ID,
    flockLabel: "ignored",
  },
  mortality_log: {
    id: "011ebc99-9c0b-4ef8-bb6d-6bb9bd380a17",
    flockId: FLOCK_ID,
    deadCount: 3,
    logDate: "2026-02-02T18:00:00Z",
    laborerId: USER_ID,
    name: "MORT-0001",
  },
  slaughter_record: {
    id: "sl-2026-001",
    flockId: FLOCK_ID,
    birdsSlaughtered: 200,
    slaughterDate: "2026-03-01",
    avgLiveWeightKg: 2.1,
    enteredByUserId: USER_ID,
  },
  farm_treatment: {
    id: "tx-2026-001",
    flockId: FLOCK_ID,
    medicineName: "Amoxicillin",
    diseaseOrReason: "respiratory",
    dose: 10,
    doseUnit: "ml",
    route: "water",
    administeredByUserId: USER_ID,
    treatmentDate: "2026-02-10",
  },
  feed_inventory_transaction: {
    id: "g1eebc99-9c0b-4ef8-bb6d-6bb9bd380a18",
    transactionType: "purchase",
    quantityKg: 1000,
    deltaKg: 1000,
    actorUserId: USER_ID,
    flockLabel: "desk-only",
    supplierName: "Agro Feed Ltd",
  },
  farm_medicine_lot: {
    id: "h1eebc99-9c0b-4ef8-bb6d-6bb9bd380a19",
    medicineId: MEDICINE_ID,
    lotNumber: "LOT-99",
    quantityReceived: 50,
    receivedAt: "2026-01-20",
    expiryDate: "2027-01-20",
  },
};

function assertOnlyAllowedKeys(entityType, row) {
  const allowed = INBOUND_ALLOWED_COLUMNS[entityType];
  for (const key of Object.keys(row)) {
    assert.ok(allowed.has(key), `${entityType}: unexpected key ${key}`);
  }
}

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
    const payload = rowToPayload("flock", { id: FLOCK_ID, status: "active" });
    assert.equal(payload.status, "Active");
    assert.equal(payload.id, FLOCK_ID);
  });

  it("omits check-in photos from payload", () => {
    const payload = rowToPayload("farm_checkin", {
      id: FLOCK_ID,
      photo_url: "data:image/png;base64,xxx",
      photo_urls: ["a"],
      flock_id: USER_ID,
    });
    assert.equal(payload.photoUrl, undefined);
    assert.equal(payload.hasPhotos, true);
    assert.equal(payload.flockId, USER_ID);
  });

  it("round-trips flock status inbound via legacy payloadToRow", () => {
    const row = payloadToRow("flock", { id: "x", status: "Completed" });
    assert.equal(row.status, "archived");
    assert.equal(FLOCK_STATUS_OUT.archived, "Completed");
  });
});

describe("clevafarm inbound mappers (golden)", () => {
  it("covers all 9 ERPNext outbound entity types", () => {
    assert.equal(INBOUND_ERPNEXT_ENTITY_TYPES.length, 9);
    for (const t of INBOUND_ERPNEXT_ENTITY_TYPES) {
      assert.ok(GOLDEN_INBOUND[t], `missing golden fixture for ${t}`);
    }
  });

  it("maps flock: strips desk keys, maps status", () => {
    const row = mapInboundPayload("flock", GOLDEN_INBOUND.flock);
    assert.equal(row.code, "FLOCK-001");
    assert.equal(row.breed_code, "ROSS308");
    assert.equal(row.placement_date, "2026-01-15");
    assert.equal(row.initial_count, 5000);
    assert.equal(row.status, "active");
    assert.equal(row.target_weight_kg, 2.4);
    assert.equal(row.sync_source, "erpnext");
    assert.equal(row.name, undefined);
    assertOnlyAllowedKeys("flock", row);
  });

  it("maps farm_supplier and farm_barn with normalized_name", () => {
    const supplier = mapInboundPayload("farm_supplier", GOLDEN_INBOUND.farm_supplier);
    assert.equal(supplier.name, "Agro Feed  Ltd");
    assert.equal(supplier.normalized_name, "agro feed ltd");
    assertOnlyAllowedKeys("farm_supplier", supplier);

    const barn = mapInboundPayload("farm_barn", GOLDEN_INBOUND.farm_barn);
    assert.equal(barn.name, "Barn North");
    assert.equal(barn.normalized_name, "barn north");
    assertOnlyAllowedKeys("farm_barn", barn);
  });

  it("maps feed_log: feed_kg not feedKg, recorded_at from logDate", () => {
    const row = mapInboundPayload("feed_log", GOLDEN_INBOUND.feed_log);
    assert.equal(row.flock_id, FLOCK_ID);
    assert.equal(row.feed_kg, 120.5);
    assert.ok(row.recorded_at);
    assert.equal(row.entered_by_user_id, USER_ID);
    assert.equal(row.flockLabel, undefined);
    assertOnlyAllowedKeys("feed_log", row);
  });

  it("maps mortality_log: deadCount → count, not dead_count", () => {
    const row = mapInboundPayload("mortality_log", GOLDEN_INBOUND.mortality_log);
    assert.equal(row.count, 3);
    assert.equal(row.dead_count, undefined);
    assert.equal(row.flock_id, FLOCK_ID);
    assert.equal(row.laborer_id, USER_ID);
    assert.equal(row.source, "erpnext");
    assertOnlyAllowedKeys("mortality_log", row);
  });

  it("maps slaughter_record", () => {
    const row = mapInboundPayload("slaughter_record", GOLDEN_INBOUND.slaughter_record);
    assert.equal(row.birds_slaughtered, 200);
    assert.equal(row.avg_live_weight_kg, 2.1);
    assert.equal(row.flock_id, FLOCK_ID);
    assertOnlyAllowedKeys("slaughter_record", row);
  });

  it("maps farm_treatment", () => {
    const row = mapInboundPayload("farm_treatment", GOLDEN_INBOUND.farm_treatment);
    assert.equal(row.medicine_name, "Amoxicillin");
    assert.equal(row.disease_or_reason, "respiratory");
    assert.equal(row.dose, 10);
    assert.equal(row.dose_unit, "ml");
    assertOnlyAllowedKeys("farm_treatment", row);
  });

  it("maps feed_inventory_transaction without desk keys", () => {
    const row = mapInboundPayload("feed_inventory_transaction", GOLDEN_INBOUND.feed_inventory_transaction);
    assert.equal(row.transaction_type, "purchase");
    assert.equal(row.quantity_kg, 1000);
    assert.equal(row.delta_kg, 1000);
    assert.equal(row.actor_user_id, USER_ID);
    assert.equal(row.flockLabel, undefined);
    assertOnlyAllowedKeys("feed_inventory_transaction", row);
  });

  it("maps farm_medicine_lot", () => {
    const row = mapInboundPayload("farm_medicine_lot", GOLDEN_INBOUND.farm_medicine_lot);
    assert.equal(row.medicine_id, MEDICINE_ID);
    assert.equal(row.lot_number, "LOT-99");
    assert.equal(row.quantity_received, 50);
    assert.equal(row.quantity_remaining, 50);
    assertOnlyAllowedKeys("farm_medicine_lot", row);
  });

  it("applyInsertDefaults sets mortality_log photos and source", () => {
    const row = applyInsertDefaults("mortality_log", { flock_id: FLOCK_ID, count: 1 });
    assert.equal(row.photos, "[]");
    assert.equal(row.source, "erpnext");
  });
});

describe("clevafarm fk resolver", () => {
  it("returns UUID as-is", async () => {
    const id = await resolvePostgresId({ field: "flock_id", value: FLOCK_ID });
    assert.equal(id, FLOCK_ID);
  });

  it("resolves Frappe flock name via migration map", async () => {
    const dbQuery = async () => ({
      rows: [{ legacy_id: FLOCK_ID }],
    });
    const id = await resolvePostgresId({
      field: "flock_id",
      value: "FLOCK-00042",
      dbQuery,
    });
    assert.equal(id, FLOCK_ID);
  });

  it("marks unresolved FK fields", async () => {
    const dbQuery = async () => ({ rows: [] });
    const { row, invalidFkFields } = await resolveInboundForeignKeys(
      "feed_log",
      { flock_id: "NOT-A-UUID", feed_kg: 1 },
      dbQuery
    );
    assert.deepEqual(invalidFkFields, ["flock_id"]);
    assert.equal(row.flock_id, undefined);
    assert.equal(row.feed_kg, 1);
  });
});

describe("clevafarm inbound upsert policy", () => {
  it("returns 422-class error when insert missing required fields", async () => {
    const dbQuery = async (sql) => {
      if (sql.includes("SELECT 1")) return { rows: [] };
      return { rows: [] };
    };
    await assert.rejects(
      () => upsertEntityFromPayload("feed_log", { id: FLOCK_ID, feedKg: 10 }, dbQuery),
      (err) => {
        assert.ok(err instanceof InboundValidationError);
        assert.equal(err.code, "MISSING_REQUIRED");
        assert.ok(err.missingFields.includes("flock_id"));
        return true;
      }
    );
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

  it("emitEntitySync skips DB/outbound during inbound sync (loop guard)", async () => {
    let dbCalled = false;
    initClevaFarmEmit(
      async () => {
        dbCalled = true;
        return { rows: [{ id: FLOCK_ID, status: "active", code: "X" }] };
      },
      () => true
    );

    await withInboundSync(() => emitEntitySync("flock", FLOCK_ID));
    assert.equal(dbCalled, false, "must not load row or enqueue during inbound sync");

    dbCalled = false;
    await emitEntitySync("flock", FLOCK_ID);
    assert.equal(dbCalled, true, "loads row for normal outbound emit path");
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
