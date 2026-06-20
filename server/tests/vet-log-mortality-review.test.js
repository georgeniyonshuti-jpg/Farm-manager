import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { vetLogSchema } from "../utils/validation.js";
import {
  validateMortalityReview,
  buildMortalityReviewContext,
  queryMortalityToDate,
} from "../src/services/vetLogMortalityReview.js";

describe("vetLogSchema mortalityReview", () => {
  it("accepts mortality review with adjustments only", () => {
    const r = vetLogSchema.safeParse({
      flockId: "flock-1",
      logDate: "2026-06-15",
      mortalityReview: {
        loggedSinceLastVisit: 12,
        mortalityAdjustments: [{ eventId: "a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11", count: 10 }],
      },
    });
    assert.equal(r.success, true);
  });

  it("accepts confirmedSinceLastVisit when no events", () => {
    const r = vetLogSchema.safeParse({
      flockId: "flock-1",
      logDate: "2026-06-15",
      mortalityReview: {
        loggedSinceLastVisit: 0,
        confirmedSinceLastVisit: 5,
      },
    });
    assert.equal(r.success, true);
  });

  it("requires loggedSinceLastVisit", () => {
    const r = vetLogSchema.safeParse({
      flockId: "flock-1",
      logDate: "2026-06-15",
      mortalityReview: { confirmedSinceLastVisit: 5 },
    });
    assert.equal(r.success, false);
  });
});

describe("validateMortalityReview", () => {
  it("validates adjustments when events exist", () => {
    const out = validateMortalityReview(
      {
        loggedSinceLastVisit: 8,
        mortalityAdjustments: [{ eventId: "a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11", count: 5 }],
      },
      true
    );
    assert.equal(out.loggedSinceLastVisit, 8);
    assert.equal(out.adjustments.length, 1);
  });

  it("requires confirmedSinceLastVisit when no events in window", () => {
    assert.throws(() =>
      validateMortalityReview({ loggedSinceLastVisit: 0 }, false)
    );
  });

  it("accepts confirmedSinceLastVisit when no events", () => {
    const out = validateMortalityReview(
      { loggedSinceLastVisit: 0, confirmedSinceLastVisit: 15 },
      false
    );
    assert.equal(out.confirmedSinceLastVisit, 15);
  });
});

describe("buildMortalityReviewContext", () => {
  it("computes logged since last visit from mock events", async () => {
    const prevDate = new Date("2026-05-01T10:00:00Z");
    const client = {
      query: async (sql) => {
        if (sql.includes("FROM farm_vet_logs")) {
          return {
            rows: [{ id: "vl-prev", logDate: "2026-05-01", createdAt: prevDate }],
          };
        }
        if (sql.includes("FROM flock_mortality_events")) {
          return {
            rows: [
              {
                id: "m1",
                at: new Date("2026-05-10T08:00:00Z"),
                count: 5,
                submissionStatus: "approved",
                affectsLiveCount: true,
                source: "adhoc",
                notes: null,
                laborerName: "Jean",
              },
              {
                id: "m2",
                at: new Date("2026-05-12T08:00:00Z"),
                count: 3,
                submissionStatus: "approved",
                affectsLiveCount: true,
                source: "linked",
                notes: null,
                laborerName: "Jean",
              },
            ],
          };
        }
        return { rows: [] };
      },
    };
    const ctx = await buildMortalityReviewContext({
      client,
      flockId: "flock-1",
      beforeDate: "2026-06-15",
      initialCount: 5000,
      slaughterToDate: 0,
      mortalityToDate: 150,
    });
    assert.equal(ctx.loggedSinceLastVisit, 8);
    assert.equal(ctx.events.length, 2);
    assert.equal(ctx.computedBirdsLive, 4850);
  });
});

describe("queryMortalityToDate", () => {
  it("sums approved affecting mortality", async () => {
    const client = {
      query: async () => ({ rows: [{ total: 142 }] }),
    };
    assert.equal(await queryMortalityToDate(client, "flock-1"), 142);
  });
});

describe("syncApprovedVetLogEntities with computed live snapshot", () => {
  it("enqueues flock when vet log has confirmed live count", async () => {
    const { syncApprovedVetLogEntities } = await import("../src/services/vetLogService.js");
    const calls = [];
    const client = {
      query: async () => ({
        rows: [
          {
            weighInId: null,
            flockId: "flock-1",
            confirmedLiveCount: 4800,
            treatmentIds: [],
          },
        ],
      }),
    };
    await syncApprovedVetLogEntities((type, id) => calls.push([type, id]), client, "vl-1");
    assert.deepEqual(calls, [
      ["farm_vet_log", "vl-1"],
      ["flock", "flock-1"],
    ]);
  });
});
