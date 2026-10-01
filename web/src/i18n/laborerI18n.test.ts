import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { isLaborerLocaleUser, laborerLocaleFromUser } from "./laborerLocaleUser.ts";

describe("isLaborerLocaleUser", () => {
  it("returns true for laborers", () => {
    assert.equal(
      isLaborerLocaleUser({
        id: "1",
        email: "a@b.c",
        displayName: "A",
        role: "laborer",
        businessUnitAccess: "farm",
        canViewSensitiveFinancial: false,
        departmentKeys: [],
      }),
      true
    );
  });

  it("returns true for junior vets via departmentKeys", () => {
    assert.equal(
      isLaborerLocaleUser({
        id: "1",
        email: "v@b.c",
        displayName: "V",
        role: "vet",
        businessUnitAccess: "farm",
        canViewSensitiveFinancial: false,
        departmentKeys: ["junior_vet"],
      }),
      true
    );
  });

  it("returns true when erpAppRole is junior_vet", () => {
    assert.equal(
      isLaborerLocaleUser({
        id: "1",
        email: "v@b.c",
        displayName: "V",
        role: "vet",
        businessUnitAccess: "farm",
        canViewSensitiveFinancial: false,
        departmentKeys: [],
        erpAppRole: "junior_vet",
      }),
      true
    );
  });

  it("returns false for vet managers and admins", () => {
    assert.equal(
      isLaborerLocaleUser({
        id: "1",
        email: "m@b.c",
        displayName: "M",
        role: "vet_manager",
        businessUnitAccess: "farm",
        canViewSensitiveFinancial: false,
        departmentKeys: [],
      }),
      false
    );
    assert.equal(isLaborerLocaleUser(null), false);
  });
});

describe("laborerLocaleFromUser", () => {
  it("mirrors isLaborerLocaleUser role checks", () => {
    assert.equal(laborerLocaleFromUser("laborer", []), true);
    assert.equal(laborerLocaleFromUser("vet", ["junior_vet"]), true);
    assert.equal(laborerLocaleFromUser("vet", [], "junior_vet"), true);
    assert.equal(laborerLocaleFromUser("vet", []), false);
  });
});
