import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { formatOverdueMinutes, triageNeedsAction } from "./fieldFlockTriage.ts";
import type { FieldFlockTriageRow } from "../../context/ActiveFlockContext";

function row(partial: Partial<FieldFlockTriageRow> & Pick<FieldFlockTriageRow, "flockId">): FieldFlockTriageRow {
  return {
    label: partial.flockId,
    isOverdue: false,
    overdueMinutes: 0,
    nextDueAt: new Date().toISOString(),
    visitDoneToday: false,
    checkinDoneToday: false,
    ...partial,
  };
}

describe("triageNeedsAction", () => {
  it("requires action when overdue even if visit logged today (vet)", () => {
    const r = row({
      flockId: "a",
      visitDoneToday: true,
      isOverdue: true,
      overdueMinutes: 407,
    });
    assert.equal(triageNeedsAction(r, "vet_visit"), true);
  });

  it("requires action when overdue even if check-in logged today", () => {
    const r = row({
      flockId: "a",
      checkinDoneToday: true,
      isOverdue: true,
      overdueMinutes: 30,
    });
    assert.equal(triageNeedsAction(r, "checkin"), true);
  });

  it("no action when visit done today and not overdue", () => {
    const r = row({ flockId: "a", visitDoneToday: true, isOverdue: false });
    assert.equal(triageNeedsAction(r, "vet_visit"), false);
  });

  it("requires action when visit not done today and not overdue", () => {
    const r = row({ flockId: "a", visitDoneToday: false, isOverdue: false });
    assert.equal(triageNeedsAction(r, "vet_visit"), true);
  });
});

describe("formatOverdueMinutes", () => {
  it("formats under one hour as minutes", () => {
    assert.equal(formatOverdueMinutes(1), "1m");
    assert.equal(formatOverdueMinutes(30), "30m");
    assert.equal(formatOverdueMinutes(59), "59m");
  });

  it("formats hours under a day without raw minute dumps", () => {
    assert.equal(formatOverdueMinutes(60), "1h");
    assert.equal(formatOverdueMinutes(488), "8h");
    assert.equal(formatOverdueMinutes(1439), "23h");
  });

  it("formats a day-plus overdue as days and hours", () => {
    assert.equal(formatOverdueMinutes(1440), "1d");
    assert.equal(formatOverdueMinutes(1616), "1d 2h");
    assert.equal(formatOverdueMinutes(0), "1m");
  });
});
