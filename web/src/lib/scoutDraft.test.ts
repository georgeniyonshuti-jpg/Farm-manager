import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  clearScoutDraft,
  emptyScoutDraft,
  readScoutDraft,
  scoutDraftIsUseful,
  writeScoutDraft,
} from "./scoutDraft.ts";

describe("scoutDraft", () => {
  it("round-trips a useful draft and keeps flock context", () => {
    clearScoutDraft();
    const draft = emptyScoutDraft({
      mode: "offplatform",
      flockId: "flock-1",
      displayName: "Hillside",
      district: "Kayonza",
    });
    assert.equal(scoutDraftIsUseful(draft), true);
    writeScoutDraft(draft);
    const next = readScoutDraft();
    assert.equal(next?.displayName, "Hillside");
    assert.equal(next?.flockId, "flock-1");
    clearScoutDraft();
    assert.equal(readScoutDraft(), null);
  });
});
