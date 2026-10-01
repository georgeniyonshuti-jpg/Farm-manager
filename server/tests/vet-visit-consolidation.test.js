import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { vetLogSchema } from "../utils/validation.js";
import {
  normalizeFieldReportingMode,
  isJuniorVetUser,
  shouldShowLaborerRoundCheckin,
} from "../src/services/fieldReportingMode.js";
import { vetVisitStatusPayload } from "../src/services/vetVisitStatus.js";

describe("fieldReportingMode", () => {
  it("defaults to vet_only", () => {
    assert.equal(normalizeFieldReportingMode(null), "vet_only");
    assert.equal(normalizeFieldReportingMode(""), "vet_only");
  });

  it("detects junior vet users", () => {
    assert.equal(
      isJuniorVetUser({ role: "vet", departmentKeys: ["junior_vet"] }),
      true
    );
    assert.equal(isJuniorVetUser({ role: "vet", departmentKeys: [] }), false);
  });

  it("hides laborer check-in for junior vets and vet_only mode", () => {
    const laborer = { role: "laborer", departmentKeys: [] };
    const junior = { role: "vet", departmentKeys: ["junior_vet"] };
    assert.equal(shouldShowLaborerRoundCheckin(junior, "both"), false);
    assert.equal(shouldShowLaborerRoundCheckin(laborer, "vet_only"), false);
    assert.equal(shouldShowLaborerRoundCheckin(laborer, "laborer_rounds"), true);
    assert.equal(shouldShowLaborerRoundCheckin(laborer, "both"), true);
  });
});

describe("vetLogSchema house round", () => {
  it("accepts visit slot and house round photos", () => {
    const r = vetLogSchema.safeParse({
      flockId: "flock-1",
      logDate: "2026-06-15",
      visitSlot: "am",
      observations: "Birds active",
      coopTemperatureC: 28.5,
      feedAvailable: true,
      waterAvailable: true,
      photosFlockSign: ["data:image/jpeg;base64," + "a".repeat(40)],
      photosThermometer: ["data:image/jpeg;base64," + "b".repeat(40)],
    });
    assert.equal(r.success, true);
  });
});

describe("vetVisitStatusPayload", () => {
  const flock = {
    id: "f1",
    label: "House A",
    placementDate: "2026-01-01",
    status: "active",
    photosRequiredPerRound: 1,
  };
  const deps = {
    logSchedules: [
      {
        flockId: "f1",
        role: "vet",
        logType: "vet_visit",
        intervalHours: 12,
        windowOpen: "07:00",
        windowClose: "10:00",
      },
    ],
    vetLogs: [],
    sameFlockId: (a, b) => String(a) === String(b),
    flockAgeDays: () => 10,
    intervalHoursForAge: () => 12,
    DEFAULT_CHECKIN_BANDS: [{ untilDay: 9999, intervalHours: 12 }],
    safeMsToIso: (ms) => new Date(ms).toISOString(),
  };

  it("marks overdue when no prior visit", () => {
    const status = vetVisitStatusPayload(flock, "vet", deps);
    assert.equal(typeof status.isOverdue, "boolean");
    assert.ok(status.nextDueAt);
    assert.equal(status.intervalSource, "role_schedule");
  });
});
