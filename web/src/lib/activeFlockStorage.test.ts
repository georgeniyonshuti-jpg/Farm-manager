import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  activeFlockStorageKey,
  resolveActiveFlockId,
} from "./activeFlockStorage.ts";
import { fieldRoute, readFlockIdFromSearch } from "./fieldRoutes.ts";

describe("activeFlockStorageKey", () => {
  it("scopes storage per tenant slug", () => {
    assert.equal(activeFlockStorageKey("acme-farm"), "cleva-farm:active-flock:acme-farm");
    assert.equal(activeFlockStorageKey(""), "cleva-farm:active-flock:default-farm");
  });
});

describe("resolveActiveFlockId", () => {
  const flockIds = ["flock-a", "flock-b", "flock-c"];

  it("prefers URL flock when valid", () => {
    assert.equal(
      resolveActiveFlockId({
        flockIds,
        urlFlockId: "flock-b",
        storedFlockId: "flock-c",
        primaryFlockId: "flock-a",
      }),
      "flock-b"
    );
  });

  it("falls back to storage when URL missing or invalid", () => {
    assert.equal(
      resolveActiveFlockId({
        flockIds,
        urlFlockId: "unknown",
        storedFlockId: "flock-c",
        primaryFlockId: "flock-a",
      }),
      "flock-c"
    );
  });

  it("falls back to primary when URL and storage invalid", () => {
    assert.equal(
      resolveActiveFlockId({
        flockIds,
        urlFlockId: null,
        storedFlockId: "stale",
        primaryFlockId: "flock-a",
      }),
      "flock-a"
    );
  });

  it("falls back to first flock when nothing else matches", () => {
    assert.equal(
      resolveActiveFlockId({
        flockIds,
        urlFlockId: null,
        storedFlockId: null,
        primaryFlockId: null,
      }),
      "flock-a"
    );
  });

  it("returns empty when allowEmpty and no single-flock shortcut", () => {
    assert.equal(
      resolveActiveFlockId({
        flockIds,
        urlFlockId: null,
        storedFlockId: null,
        primaryFlockId: null,
        allowEmpty: true,
      }),
      ""
    );
  });

  it("auto-picks sole flock even when allowEmpty", () => {
    assert.equal(
      resolveActiveFlockId({
        flockIds: ["only-one"],
        allowEmpty: true,
      }),
      "only-one"
    );
  });
});

describe("fieldRoute", () => {
  it("appends flockId to path without query", () => {
    assert.equal(fieldRoute("/farm/vet-logs", "flock-b"), "/farm/vet-logs?flockId=flock-b");
  });

  it("preserves and merges existing query params", () => {
    assert.equal(
      fieldRoute("/farm/vet-logs?log=1&step=1", "flock-b"),
      "/farm/vet-logs?log=1&step=1&flockId=flock-b"
    );
  });

  it("replaces existing flockId param", () => {
    assert.equal(
      fieldRoute("/farm/checkin?flockId=old", "new"),
      "/farm/checkin?flockId=new"
    );
  });

  it("returns path unchanged when flockId omitted", () => {
    assert.equal(fieldRoute("/farm/feed?tab=stock"), "/farm/feed?tab=stock");
  });
});

describe("readFlockIdFromSearch", () => {
  it("reads flockId from search string", () => {
    assert.equal(readFlockIdFromSearch("?log=1&flockId=abc"), "abc");
    assert.equal(readFlockIdFromSearch(""), null);
  });
});
