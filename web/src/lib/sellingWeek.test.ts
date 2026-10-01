import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  listingPhaseCopy,
  placementFromRelative,
  sellingWeekFromPlacement,
  sellingWeekLabel,
} from "./sellingWeek.ts";

describe("sellingWeek client", () => {
  it("maps about 2 weeks to today minus 14", () => {
    assert.equal(placementFromRelative("about_2_weeks", new Date("2026-09-27T10:00:00Z")), "2026-09-13");
  });

  it("suggests selling week from placement", () => {
    const w = sellingWeekFromPlacement("2026-08-01");
    assert.deepEqual(w, { readyFrom: "2026-09-05", readyTo: "2026-09-12" });
    assert.match(sellingWeekLabel(w!.readyFrom, w!.readyTo), /Selling week/);
  });

  it("labels list pills without slaughter", () => {
    assert.equal(listingPhaseCopy("on_the_book").label, "On the book");
    assert.equal(listingPhaseCopy("visit_due").label, "Visit this week");
    assert.equal(listingPhaseCopy("weighed").label, "Weighed");
    assert.equal(listingPhaseCopy("live").label, "Live");
  });
});
