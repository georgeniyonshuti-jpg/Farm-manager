import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import {
  validateAgainstCategory,
  initializeMemoryDefaults,
  getStaticFallbackCodes,
} from "../systemConfig.js";

describe("validateAgainstCategory", () => {
  beforeEach(() => {
    initializeMemoryDefaults();
  });

  it("accepts feed_type via static fallbacks when category not in memory", () => {
    assert.equal(validateAgainstCategory("feed_type", "starter"), true);
    assert.equal(validateAgainstCategory("feed_type", "invalid_type"), false);
  });

  it("uses explicit fallbackCodes when active set is empty", () => {
    assert.equal(
      validateAgainstCategory("unknown_category_xyz", "custom", ["custom"]),
      true
    );
  });

  it("does not throw when fallbacks omitted and category absent from memory", () => {
    assert.equal(validateAgainstCategory("unknown_category_xyz", "nope"), false);
  });

  it("getStaticFallbackCodes includes feed types", () => {
    const codes = getStaticFallbackCodes("feed_type");
    assert.ok(codes.includes("starter"));
    assert.ok(codes.includes("grower"));
  });
});
