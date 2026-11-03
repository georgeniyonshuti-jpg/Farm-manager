import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  cigErpDefaults,
  isCigCompanyLink,
  resolveErpBaseFromInput,
} from "../src/services/erpnext/erpBaseFromInput.js";
import { normalizeCompanyList } from "../src/services/erpnext/erpnext.client.js";

describe("erpBaseFromInput", () => {
  it("resolves subdomain to tenant IdP", () => {
    const r = resolveErpBaseFromInput({ subdomain: "cig" });
    assert.equal(r.ok, true);
    if (r.ok) {
      assert.match(r.erpnextBaseUrl, /^https:\/\/cig\./);
      assert.equal(r.subdomain, "cig");
    }
  });

  it("accepts full https URL", () => {
    const r = resolveErpBaseFromInput({ erpnextBaseUrl: "https://test2.cleva.rw/" });
    assert.equal(r.ok, true);
    if (r.ok) {
      assert.equal(r.erpnextBaseUrl, "https://test2.cleva.rw");
      assert.equal(r.subdomain, "test2");
    }
  });

  it("CIG preset defaults", () => {
    const cig = cigErpDefaults({
      ERPNEXT_CIG_BASE_URL: "https://cig.cleva.rw",
      ERPNEXT_CIG_COMPANY: "Cleva Investments Group",
    });
    assert.equal(cig.erpnextBaseUrl, "https://cig.cleva.rw");
    assert.equal(cig.erpnextCompany, "Cleva Investments Group");
    assert.equal(cig.subdomain, "cig");
  });

  it("treats CIG-linked companies as internal, not a free trial", () => {
    const env = {
      ERPNEXT_CIG_BASE_URL: "https://cig.cleva.rw",
      ERPNEXT_CIG_COMPANY: "Cleva Investments Group",
    };
    assert.equal(
      isCigCompanyLink({ erpnextCompany: "Cleva Investments Group", erpnextBaseUrl: "https://erp.clevacredit.com" }, env),
      true
    );
    assert.equal(isCigCompanyLink({ erpnextBaseUrl: "https://cig.cleva.rw" }, env), true);
    assert.equal(isCigCompanyLink({ slug: "default-farm" }, env), true);
    assert.equal(
      isCigCompanyLink({ erpnextCompany: "Another Farm", erpnextBaseUrl: "https://other.cleva.rw", slug: "green-hills" }, env),
      false
    );
  });
});

describe("normalizeCompanyList", () => {
  it("unwraps nested payloads and string rows", () => {
    assert.deepEqual(normalizeCompanyList({ companies: [{ name: "Acme", company_name: "Acme Ltd" }] }), [
      { name: "Acme", company_name: "Acme Ltd", default_currency: undefined, country: undefined },
    ]);
    assert.deepEqual(normalizeCompanyList(["Solo"]), [
      { name: "Solo", company_name: "Solo" },
    ]);
    assert.deepEqual(normalizeCompanyList(null), []);
  });
});
