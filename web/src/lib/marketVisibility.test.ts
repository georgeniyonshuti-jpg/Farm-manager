import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  guestSeesFarm,
  isStorefrontPublic,
  previewDisclosureLines,
  publicListingPreview,
  type FarmPreviewInput,
  type ListingPreviewInput,
} from "./marketVisibility.ts";

const farm: FarmPreviewInput = {
  displayName: "Green Ridge",
  district: "Gasabo",
  locationLabel: "Near Kimironko",
  story: "Family broilers",
  specialties: ["broilers"],
  slaughterAvailable: true,
  deliveryAvailable: false,
  discloseContact: false,
  discloseExactLocation: false,
  discloseExactPrice: false,
  contactPhone: "+250788000000",
  published: true,
  consentStatus: "granted",
  verificationStatus: "verified",
};

const listing: ListingPreviewInput = {
  district: "Gasabo",
  birds: 200,
  readyFrom: "2026-09-24",
  readyTo: "2026-09-28",
  avgWeightKg: "1.8",
  askPricePerKg: "4000",
  slaughterAvailable: true,
  deliveryAvailable: false,
  visibilityTier: "profile_public",
  title: "Ready birds",
  story: "This week",
};

describe("marketVisibility preview", () => {
  it("shows farm identity only when public + profile tier", () => {
    assert.equal(isStorefrontPublic(farm), true);
    assert.equal(guestSeesFarm(farm, "profile_public"), true);
    assert.equal(guestSeesFarm(farm, "brokered_public"), false);
    assert.equal(guestSeesFarm({ ...farm, published: false }, "profile_public"), false);
  });

  it("preview card uses a banded price and optional farm", () => {
    const card = publicListingPreview(listing, farm);
    assert.equal(card.farm?.displayName, "Green Ridge");
    assert.equal(card.farm?.contactPhone, null);
    assert.ok(card.priceBandRwf);
    assert.ok((card.priceBandRwf?.min || 0) < 4000);
    const brokered = publicListingPreview({ ...listing, visibilityTier: "brokered_public" }, farm);
    assert.equal(brokered.farm, null);
    const lines = previewDisclosureLines(farm, listing);
    assert.ok(lines.some((l) => l.includes("Public farm name")));
  });
});
