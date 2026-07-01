import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { vetLogSchema } from "../utils/validation.js";
import {
  shouldSyncVetLogOnCreate,
  shouldSyncVetLogOnReview,
  canCreateVetLog,
  canReviewVetLog,
  needsVetLogApproval,
  attachMedicineToVetLog,
  isValidVetLogMedicineDoseUnit,
} from "../src/services/vetLogService.js";

describe("vetLogSchema", () => {
  it("accepts clinical-only payload", () => {
    const r = vetLogSchema.safeParse({
      flockId: "flock-1",
      logDate: "2026-06-15",
      observations: "Birds active",
    });
    assert.equal(r.success, true);
  });

  it("accepts weight sample and medicine", () => {
    const r = vetLogSchema.safeParse({
      flockId: "flock-1",
      logDate: "2026-06-15",
      weightSample: {
        sampleSize: 30,
        avgWeightKg: 1.85,
        totalFeedUsedKg: 1200,
        cvPct: 8.5,
      },
      medicine: {
        medicineName: "Amoxicillin",
        dose: 10,
        doseUnit: "ml",
        route: "drinking_water",
        diseaseOrReason: "respiratory",
      },
    });
    assert.equal(r.success, true);
  });

  it("rejects invalid weight sample", () => {
    const r = vetLogSchema.safeParse({
      flockId: "flock-1",
      logDate: "2026-06-15",
      weightSample: { sampleSize: 0, avgWeightKg: 1.2 },
    });
    assert.equal(r.success, false);
  });

  it("rejects invalid medicine route", () => {
    const r = vetLogSchema.safeParse({
      flockId: "flock-1",
      logDate: "2026-06-15",
      medicine: {
        medicineName: "X",
        dose: 1,
        doseUnit: "ml",
        route: "invalid",
      },
    });
    assert.equal(r.success, false);
  });
});

describe("vet log role permissions", () => {
  it("canCreateVetLog allows vet_manager, manager, and company_admin", () => {
    assert.equal(canCreateVetLog({ role: "vet_manager" }), true);
    assert.equal(canCreateVetLog({ role: "manager" }), true);
    assert.equal(canCreateVetLog({ role: "company_admin" }), true);
    assert.equal(canCreateVetLog({ role: "vet" }), true);
    assert.equal(canCreateVetLog({ role: "laborer" }), false);
  });

  it("canReviewVetLog allows vet_manager, manager, superuser only", () => {
    assert.equal(canReviewVetLog({ role: "vet_manager" }), true);
    assert.equal(canReviewVetLog({ role: "manager" }), true);
    assert.equal(canReviewVetLog({ role: "superuser" }), true);
    assert.equal(canReviewVetLog({ role: "vet" }), false);
  });

  it("needsVetLogApproval only for junior vets", () => {
    assert.equal(needsVetLogApproval({ role: "vet_manager" }), false);
    assert.equal(needsVetLogApproval({ role: "manager" }), false);
    assert.equal(needsVetLogApproval({ role: "vet", departmentKeys: ["junior_vet"] }), true);
    assert.equal(needsVetLogApproval({ role: "vet", departmentKeys: [] }), false);
  });
});

describe("vet log ERPNext sync policy", () => {
  it("syncs on create only when approved", () => {
    assert.equal(shouldSyncVetLogOnCreate("approved"), true);
    assert.equal(shouldSyncVetLogOnCreate("pending_review"), false);
    assert.equal(shouldSyncVetLogOnCreate("rejected"), false);
  });

  it("syncs on review only when approved", () => {
    assert.equal(shouldSyncVetLogOnReview("approve"), true);
    assert.equal(shouldSyncVetLogOnReview("reject"), false);
  });
});

describe("attachMedicineToVetLog", () => {
  const systemConfig = {
    validateAgainstCategory(category, value, fallbacks = []) {
      const codes = {
        treatment_dose_unit: ["ml", "g", "mg", "tablet", "drop", "other"],
        medicine_admin_route: ["drinking_water", "feed_additive", "injection", "topical"],
      };
      const allowed = codes[category] ?? fallbacks;
      return allowed.includes(value);
    },
    getStaticFallbackCodes(category) {
      return [];
    },
  };

  it("accepts medicine_admin_route values like drinking_water", async () => {
    const queries = [];
    const client = {
      query: async (sql, params) => {
        queries.push({ sql, params });
        if (sql.includes("medicine_inventory")) return { rows: [] };
        if (sql.includes("INSERT INTO flock_treatments")) return { rows: [] };
        return { rows: [] };
      },
    };
    const treatmentId = await attachMedicineToVetLog({
      client,
      vetLogId: "vl-12345678",
      flockId: "flock-1",
      authorUserId: "user-1",
      medicine: {
        medicineName: "Amoxicillin",
        dose: 10,
        doseUnit: "ml",
        route: "drinking_water",
      },
      systemConfig,
      treatmentReasonCodes: [],
    });
    assert.match(treatmentId, /^trt_/);
    const insert = queries.find((q) => q.sql.includes("INSERT INTO flock_treatments"));
    assert.ok(insert);
    assert.equal(insert.params[6], "drinking_water");
    assert.match(insert.sql, /'vet_directive'/);
  });

  it("rejects treatment_route-only values like oral", async () => {
    const client = { query: async () => ({ rows: [] }) };
    await assert.rejects(
      () =>
        attachMedicineToVetLog({
          client,
          vetLogId: "vl-12345678",
          flockId: "flock-1",
          authorUserId: "user-1",
          medicine: {
            medicineName: "X",
            dose: 1,
            doseUnit: "ml",
            route: "oral",
          },
          systemConfig,
          treatmentReasonCodes: [],
        }),
      /Invalid route for treatment/
    );
  });
});

describe("isValidVetLogMedicineDoseUnit", () => {
  const systemConfig = {
    validateAgainstCategory(category, value) {
      return category === "treatment_dose_unit" && value === "ml";
    },
    getStaticFallbackCodes() {
      return [];
    },
  };

  it("allows treatment units and vet-log extras", () => {
    assert.equal(isValidVetLogMedicineDoseUnit(systemConfig, "ml"), true);
    assert.equal(isValidVetLogMedicineDoseUnit(systemConfig, "doses"), true);
    assert.equal(isValidVetLogMedicineDoseUnit(systemConfig, "sachets"), true);
    assert.equal(isValidVetLogMedicineDoseUnit(systemConfig, "invalid"), false);
  });
});

describe("fetchVetLogRelatedEntityIds + syncApprovedVetLogEntities", () => {
  it("enqueues vet log, weigh-in, and treatments", async () => {
    const { fetchVetLogRelatedEntityIds, syncApprovedVetLogEntities } = await import(
      "../src/services/vetLogService.js"
    );
    const calls = [];
    const client = {
      query: async () => ({
        rows: [
          {
            weighInId: "wi-1",
            flockId: "flock-1",
            confirmedLiveCount: null,
            treatmentIds: ["trt_a", "trt_b"],
          },
        ],
      }),
    };
    const related = await fetchVetLogRelatedEntityIds(client, "vl-1");
    assert.equal(related.weighInId, "wi-1");
    assert.deepEqual(related.treatmentIds, ["trt_a", "trt_b"]);

    await syncApprovedVetLogEntities(
      (type, id) => calls.push([type, id]),
      client,
      "vl-1"
    );
    assert.deepEqual(calls, [
      ["farm_vet_log", "vl-1"],
      ["farm_weigh_in", "wi-1"],
      ["farm_treatment", "trt_a"],
      ["farm_treatment", "trt_b"],
    ]);
  });
});
