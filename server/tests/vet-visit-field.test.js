import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { normalizeFieldReportingMode, shouldShowLaborerRoundCheckin } from "../src/services/fieldReportingMode.js";

describe("fieldReportingMode", () => {
  it("defaults to vet_only", () => {
    assert.equal(normalizeFieldReportingMode("x"), "vet_only");
  });
  it("hides laborer check-in when mode is none", () => {
    const laborer = { role: "laborer", departmentKeys: [] };
    assert.equal(shouldShowLaborerRoundCheckin(laborer, "none"), false);
    assert.equal(normalizeFieldReportingMode("none"), "none");
  });
});
