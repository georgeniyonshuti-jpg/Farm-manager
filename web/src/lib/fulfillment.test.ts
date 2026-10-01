import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  handshakeSteps,
  handshakeTone,
  logisticsLabel,
  viewerNeedsConfirm,
} from "./fulfillment.ts";

describe("fulfillment labels", () => {
  it("marks reserved → settled steps", () => {
    const steps = handshakeSteps("buyer_confirmed");
    assert.equal(steps[0].done, true);
    assert.equal(steps.find((s) => s.key === "buyer_confirmed")?.done, true);
    assert.equal(steps.find((s) => s.key === "settled")?.done, false);
  });

  it("buyer still needs confirm until they signed", () => {
    assert.equal(viewerNeedsConfirm("planned", "buyer"), true);
    assert.equal(viewerNeedsConfirm("buyer_confirmed", "buyer"), false);
    assert.equal(viewerNeedsConfirm("buyer_confirmed", "farmer"), true);
    assert.equal(viewerNeedsConfirm("exception", "buyer"), false);
    assert.equal(viewerNeedsConfirm("awaiting_payment", "buyer"), false);
    assert.equal(viewerNeedsConfirm("awaiting_payment", "ops"), false);
  });

  it("awaits payment before reserved", () => {
    const steps = handshakeSteps("awaiting_payment");
    assert.equal(steps[0].key, "awaiting_payment");
    assert.equal(steps[0].done, true);
    assert.equal(steps.find((s) => s.key === "reserved")?.done, false);
    assert.equal(handshakeTone("awaiting_payment"), "warning");
  });

  it("logistics and tones", () => {
    assert.match(logisticsLabel("collect", "farm"), /collect/i);
    assert.equal(handshakeTone("settled"), "success");
    assert.equal(handshakeTone("exception"), "warning");
  });
});
