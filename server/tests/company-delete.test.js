import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  DEFAULT_COMPANY_ID,
  assertCompanyDeletable,
  invalidateSessionsForCompany,
} from "../src/services/tenant/companyDelete.js";
import {
  filterInventoryForUser,
  appendSqlInventoryCompanyFilter,
} from "../src/services/tenant/companyIsolation.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const COMPANY_A = "11111111-1111-4111-8111-111111111111";
const COMPANY_B = "22222222-2222-4222-8222-222222222222";

describe("companyDelete helpers", () => {
  it("blocks deletion of default company", () => {
    assert.throws(
      () => assertCompanyDeletable(DEFAULT_COMPANY_ID, "default-farm", "default-farm"),
      /default company/i
    );
  });

  it("requires matching slug confirmation", () => {
    assert.throws(
      () => assertCompanyDeletable(COMPANY_A, "wrong-slug", "acme-farm"),
      /slug confirmation/i
    );
    assert.doesNotThrow(() => assertCompanyDeletable(COMPANY_A, "acme-farm", "acme-farm"));
  });

  it("invalidateSessionsForCompany removes sessions for tenant users only", () => {
    const sessions = new Map([
      ["t1", { userId: "u1", exp: Date.now() + 1000 }],
      ["t2", { userId: "u2", exp: Date.now() + 1000 }],
      ["t3", { userId: "u3", exp: Date.now() + 1000 }],
    ]);
    const usersById = new Map([
      ["u1", { id: "u1", companyId: COMPANY_A }],
      ["u2", { id: "u2", companyId: COMPANY_B }],
      ["u3", { id: "u3", companyId: COMPANY_A }],
    ]);
    const removed = invalidateSessionsForCompany(sessions, usersById, COMPANY_A);
    assert.equal(removed, 2);
    assert.equal(sessions.has("t1"), false);
    assert.equal(sessions.has("t2"), true);
    assert.equal(sessions.has("t3"), false);
  });

  it("deleteCompanyHard clears pipeline matches and lots for the tenant", async () => {
    const src = await readFile(
      path.resolve(__dirname, "../src/services/tenant/companyDelete.js"),
      "utf8"
    );
    assert.match(src, /DELETE FROM pipeline_matches/);
    assert.match(src, /DELETE FROM pipeline_lots/);
    assert.match(src, /DELETE FROM poultry_sales_orders/);
  });
});

describe("inventory tenant isolation helpers", () => {
  it("filterInventoryForUser scopes rows by company_id", () => {
    const rows = [
      { id: "1", companyId: COMPANY_A },
      { id: "2", companyId: COMPANY_B },
      { id: "3", companyId: null, actorUserId: "u1" },
    ];
    const usersById = new Map([["u1", { companyId: COMPANY_A }]]);
    const manager = { role: "manager", companyId: COMPANY_A };
    const filtered = filterInventoryForUser(rows, manager, COMPANY_A, usersById);
    assert.deepEqual(filtered.map((r) => r.id), ["1", "3"]);
  });

  it("appendSqlInventoryCompanyFilter adds strict company predicate", () => {
    const params = [];
    const sql = appendSqlInventoryCompanyFilter("SELECT 1 WHERE true", params, COMPANY_A, "t");
    assert.match(sql, /t\.company_id = \$1::uuid/);
    assert.deepEqual(params, [COMPANY_A]);
  });
});
