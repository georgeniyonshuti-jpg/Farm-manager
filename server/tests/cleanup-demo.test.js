import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  classifyCompanyForCleanup,
  classifyFarmProfileForCleanup,
  classifyUserForCleanup,
  isDemoEmail,
  isDemoName,
} from "../src/services/pipeline/demoCleanupClassifier.js";

describe("demo cleanup classifier", () => {
  it("detects demo emails and farm names", () => {
    assert.equal(isDemoEmail("manager@demo.com"), true);
    assert.equal(isDemoEmail("test.user@mailinator.com"), true);
    assert.equal(isDemoEmail("seller@gmail.com"), false);
    assert.equal(isDemoName("Cleva Tech Farm"), true);
    assert.equal(isDemoName("West Poultry"), false);
  });

  it("keeps real market signups and deletes demo emails", () => {
    assert.deepEqual(
      classifyUserForCleanup({
        id: "1",
        email: "real@gmail.com",
        hasMarketOnboarding: true,
        role: "manager",
      }),
      { action: "keep", reason: "market_signup" }
    );
    assert.deepEqual(
      classifyUserForCleanup({
        id: "2",
        email: "manager@demo.com",
        hasMarketOnboarding: false,
        role: "manager",
      }),
      { action: "delete", reason: "demo_email" }
    );
    assert.deepEqual(
      classifyUserForCleanup({
        id: "3",
        email: "george@clevagroup.africa",
        role: "superuser",
        hasMarketOnboarding: false,
      }),
      { action: "keep", reason: "superuser" }
    );
  });

  it("deletes Cleva Tech Farm profile on host but never the host company", () => {
    assert.deepEqual(
      classifyFarmProfileForCleanup({
        id: "p1",
        displayName: "Cleva Tech Farm",
        companySlug: "cleva-tech",
        ownerEmail: "demo@demo.com",
      }),
      { action: "delete", reason: "demo_profile_on_host" }
    );
    assert.deepEqual(
      classifyFarmProfileForCleanup({
        id: "p2",
        displayName: "West",
        companySlug: "cleva-tech",
        ownerEmail: "west@gmail.com",
      }),
      { action: "keep", reason: "host_real_profile" }
    );
    assert.deepEqual(
      classifyCompanyForCleanup({ id: "c1", slug: "cleva-tech", name: "Cleva Technologies" }),
      { action: "keep", reason: "host_protected" }
    );
  });
});
