import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  ALLOWED_PACK_IDS,
  mergePackPreferences,
  normalizePackPayload,
  packsSettingsKey,
} from "../src/services/insightsPacks.js";

describe("insightsPacks", () => {
  it("packsSettingsKey is company-scoped", () => {
    assert.equal(packsSettingsKey("abc-123"), "insights_packs:abc-123");
  });

  it("mergePackPreferences applies defaults", () => {
    const { packs } = mergePackPreferences(null);
    assert.ok(packs.length >= 5);
    assert.equal(packs.find((p) => p.id === "executive")?.enabled, true);
    assert.equal(packs.find((p) => p.id === "finance")?.enabled, false);
  });

  it("normalizePackPayload from array disables unlisted", () => {
    const prefs = normalizePackPayload([{ id: "executive", enabled: true }, "growth"]);
    assert.equal(prefs.executive, true);
    assert.equal(prefs.growth, true);
    assert.equal(prefs.feed, false);
    assert.equal(prefs.health, false);
  });

  it("normalizePackPayload from object keeps only allowed ids", () => {
    const prefs = normalizePackPayload({ executive: 1, nope: true, feed: false });
    assert.equal(prefs.executive, true);
    assert.equal(prefs.feed, false);
    assert.equal(Object.prototype.hasOwnProperty.call(prefs, "nope"), false);
    for (const id of Object.keys(prefs)) {
      assert.ok(ALLOWED_PACK_IDS.has(id));
    }
  });
});
