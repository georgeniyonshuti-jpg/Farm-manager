import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  canAccessPageByKey,
  canAccessPathByPageVisibility,
  canAccessPipelineDesk,
  canAccessWorkspace,
  canWorkRecruitment,
  canBrowseMarket,
  canFlockAction,
  canScoutPipeline,
  isBuyerRole,
  isMarketDeskPath,
  isMarketOnlySeller,
  isMarketScout,
  accountKindLabel,
  isPipelineSalesRole,
  defaultWorkspaceForUser,
  usesMarketPartnerShell,
  workspacesForUser,
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

describe("sales officer", () => {
  it("can work People and cannot open the rest of the desk", () => {
    const officer = user("sales_officer");
    assert.equal(canWorkRecruitment(officer), true);
    assert.equal(canAccessPipelineDesk(officer), false);
    assert.equal(isPipelineSalesRole(officer), false);
    assert.equal(canBrowseMarket(officer), false);
    assert.equal(canAccessPageByKey(officer, "farm_pipeline"), true);
    assert.equal(canAccessPageByKey(officer, "dashboard_market"), false);
    assert.equal(canAccessPageByKey(officer, "admin_users"), false);
    assert.equal(canAccessPageByKey(user("sales_officer", []), "farm_pipeline"), true);
    assert.equal(canAccessPageByKey(user("sales_officer", []), "dashboard_management"), false);
    assert.equal(canAccessPathByPageVisibility(officer, "/dashboard/market/recruitment"), true);
    assert.equal(canAccessPathByPageVisibility(officer, "/farm/pipeline/flocks"), true);
    assert.equal(canAccessPathByPageVisibility(officer, "/farm/pipeline/people"), true);
    assert.equal(canAccessPathByPageVisibility(officer, "/dashboard/market"), false);
    assert.equal(canAccessPathByPageVisibility(officer, "/dashboard/market/trends"), false);
    assert.equal(canAccessPathByPageVisibility(officer, "/dashboard/market/recruitment-legacy"), false);
    assert.equal(canAccessPathByPageVisibility(officer, "/farm/flocks"), false);
    assert.equal(canAccessWorkspace(officer, "market"), true);
    assert.equal(canAccessWorkspace(officer, "farm"), false);
    assert.equal(canAccessWorkspace(officer, "clevacredit"), false);
    assert.deepEqual(workspacesForUser(officer), ["market"]);
    assert.equal(defaultWorkspaceForUser(officer), "market");
    assert.deepEqual(workspacesForUser(user("superuser", undefined)), ["farm", "market"]);
    assert.deepEqual(workspacesForUser(user("company_admin")), ["farm", "market"]);
    assert.deepEqual(workspacesForUser(user("laborer")), ["farm"]);
    assert.deepEqual(workspacesForUser(user("investor")), ["farm"]);
    assert.equal(isMarketDeskPath("/farm/pipeline/people/abc"), true);
    assert.equal(isMarketDeskPath("/app/cleva/farm/pipeline/shop"), true);
    assert.equal(isMarketDeskPath("/farm/pipeline/home"), false);
    assert.equal(isMarketDeskPath("/farm/flocks"), false);
  });
});

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

describe("account kind labels", () => {
  it("labels market accounts as seller, buyer, and scout", () => {
    assert.equal(accountKindLabel(user("manager", ["farm_market"])), "Seller");
    assert.equal(accountKindLabel(user("buyer", ["farm_market"])), "Buyer");
    assert.equal(accountKindLabel(user("vet", ["farm_pipeline", "farm_market"])), "Scout");
    assert.equal(isMarketScout(user("vet", ["farm_pipeline"])), true);
  });

  it("keeps farm staff on their role name", () => {
    assert.equal(accountKindLabel(user("manager", ["farm_flocks", "farm_market"])), null);
    assert.equal(accountKindLabel(user("vet", ["farm_vet_logs", "farm_pipeline"])), null);
    assert.equal(accountKindLabel(user("superuser")), null);
  });
});
