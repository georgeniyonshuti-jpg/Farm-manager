import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { departmentKeysFromIdentity } from "../src/services/clevaSso.js";
import { canUseLaborerTranslate, isJuniorVetUser } from "../src/services/fieldReportingMode.js";

describe("departmentKeysFromIdentity", () => {
  it("seeds junior_vet from farm_bootstrap role", () => {
    const keys = departmentKeysFromIdentity({ farm_bootstrap: { role: "junior_vet" } }, []);
    assert.deepEqual(keys, ["junior_vet"]);
  });

  it("preserves existing department keys", () => {
    const keys = departmentKeysFromIdentity(
      { farm_bootstrap: { role: "junior_vet" } },
      ["coop_a"]
    );
    assert.deepEqual(keys.sort(), ["coop_a", "junior_vet"].sort());
  });

  it("ignores non-junior-vet roles", () => {
    const keys = departmentKeysFromIdentity({ farm_bootstrap: { role: "vet_manager" } }, ["x"]);
    assert.deepEqual(keys, ["x"]);
  });
});

describe("canUseLaborerTranslate", () => {
  it("allows laborers and dispatchers", () => {
    assert.equal(canUseLaborerTranslate({ role: "laborer", departmentKeys: [] }), true);
    assert.equal(canUseLaborerTranslate({ role: "dispatcher", departmentKeys: [] }), true);
  });

  it("allows junior vets on translate endpoint", () => {
    assert.equal(
      canUseLaborerTranslate({ role: "vet", departmentKeys: ["junior_vet"] }),
      true
    );
    assert.equal(isJuniorVetUser({ role: "vet", departmentKeys: ["junior_vet"] }), true);
  });

  it("blocks vet managers and plain vets", () => {
    assert.equal(canUseLaborerTranslate({ role: "vet", departmentKeys: [] }), false);
    assert.equal(canUseLaborerTranslate({ role: "vet_manager", departmentKeys: [] }), false);
    assert.equal(canUseLaborerTranslate({ role: "company_admin", departmentKeys: [] }), false);
  });
});
