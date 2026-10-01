import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  canAccessPageByKey,
  canAccessPathByPageVisibility,
  canAccessPipelineDesk,
  canBrowseMarket,
  canFlockAction,
  canScoutPipeline,
  isBuyerRole,
  isMarketOnlySeller,
  isPipelineSalesRole,
  usesMarketPartnerShell,
} from "./permissions.ts";
import type { SessionUser } from "./types.ts";

function user(role: SessionUser["role"], pageAccess?: string[]): SessionUser {
  return {
    id: "u1",
    email: `${role}@example.com`,
    displayName: role,
    role,
    businessUnitAccess: "farm",
    canViewSensitiveFinancial: false,
    departmentKeys: [],
    pageAccess,
  };
}

describe("isPipelineSalesRole", () => {
  it("is true only for sales_coordinator", () => {
    assert.equal(isPipelineSalesRole(user("sales_coordinator")), true);
    assert.equal(isPipelineSalesRole(user("superuser")), false);
    assert.equal(isPipelineSalesRole(user("manager")), false);
    assert.equal(isPipelineSalesRole(null), false);
  });
});

describe("buyer market permissions", () => {
  it("buyer can browse market but not desk", () => {
    const buyer = user("buyer");
    assert.equal(isBuyerRole(buyer), true);
    assert.equal(canBrowseMarket(buyer), true);
    assert.equal(canAccessPipelineDesk(buyer), false);
    assert.equal(usesMarketPartnerShell(buyer, "/market/orders"), true);
  });
});

describe("market-only seller shell", () => {
  it("treats farm_market-only managers as sellers, not Farm OS", () => {
    const seller = user("manager", ["farm_market"]);
    assert.equal(isMarketOnlySeller(seller), true);
    assert.equal(usesMarketPartnerShell(seller, "/market/listings"), true);
    assert.equal(isMarketOnlySeller(user("company_admin")), false);
    assert.equal(usesMarketPartnerShell(user("company_admin"), "/dashboard/management"), false);
    assert.equal(usesMarketPartnerShell(user("company_admin"), "/market/listings"), true);
  });

  it("desk users get caramel on /market and Farm OS off it", () => {
    const su = user("superuser");
    const sales = user("sales_coordinator");
    assert.equal(usesMarketPartnerShell(su, "/market/rates"), true);
    assert.equal(usesMarketPartnerShell(su, "/market/verify"), true);
    assert.equal(usesMarketPartnerShell(su, "/dashboard/management"), false);
    assert.equal(usesMarketPartnerShell(su, "/farm/pipeline"), false);
    assert.equal(usesMarketPartnerShell(sales, "/market/jobs"), true);
    assert.equal(usesMarketPartnerShell(sales, "/farm/pipeline"), false);
  });
});

describe("sales_coordinator market page access", () => {
  it("grants farm_market when pageAccess only has farm_pipeline (legacy snapshot)", () => {
    const sales = user("sales_coordinator", ["farm_pipeline", "farm_pipeline"]);
    assert.equal(canAccessPageByKey(sales, "farm_market"), true);
    assert.equal(canAccessPathByPageVisibility(sales, "/market/verify"), true);
    assert.equal(canAccessPathByPageVisibility(sales, "/market/rates"), true);
    assert.equal(canAccessPathByPageVisibility(sales, "/market/commissions"), true);
    assert.equal(canAccessPathByPageVisibility(sales, "/market/jobs"), true);
  });

  it("sales_coordinator always gets farm_market even without pipeline key", () => {
    const sales = user("sales_coordinator", ["dashboard_management"]);
    assert.equal(canAccessPageByKey(sales, "farm_market"), true);
  });
});

describe("sales_coordinator pipeline permissions", () => {
  const coordinator = user("sales_coordinator");

  it("can access desk and scout", () => {
    assert.equal(canAccessPipelineDesk(coordinator), true);
    assert.equal(canScoutPipeline(coordinator), true);
  });

  it("cannot use flock OS actions", () => {
    assert.equal(canFlockAction(coordinator, "flock.view"), false);
    assert.equal(canFlockAction(coordinator, "slaughter.schedule"), false);
    assert.equal(canFlockAction(coordinator, "mortality.record"), false);
  });

  it("superuser still has flock view and desk", () => {
    const su = user("superuser");
    assert.equal(canAccessPipelineDesk(su), true);
    assert.equal(canFlockAction(su, "flock.view"), true);
  });
});
