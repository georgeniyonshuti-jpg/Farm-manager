import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  PUBLIC_FARM_SENSITIVE_KEYS,
  appendFarmerLotScope,
  canPublishProfile,
  createClaimToken,
  effectivePublicVisibility,
  farmerOwnsLot,
  isHostMarketSeller,
  isMarketOnlySeller,
  isProfilePubliclyVisible,
  mapPublicFarm,
  marketplaceStorefrontsEnabled,
  normalizeProductType,
  normalizeSpecialties,
  normalizeVisibilityTier,
  slugifyFarmName,
  withSlugSuffix,
} from "../src/services/pipeline/farmProfiles.js";

const publicProfile = {
  slug: "green-ridge",
  displayName: "Green Ridge",
  story: "Family broilers",
  district: "Gasabo",
  locationLabel: "Near Kimironko",
  exactLocation: "KG 123 St",
  lat: -1.94,
  lng: 30.06,
  contactPhone: "+250788000000",
  contactWhatsapp: "+250788000000",
  companyId: "secret-co",
  published: true,
  consentStatus: "granted",
  verificationStatus: "verified",
  discloseContact: false,
  discloseExactLocation: false,
  specialties: ["broilers"],
};

describe("farmProfiles visibility", () => {
  it("storefronts flag treats 0/false/off as disabled", () => {
    assert.equal(marketplaceStorefrontsEnabled("1"), true);
    assert.equal(marketplaceStorefrontsEnabled("0"), false);
    assert.equal(marketplaceStorefrontsEnabled("off"), false);
    assert.equal(marketplaceStorefrontsEnabled((k, d) => (k === "marketplace_storefronts" ? "1" : d)), true);
  });

  it("unpublished or unconsented profiles are not public", () => {
    assert.equal(isProfilePubliclyVisible(publicProfile), true);
    assert.equal(isProfilePubliclyVisible({ ...publicProfile, published: false }), false);
    assert.equal(isProfilePubliclyVisible({ ...publicProfile, consentStatus: "none" }), false);
    assert.equal(isProfilePubliclyVisible({ ...publicProfile, verificationStatus: "pending" }), false);
  });

  it("publish gate requires consent + verification", () => {
    assert.equal(canPublishProfile({ consentStatus: "granted", verificationStatus: "verified" }).ok, true);
    assert.equal(canPublishProfile({ consentStatus: "none", verificationStatus: "verified" }).ok, false);
    assert.equal(canPublishProfile({ consentStatus: "granted", verificationStatus: "pending" }).ok, false);
  });

  it("guests see brokered cards for verified_buyers tier", () => {
    assert.equal(
      effectivePublicVisibility(
        { visibilityTier: "verified_buyers", profile: publicProfile },
        { storefrontsEnabled: true, audience: "guest" }
      ),
      "brokered_public"
    );
    assert.equal(
      effectivePublicVisibility(
        { visibilityTier: "verified_buyers", profile: publicProfile },
        { storefrontsEnabled: true, audience: "verified_buyer" }
      ),
      "verified_buyers"
    );
  });

  it("profile_public only surfaces when the farm is actually public", () => {
    assert.equal(
      effectivePublicVisibility(
        { visibilityTier: "profile_public", profile: publicProfile },
        { storefrontsEnabled: true, audience: "guest" }
      ),
      "profile_public"
    );
    assert.equal(
      effectivePublicVisibility(
        { visibilityTier: "profile_public", profile: { ...publicProfile, published: false } },
        { storefrontsEnabled: true, audience: "guest" }
      ),
      "brokered_public"
    );
    assert.equal(
      effectivePublicVisibility(
        { visibilityTier: "profile_public", profile: publicProfile },
        { storefrontsEnabled: false, audience: "guest" }
      ),
      "brokered_public"
    );
  });

  it("public farm projection never leaks private keys by default", () => {
    const mapped = mapPublicFarm(publicProfile);
    assert.ok(mapped);
    assert.equal(mapped.displayName, "Green Ridge");
    assert.equal(mapped.slug, "green-ridge");
    for (const key of PUBLIC_FARM_SENSITIVE_KEYS) {
      assert.equal(Object.prototype.hasOwnProperty.call(mapped, key), false, `leaked ${key}`);
    }
  });

  it("discloses contact and exact location only when flagged", () => {
    const mapped = mapPublicFarm({
      ...publicProfile,
      discloseContact: true,
      discloseExactLocation: true,
    });
    assert.equal(mapped.contactPhone, "+250788000000");
    assert.equal(mapped.exactLocation, "KG 123 St");
    assert.equal(mapped.lat, -1.94);
  });
});

describe("farmProfiles helpers", () => {
  it("slugifies and suffixes names", () => {
    assert.equal(slugifyFarmName("Green Ridge Farm!"), "green-ridge-farm");
    assert.match(withSlugSuffix("green-ridge", "AB12"), /^green-ridge-ab12$/);
  });

  it("normalizes specialties, product type, visibility", () => {
    assert.deepEqual(normalizeSpecialties("Broilers, Layers"), ["Broilers", "Layers"]);
    assert.equal(normalizeProductType("Eggs!"), "eggs");
    assert.equal(normalizeVisibilityTier("nope"), "brokered_public");
    assert.equal(normalizeVisibilityTier("profile_public"), "profile_public");
  });

  it("creates claim tokens", () => {
    const a = createClaimToken();
    const b = createClaimToken();
    assert.equal(a.length, 48);
    assert.notEqual(a, b);
  });
});

describe("host seller identity", () => {
  const host = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
  const sellerA = {
    id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    role: "manager",
    companyId: host,
    pageAccess: ["farm_market"],
  };
  const sellerB = {
    id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
    role: "manager",
    companyId: host,
    pageAccess: ["farm_market"],
  };
  const farmAdmin = {
    id: "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
    role: "company_admin",
    companyId: "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee",
    pageAccess: null,
  };

  it("scopes market-only sellers by listed_by / profile, never host company", () => {
    assert.equal(isMarketOnlySeller(sellerA), true);
    assert.equal(isHostMarketSeller(sellerA, host), true);
    assert.equal(isHostMarketSeller(farmAdmin, host), false);
    const profileA = { id: "profile-a" };
    const lotA = { companyId: host, listedBy: sellerA.id, farmProfileId: "profile-a" };
    const lotB = { companyId: host, listedBy: sellerB.id, farmProfileId: "profile-b" };
    assert.equal(farmerOwnsLot(sellerA, lotA, profileA), true);
    assert.equal(farmerOwnsLot(sellerA, lotB, profileA), false);
    assert.equal(farmerOwnsLot(sellerB, lotA, { id: "profile-b" }), false);
    assert.equal(farmerOwnsLot(farmAdmin, { companyId: farmAdmin.companyId, listedBy: "other" }), true);
    assert.equal(farmerOwnsLot(farmAdmin, lotA), false);
  });

  it("appendFarmerLotScope uses owner for sellers and company for farm tenants", () => {
    const sellerClauses = [];
    const sellerParams = [];
    appendFarmerLotScope(sellerClauses, sellerParams, sellerA);
    assert.equal(sellerParams[0], sellerA.id);
    assert.match(sellerClauses[0], /listed_by/);
    assert.match(sellerClauses[0], /owner_user_id/);
    assert.equal(sellerClauses[0].includes("company_id"), false);

    const farmClauses = [];
    const farmParams = [];
    appendFarmerLotScope(farmClauses, farmParams, farmAdmin);
    assert.equal(farmParams[0], farmAdmin.companyId);
    assert.match(farmClauses[0], /company_id/);
  });
});
