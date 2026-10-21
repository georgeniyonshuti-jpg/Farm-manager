import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  cigErpDefaults,
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
