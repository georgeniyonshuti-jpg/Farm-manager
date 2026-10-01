import type { PublicLot } from "../api/publicMarket.api";

function formatPriceBand(band: { min: number; max: number } | null | undefined): string {
  if (!band) return "Price on request";
  return `${Math.round(band.min).toLocaleString("en-RW")} – ${Math.round(band.max).toLocaleString("en-RW")} RWF/kg`;
}

function formatWeightBand(band: { min: number; max: number } | null | undefined): string {
  if (!band) return "—";
  if (band.min === band.max) return `${band.min.toFixed(1)} kg`;
  return `${band.min.toFixed(1)} – ${band.max.toFixed(1)} kg`;
}

export type VisibilityTier = "brokered_public" | "profile_public" | "verified_buyers";

export type FarmPreviewInput = {
  displayName: string;
  district: string;
  locationLabel: string;
  story: string;
  specialties: string[];
  slaughterAvailable: boolean;
  deliveryAvailable: boolean;
  discloseContact: boolean;
  discloseExactLocation: boolean;
  discloseExactPrice: boolean;
  contactPhone: string;
  coverUrl?: string | null;
  published: boolean;
  consentStatus: string;
  verificationStatus: string;
};

export type ListingPreviewInput = {
  district: string;
  birds: number;
  readyFrom: string;
  readyTo: string;
  avgWeightKg: string;
  askPricePerKg: string;
  slaughterAvailable: boolean;
  deliveryAvailable: boolean;
  visibilityTier: VisibilityTier;
  title: string;
  story: string;
  coverUrl?: string | null;
  publicRef?: string | null;
};

export function isStorefrontPublic(farm: Pick<FarmPreviewInput, "published" | "consentStatus" | "verificationStatus">) {
  return farm.published && farm.consentStatus === "granted" && farm.verificationStatus === "verified";
}

export function guestSeesFarm(farm: FarmPreviewInput, tier: VisibilityTier) {
  return tier === "profile_public" && isStorefrontPublic(farm);
}

export function publicListingPreview(listing: ListingPreviewInput, farm: FarmPreviewInput): PublicLot {
  const ask = Number(listing.askPricePerKg);
  const weight = Number(listing.avgWeightKg);
  const showFarm = guestSeesFarm(farm, listing.visibilityTier);
  return {
    publicRef: listing.publicRef || "LOT-PREVIEW",
    district: listing.district || farm.district || null,
    birdsAvailable: Number(listing.birds) || 0,
    breedLabel: farm.specialties[0] || "Broiler",
    productType: "broiler_birds",
    title: listing.title || null,
    story: listing.story || null,
    weightBandKg: Number.isFinite(weight) && weight > 0 ? { min: weight, max: weight } : null,
    readyFrom: listing.readyFrom || null,
    readyTo: listing.readyTo || null,
    priceBandRwf:
      Number.isFinite(ask) && ask >= 500
        ? { min: Math.round((ask * 0.95) / 100) * 100, max: Math.round((ask * 1.05) / 100) * 100 }
        : null,
    slaughterAvailable: listing.slaughterAvailable || farm.slaughterAvailable,
    deliveryAvailable: listing.deliveryAvailable || farm.deliveryAvailable,
    readyLabel:
      listing.readyFrom && listing.readyTo
        ? `${listing.readyFrom} – ${listing.readyTo}`
        : listing.readyFrom || listing.readyTo || null,
    media: listing.coverUrl ? [{ url: listing.coverUrl, purpose: "cover", caption: null, width: null, height: null }] : [],
    coverUrl: listing.coverUrl || farm.coverUrl || null,
    visibility: showFarm ? "profile_public" : "brokered_public",
    farm: showFarm
      ? {
          slug: "preview",
          displayName: farm.displayName,
          story: farm.story || null,
          district: farm.district || null,
          locationLabel: farm.locationLabel || null,
          specialties: farm.specialties,
          slaughterAvailable: farm.slaughterAvailable,
          deliveryAvailable: farm.deliveryAvailable,
          coverUrl: farm.coverUrl || null,
          media: [],
          verified: true,
          contactPhone: farm.discloseContact ? farm.contactPhone || null : null,
          contactWhatsapp: farm.discloseContact ? farm.contactPhone || null : null,
        }
      : null,
  };
}

export function previewDisclosureLines(farm: FarmPreviewInput, listing: ListingPreviewInput): string[] {
  const lines: string[] = [];
  if (guestSeesFarm(farm, listing.visibilityTier)) {
    lines.push(`Public farm name: ${farm.displayName || "Untitled farm"}`);
    lines.push(`Approximate location: ${farm.locationLabel || farm.district || "District only"}`);
  } else {
    lines.push("Farm identity stays private on the public card");
  }
  lines.push(`Price shown as ${formatPriceBand(publicListingPreview(listing, farm).priceBandRwf)}`);
  lines.push(`Weight shown as ${formatWeightBand(publicListingPreview(listing, farm).weightBandKg)}`);
  if (farm.discloseContact && guestSeesFarm(farm, listing.visibilityTier)) {
    lines.push("Contact phone is visible on the storefront");
  } else {
    lines.push("Contact stays with Cleva — guests request, partners reserve");
  }
  if (listing.visibilityTier === "verified_buyers") {
    lines.push("Exact farm terms appear only after a buyer is verified");
  }
  return lines;
}
