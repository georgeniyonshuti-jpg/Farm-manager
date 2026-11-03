import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { pickButcher, zoneForSector, zoneSectorConflicts } from "../src/services/shop/assignButcher.js";
import {
  hashToken,
  newOrderRef,
  newTrackToken,
  normalizeOrderRef,
  trackTokenMatches,
} from "../src/services/shop/orderRef.js";

const zones = [
  { id: "z1", name: "Kicukiro centre", district: "Kicukiro", sectors: ["Kicukiro", "Niboye"], active: true },
  { id: "z2", name: "Remera", district: "Gasabo", sectors: ["Remera", "Kimihurura"], active: true },
  { id: "z3", name: "Old Kanombe", district: "Kicukiro", sectors: ["Kanombe"], active: false },
];

describe("shop zones", () => {
  it("finds the zone by district and sector, ignoring case and spaces", () => {
    assert.equal(zoneForSector(zones, " kicukiro ", "NIBOYE")?.id, "z1");
    assert.equal(zoneForSector(zones, "Gasabo", "Kimihurura")?.id, "z2");
  });

  it("does not match a sector name in another district", () => {
    assert.equal(zoneForSector(zones, "Gasabo", "Niboye"), null);
  });

  it("skips inactive zones and blank places", () => {
    assert.equal(zoneForSector(zones, "Kicukiro", "Kanombe"), null);
    assert.equal(zoneForSector(zones, "", "Remera"), null);
  });

  it("finds sectors another active zone already serves", () => {
    const clash = zoneSectorConflicts(zones, { id: "new", name: "New", district: "Kicukiro", sectors: ["niboye", "Kanombe"] });
    assert.deepEqual(clash, [{ sector: "niboye", zoneId: "z1", zoneName: "Kicukiro centre" }]);
    assert.deepEqual(zoneSectorConflicts(zones, zones[0]), []);
    assert.deepEqual(zoneSectorConflicts(zones, { ...zones[0], id: "new", active: false }), []);
  });
});

describe("pick butcher", () => {
  it("takes the active butcher with the lowest priority number", () => {
    const r = pickButcher([
      { butcherId: "b-2", status: "active", priority: 20 },
      { butcherId: "b-1", status: "paused", priority: 1 },
      { butcherId: "b-3", status: "active", priority: 10 },
    ]);
    assert.deepEqual(r, { butcherId: "b-3", choices: 2 });
  });

  it("breaks ties by id so the choice is stable", () => {
    const r = pickButcher([
      { butcherId: "b-9", status: "active", priority: 5 },
      { butcherId: "b-4", status: "active", priority: 5 },
    ]);
    assert.equal(r.butcherId, "b-4");
  });

  it("returns no butcher when none is active", () => {
    assert.deepEqual(pickButcher([{ butcherId: "b-1", status: "ended" }]), { butcherId: null, choices: 0 });
    assert.deepEqual(pickButcher([]), { butcherId: null, choices: 0 });
  });
});

describe("order ref and tracking token", () => {
  it("makes readable refs that round-trip", () => {
    for (let i = 0; i < 50; i += 1) {
      const ref = newOrderRef();
      assert.match(ref, /^CK-[2-9A-HJKMNP-Z]{6}$/);
      assert.equal(normalizeOrderRef(ref.toLowerCase()), ref);
    }
    assert.equal(normalizeOrderRef("CK-0O1IL0"), "");
    assert.equal(normalizeOrderRef("anything"), "");
  });

  it("checks a token against its hash only", () => {
    const token = newTrackToken();
    const stored = hashToken(token);
    assert.notEqual(stored, token);
    assert.equal(trackTokenMatches(token, stored), true);
    assert.equal(trackTokenMatches(newTrackToken(), stored), false);
    assert.equal(trackTokenMatches("", stored), false);
    assert.equal(trackTokenMatches(token, ""), false);
  });
});
