import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { readScoutInvite, saveScoutInvite, scoutInviteKey } from "./scoutInvite.ts";

describe("scout invite handoff storage", () => {
  it("round-trips the invite link for one farm only", () => {
    const mem = new Map<string, string>();
    globalThis.sessionStorage = {
      getItem: (k: string) => mem.get(k) ?? null,
      setItem: (k: string, v: string) => {
        mem.set(k, v);
      },
      removeItem: (k: string) => {
        mem.delete(k);
      },
      clear: () => mem.clear(),
      key: () => null,
      length: 0,
    } as Storage;
    saveScoutInvite("farm-a", { url: "https://farm.cleva.rw/signup?from=market&claim=abc", emailSent: false });
    assert.equal(readScoutInvite("farm-a")?.url.includes("claim=abc"), true);
    assert.equal(readScoutInvite("farm-b"), null);
    assert.match(scoutInviteKey("farm-a"), /farm-a/);
  });
});
