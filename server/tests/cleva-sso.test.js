/**
 * Unit tests for Cleva Farm SSO mapping helpers.
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  isAllowedIdpOrigin,
  resolveIdpOrigin,
  isPlatformSuperuserIdentity,
  resolvePwaRoleFromIdentity,
  platformSuperuserEmails,
} from "../src/services/clevaSso.js";
import { resolveSubdomainToIdp, tenantDeskIdp, isControlPlaneIdp } from "../src/services/resolveIdp.js";

describe("clevaSso IdP allowlist", () => {
  it("allows tenant and erp hosts, blocks companions", () => {
    assert.equal(isAllowedIdpOrigin("https://test2.cleva.rw"), true);
    assert.equal(isAllowedIdpOrigin("https://erp.clevacredit.com"), true);
    assert.equal(isAllowedIdpOrigin("https://pos.clevacredit.com"), false);
    assert.equal(isAllowedIdpOrigin("https://farm.cleva.rw"), false);
    assert.throws(() => resolveIdpOrigin("https://pos.clevacredit.com"));
  });

  it("defaults empty idp to env IdP origin", () => {
    const origin = resolveIdpOrigin(null);
    assert.ok(origin.startsWith("http"));
  });
});

describe("clevaSso platform superuser allowlist", () => {
  it("defaults to george@clevagroup.africa only", () => {
    assert.deepEqual(platformSuperuserEmails({}), ["george@clevagroup.africa"]);
    assert.equal(
      isPlatformSuperuserIdentity({ email: "george@clevagroup.africa" }, {}),
      true
    );
    assert.equal(
      isPlatformSuperuserIdentity({ email: "george@clevacredit.com" }, {}),
      false
    );
    assert.equal(
      isPlatformSuperuserIdentity({ email: "admin@acme.com", is_admin: true }, {}),
      false
    );
  });

  it("honors is_platform_superuser flag from IdP", () => {
    assert.equal(
      isPlatformSuperuserIdentity({ email: "other@x.com", is_platform_superuser: true }, {}),
      true
    );
  });

  it("maps allowlisted email to superuser role", () => {
    assert.equal(
      resolvePwaRoleFromIdentity({ email: "george@clevagroup.africa", is_admin: true }, {}),
      "superuser"
    );
    assert.equal(
      resolvePwaRoleFromIdentity({ email: "mgr@acme.com", is_admin: true }, {}),
      "company_admin"
    );
    assert.equal(
      resolvePwaRoleFromIdentity(
        { email: "mgr@acme.com", farm_bootstrap: { role: "admin" } },
        {}
      ),
      "company_admin"
    );
  });
});

describe("resolveSubdomainToIdp", () => {
  it("maps bare subdomain to tenant origin", () => {
    const r = resolveSubdomainToIdp("test2");
    assert.equal(r.ok, true);
    if (r.ok) assert.equal(r.idp, "https://test2.cleva.rw");
  });

  it("rejects companion labels", () => {
    const r = resolveSubdomainToIdp("pos");
    assert.equal(r.ok, false);
  });

  it("accepts full https URL", () => {
    const r = resolveSubdomainToIdp("https://test2.cleva.rw");
    assert.equal(r.ok, true);
    if (r.ok) assert.equal(r.idp, "https://test2.cleva.rw");
  });

  it("email lookup ignores control-plane IdP", () => {
    assert.equal(tenantDeskIdp("https://erp.clevacredit.com"), null);
    assert.ok(isControlPlaneIdp("https://erp.clevacredit.com"));
    assert.equal(tenantDeskIdp("https://test2.cleva.rw"), "https://test2.cleva.rw");
  });
});

describe("clevaSso mapping logic", () => {
  it("filters links by erp company name + idp base", () => {
    const links = [
      { companyId: "co-a", erpnextCompany: "Farm A", erpnextBaseUrl: "https://test2.cleva.rw" },
      { companyId: "co-b", erpnextCompany: "Farm B", erpnextBaseUrl: "https://erp.clevacredit.com" },
      { companyId: "co-c", erpnextCompany: "Farm A", erpnextBaseUrl: "https://erp.clevacredit.com" },
    ];
    const wanted = new Set(["Farm A"]);
    const idp = "https://test2.cleva.rw";
    const mapped = links.filter((l) => {
      if (!wanted.has(String(l.erpnextCompany || "").trim())) return false;
      return String(l.erpnextBaseUrl || "").replace(/\/+$/, "") === idp;
    });
    assert.deepEqual(
      mapped.map((m) => m.companyId),
      ["co-a"]
    );
  });

  it("empty erp list yields no farm companies", () => {
    const wanted = new Set();
    const links = [{ companyId: "co-a", erpnextCompany: "Farm A" }];
    const mapped = links.filter((l) => wanted.has(String(l.erpnextCompany || "").trim()));
    assert.equal(mapped.length, 0);
  });
});
