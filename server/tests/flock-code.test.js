import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { buildFlockCode, formatPlacementYymmdd } from "../src/services/flockCode.js";

describe("flockCode", () => {
  describe("formatPlacementYymmdd", () => {
    it("formats YYYY-MM-DD to YYMMDD", () => {
      assert.equal(formatPlacementYymmdd("2026-05-29"), "260529");
      assert.equal(formatPlacementYymmdd("2026-01-05"), "260105");
    });

    it("rejects invalid placement dates", () => {
      assert.throws(() => formatPlacementYymmdd(""), /YYYY-MM-DD/);
      assert.throws(() => formatPlacementYymmdd("05-29-2026"), /YYYY-MM-DD/);
      assert.throws(() => formatPlacementYymmdd("2026/05/29"), /YYYY-MM-DD/);
    });
  });

  describe("buildFlockCode", () => {
    it("combines prefix, placement date, and padded sequence", () => {
      assert.equal(buildFlockCode("2026-05-29", 42), "FM-260529-042");
      assert.equal(buildFlockCode("2026-01-05", 1), "FM-260105-001");
    });

    it("zero-pads single-digit sequences", () => {
      assert.equal(buildFlockCode("2026-05-29", 7), "FM-260529-007");
    });

    it("floors fractional sequences and enforces minimum of 1", () => {
      assert.equal(buildFlockCode("2026-05-29", 42.9), "FM-260529-042");
      assert.equal(buildFlockCode("2026-05-29", 0), "FM-260529-001");
    });
  });
});
