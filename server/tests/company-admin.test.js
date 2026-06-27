import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  isCompanyAdmin,
  isUserManagementAdmin,
  assignableRolesForActor,
  actorCanAssignRole,
  actorCanManageUser,
  resolveAssignCompanyId,
  COMPANY_ADMIN_ROLE,
} from "../src/services/tenant/companyAdmin.js";
import { isPlatformSuperuser } from "../src/services/tenant/companyIsolation.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const serverJs = await readFile(path.resolve(__dirname, "../server.js"), "utf8");

const COMPANY_A = "11111111-1111-4111-8111-111111111111";
const COMPANY_B = "22222222-2222-4222-8222-222222222222";

describe("companyAdmin helpers", () => {
  it("isCompanyAdmin identifies company_admin role only", () => {
    assert.equal(isCompanyAdmin({ role: COMPANY_ADMIN_ROLE }), true);
    assert.equal(isCompanyAdmin({ role: "manager" }), false);
    assert.equal(isCompanyAdmin({ role: "superuser" }), false);
  });

  it("isUserManagementAdmin includes superuser and company_admin", () => {
    assert.equal(isUserManagementAdmin({ role: "superuser" }), true);
    assert.equal(isUserManagementAdmin({ role: COMPANY_ADMIN_ROLE }), true);
    assert.equal(isUserManagementAdmin({ role: "manager" }), false);
  });

  it("isPlatformSuperuser does not include company_admin", () => {
    assert.equal(isPlatformSuperuser({ role: COMPANY_ADMIN_ROLE }), false);
    assert.equal(isPlatformSuperuser({ role: "superuser" }), true);
  });

  it("company_admin can assign company_admin but not superuser", () => {
    const actor = { role: COMPANY_ADMIN_ROLE, companyId: COMPANY_A };
    assert.equal(actorCanAssignRole(actor, "manager"), true);
    assert.equal(actorCanAssignRole(actor, COMPANY_ADMIN_ROLE), true);
    assert.equal(actorCanAssignRole(actor, "superuser"), false);
  });

  it("superuser can assign superuser", () => {
    assert.equal(actorCanAssignRole({ role: "superuser" }, "superuser"), true);
  });

  it("actorCanManageUser denies cross-company targets for company_admin", () => {
    const actor = { role: COMPANY_ADMIN_ROLE, companyId: COMPANY_A };
    const other = { role: "laborer", companyId: COMPANY_B };
    const own = { role: "laborer", companyId: COMPANY_A };
    assert.equal(actorCanManageUser(actor, other, COMPANY_A), false);
    assert.equal(actorCanManageUser(actor, own, COMPANY_A), true);
    assert.equal(actorCanManageUser(actor, { role: "superuser", companyId: COMPANY_A }, COMPANY_A), false);
  });

  it("resolveAssignCompanyId forces tenant company for company_admin", () => {
    const actor = { role: COMPANY_ADMIN_ROLE, companyId: COMPANY_A };
    assert.equal(resolveAssignCompanyId(actor, COMPANY_B, COMPANY_A), COMPANY_A);
    assert.equal(resolveAssignCompanyId({ role: "superuser" }, COMPANY_B, COMPANY_A), COMPANY_B);
  });

  it("assignableRolesForActor excludes superuser for company_admin", () => {
    const roles = assignableRolesForActor({ role: COMPANY_ADMIN_ROLE });
    assert.ok(roles.includes(COMPANY_ADMIN_ROLE));
    assert.ok(!roles.includes("superuser"));
  });
});

describe("server.js company admin wiring", () => {
  it("user routes use requireUserManagementAccess", () => {
    for (const route of ["/api/users", "/api/users/:id", "/api/users/:id/page-access"]) {
      const block = extractRouteBlock(serverJs, route);
      assert.ok(block?.includes("requireUserManagementAccess"), `${route} must use requireUserManagementAccess`);
      assert.ok(!block?.includes("requireSuperuser"), `${route} must not require superuser only`);
    }
  });

  it("GET /api/audit uses requireUserManagementAccess", () => {
    const block = extractRouteBlock(serverJs, "/api/audit");
    assert.ok(block?.includes("requireUserManagementAccess"));
  });

  it("flock lifecycle routes use requireCompanyAdminUp", () => {
    for (const route of [
      "/api/flocks/:id/archive",
      "/api/flocks/:id/purge",
      "/api/flocks/recovery-overview",
    ]) {
      const block = extractRouteBlock(serverJs, route);
      assert.ok(block?.includes("requireCompanyAdminUp"), `${route} must allow company_admin`);
    }
  });

  it("saas signup creates company_admin", async () => {
    const saas = await readFile(
      path.resolve(__dirname, "../src/routes/saasRoutes.js"),
      "utf8"
    );
    assert.ok(saas.includes('"company_admin"'));
    assert.ok(saas.includes('appendAudit(userId, "company_admin"'));
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
