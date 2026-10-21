import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { hashReachVisitor, normalizeReachSource, summarizeReach } from "../src/services/pipeline/marketReach.js";

describe("market reach", () => {
  it("keeps short source codes and treats a blank visit as direct", () => {
    assert.equal(normalizeReachSource("instagram"), "instagram");
    assert.equal(normalizeReachSource("IG"), "instagram");
    assert.equal(normalizeReachSource("wa"), "whatsapp");
    assert.equal(normalizeReachSource(""), "direct");
    assert.equal(normalizeReachSource("not a source!!"), "notasource");
  });

  it("hashes a visitor id and refuses anything else", () => {
    const hash = hashReachVisitor("11111111-1111-4111-8111-111111111111");
    assert.equal(hash?.length, 64);
    assert.equal(hashReachVisitor("11111111-1111-4111-8111-111111111111"), hash);
    assert.equal(hashReachVisitor("alice@example.com"), null);
  });

  it("sums the week and splits opens by source", () => {
    const summary = summarizeReach([
      { eventType: "opened", source: "instagram", n: 4 },
      { eventType: "opened", source: "direct", n: 1 },
      { eventType: "join_started", source: "instagram", n: 2 },
      { eventType: "account_created", source: "whatsapp", n: 1 },
    ]);
    assert.deepEqual(summary.week, { opened: 5, joinStarted: 2, accounts: 1 });
    assert.equal(summary.sources[0].source, "instagram");
    assert.equal(summary.sources[0].opened, 4);
  });
});
