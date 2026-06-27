import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  isPlatformSuperuser,
  assertSameCompany,
  flockVisibleToUser,
  filterFlocksForUser,
  memoryFlockIdVisible,
  appendSqlFlockCompanyFilter,
} from "../src/services/tenant/companyIsolation.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const serverJs = await readFile(path.resolve(__dirname, "../server.js"), "utf8");

const COMPANY_A = "11111111-1111-4111-8111-111111111111";
const COMPANY_B = "22222222-2222-4222-8222-222222222222";

describe("companyIsolation helpers", () => {
  it("isPlatformSuperuser returns true only for superuser role", () => {
    assert.equal(isPlatformSuperuser({ role: "superuser" }), true);
    assert.equal(isPlatformSuperuser({ role: "manager" }), false);
    assert.equal(isPlatformSuperuser(null), false);
  });

  it("assertSameCompany allows superuser cross-company access", () => {
    const superuser = { role: "superuser", companyId: COMPANY_A };
    const flock = { companyId: COMPANY_B };
    assert.equal(assertSameCompany(flock, superuser), true);
  });

  it("assertSameCompany denies mismatched companies for non-superusers", () => {
    const manager = { role: "manager", companyId: COMPANY_A };
    const otherFlock = { companyId: COMPANY_B };
    const ownFlock = { companyId: COMPANY_A };
    assert.equal(assertSameCompany(otherFlock, manager), false);
    assert.equal(assertSameCompany(ownFlock, manager), true);
  });

  it("assertSameCompany rejects NULL company_id (no bypass)", () => {
    const manager = { role: "manager", companyId: COMPANY_A };
    assert.equal(assertSameCompany({ companyId: null }, manager), false);
    assert.equal(assertSameCompany({ companyId: COMPANY_A }, { role: "manager", companyId: null }), false);
  });

  it("filterFlocksForUser scopes lists strictly by company", () => {
    const flocks = [
      { id: "1", companyId: COMPANY_A },
      { id: "2", companyId: COMPANY_B },
      { id: "3", companyId: null },
    ];
    const manager = { role: "manager", companyId: COMPANY_A };
    const filtered = filterFlocksForUser(flocks, manager, COMPANY_A);
    assert.deepEqual(filtered.map((f) => f.id), ["1"]);
    assert.equal(filterFlocksForUser(flocks, { role: "superuser", companyId: COMPANY_A }).length, 3);
  });

  it("memoryFlockIdVisible respects flock company in memory map", () => {
    const flocksById = new Map([
      ["f1", { companyId: COMPANY_A }],
      ["f2", { companyId: COMPANY_B }],
    ]);
    const manager = { role: "manager", companyId: COMPANY_A };
    assert.equal(memoryFlockIdVisible("f1", flocksById, manager, COMPANY_A), true);
    assert.equal(memoryFlockIdVisible("f2", flocksById, manager, COMPANY_A), false);
    assert.equal(memoryFlockIdVisible("f2", flocksById, { role: "superuser" }, COMPANY_A), true);
  });

  it("appendSqlFlockCompanyFilter adds strict equality predicate", () => {
    const params = ["x"];
    const sql = appendSqlFlockCompanyFilter("SELECT 1 WHERE true", params, COMPANY_A, "f");
    assert.match(sql, /f\.company_id = \$2::uuid/);
    assert.deepEqual(params, ["x", COMPANY_A]);
  });

  it("flockVisibleToUser has no NULL bypass", () => {
    const manager = { role: "manager", companyId: COMPANY_A };
    assert.equal(flockVisibleToUser({ companyId: null }, manager, COMPANY_A), false);
    assert.equal(flockVisibleToUser({ companyId: COMPANY_A }, manager, COMPANY_A), true);
  });
});

describe("server.js cross-tenant isolation guards", () => {
  it("getFlockByIdForUser enforces assertSameCompany", () => {
    const block = extractFunctionBlock(serverJs, "async function getFlockByIdForUser");
    assert.ok(block, "getFlockByIdForUser must exist");
    assert.ok(block.includes("assertSameCompany"), "Must check company ownership");
    assert.ok(block.includes('status(404)'), "Mismatch must return 404");
  });

  it("GET /api/flocks uses filterFlocksForUser (strict, no NULL bypass)", () => {
    const block = extractRouteBlock(serverJs, "/api/flocks");
    assert.ok(block, "GET /api/flocks route must exist");
    assert.ok(block.includes("filterFlocksForUser"), "Must filter flocks by company");
    assert.ok(!block.includes("!f.companyId ||"), "Must not treat NULL companyId as visible");
  });

  it("GET /api/check-ins uses appendSqlFlockCompanyFilter for non-superusers", () => {
    const block = extractRouteBlock(serverJs, "/api/check-ins");
    assert.ok(block?.includes("appendSqlFlockCompanyFilter"), "Must SQL-filter check-ins by flock company");
    assert.ok(!block?.includes("company_id IS NULL OR"), "Must not bypass NULL company_id");
  });

  it("resource-by-id review routes verify flock company", () => {
    for (const route of [
      "/api/check-ins/:id/review",
      "/api/feed-entries/:id/review",
      "/api/mortality-events/:id/review",
      "/api/vet-logs/:id/review",
      "/api/treatment-rounds/:id/status",
    ]) {
      const block = extractRouteBlock(serverJs, route);
      assert.ok(block, `${route} must exist`);
      assert.ok(
        block.includes("verifyResourceByFlockTable") || block.includes("getFlockByIdForUser"),
        `${route} must verify company via flock join or central guard`
      );
    }
  });

  it("payroll approve routes verify company before mutation", () => {
    const approve = extractRouteBlock(serverJs, "/api/payroll-impact/:id/approve");
    const bulk = extractRouteBlock(serverJs, "/api/payroll-impact/bulk-approve");
    assert.ok(approve?.includes("verifyPayrollImpactCompany"), "Single approve must verify company");
    assert.ok(bulk?.includes("u.company_id"), "Bulk approve must scope DB update by user company");
    assert.ok(bulk?.includes("memoryFlockIdVisible"), "Bulk approve memory fallback must scope by company");
  });

  it("GET /api/farm/ops-board scopes active flocks by company", () => {
    const block = extractRouteBlock(serverJs, "/api/farm/ops-board");
    assert.ok(block?.includes("activeFlockIdsSql"), "Must use company-scoped active flock subquery");
    assert.ok(block?.includes("company_id"), "Must filter by company_id");
  });

  it("CSV report routes filter by company for non-superusers", () => {
    for (const route of [
      "/api/reports/mortality.csv",
      "/api/reports/feed-inventory.csv",
      "/api/reports/flocks.csv",
      "/api/reports/medicine-tracking.csv",
      "/api/reports/treatments.csv",
      "/api/reports/slaughter.csv",
      "/api/reports/flock-performance.csv",
    ]) {
      const block = extractRouteBlock(serverJs, route);
      assert.ok(block, `${route} must exist`);
      assert.ok(
        block.includes("appendSqlFlockCompanyFilter") ||
          block.includes("filterFlocksForUser") ||
          block.includes("requireFlockForReport"),
        `${route} must scope data by company`
      );
    }
  });

  it("POST /api/users assigns company from body or creator (not hard-coded default only)", () => {
    const block = extractRouteBlock(serverJs, "/api/users");
    const postBlock = block?.includes("app.post") ? block : serverJs.slice(serverJs.indexOf('app.post("/api/users"'));
    assert.ok(postBlock?.includes("companyId") || postBlock?.includes("company_id"), "Must set company on new users");
  });

  it("backfill migration exists for NULL company_id", async () => {
    const migration = await readFile(
      path.resolve(__dirname, "../../database/migrations/052_backfill_null_company_id.sql"),
      "utf8"
    );
    assert.ok(migration.includes("UPDATE users"), "Must backfill users.company_id");
    assert.ok(migration.includes("UPDATE poultry_flocks"), "Must backfill poultry_flocks.company_id");
    assert.ok(migration.includes("WHERE company_id IS NULL"), "Must only touch NULL rows");
  });
});

function extractRouteBlock(source, routePattern) {
  const needle = `"${routePattern}"`;
  const idx = source.indexOf(needle);
  if (idx === -1) return null;
  let depth = 0;
  let start = -1;
  for (let i = idx; i < source.length; i++) {
    if (source[i] === "{") {
      if (start === -1) start = i;
      depth++;
    }
    if (source[i] === "}") {
      depth--;
      if (depth === 0 && start !== -1) {
        return source.slice(idx, i + 1);
      }
    }
  }
  return source.slice(idx, Math.min(idx + 8000, source.length));
}

function extractFunctionBlock(source, functionSignature) {
  const idx = source.indexOf(functionSignature);
  if (idx === -1) return null;
  let depth = 0;
  let start = -1;
  for (let i = idx; i < source.length; i++) {
    if (source[i] === "{") {
      if (start === -1) start = i;
      depth++;
    }
    if (source[i] === "}") {
      depth--;
      if (depth === 0 && start !== -1) {
        return source.slice(idx, i + 1);
      }
    }
  }
  return source.slice(idx, Math.min(idx + 3000, source.length));
}
