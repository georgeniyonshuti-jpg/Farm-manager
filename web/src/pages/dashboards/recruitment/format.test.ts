import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { formatRate, paceLabel, rangeFor } from "./format.ts";

describe("recruitment display", () => {
  it("prints a rate as x of n and refuses a rate over 100%", () => {
    assert.equal(formatRate(3, 8), "3 of 8 (37.5%)");
    assert.equal(formatRate(11, 1), "check data");
    assert.equal(formatRate(0, 0), "n/a");
  });

  it("names pace in words", () => {
    assert.equal(paceLabel("behind"), "Behind pace");
    assert.equal(paceLabel("on_track"), "On track");
  });

  it("builds a 7-day and a 90-day window ending today in Kigali", () => {
    const week = rangeFor("7", new Date("2026-10-22T10:00:00Z"));
    assert.equal(week.to, "2026-10-22");
    assert.equal(week.from, "2026-10-16");
    const quarter = rangeFor("90", new Date("2026-10-22T10:00:00Z"));
    assert.equal(quarter.to, "2026-10-22");
    assert.equal(quarter.from, "2026-07-25");
  });
});
