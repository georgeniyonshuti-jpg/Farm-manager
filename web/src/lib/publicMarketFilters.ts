import type { PublicLotsQuery } from "../api/publicMarket.api";

export type PublicWeekFilter = "" | "this" | "next" | "later";
export type PublicSort = "ready" | "birds" | "price";

export type PublicServiceFilter = "" | "slaughter" | "delivery";
export type PublicFarmMode = "" | "with_profile";

export type PublicMarketFilters = {
  district: string;
  week: PublicWeekFilter;
  minBirds: number | "";
  sort: PublicSort;
  productType: string;
  service: PublicServiceFilter;
  farmMode: PublicFarmMode;
};

export function defaultPublicMarketFilters(): PublicMarketFilters {
  return { district: "", week: "", minBirds: "", sort: "price", productType: "", service: "", farmMode: "" };
}

/** Build API query from UI filter state. */
export function filtersToPublicLotsQuery(
  filters: PublicMarketFilters,
  page = 1,
  pageSize = 12,
  extra?: { birds?: number; avgKg?: number; slaughterPayer?: "butcher" | "farm"; delivery?: boolean }
): PublicLotsQuery {
  return {
    district: filters.district || undefined,
    week: filters.week || undefined,
    minBirds: filters.minBirds === "" ? undefined : Number(filters.minBirds),
    sort: filters.sort,
    page,
    pageSize,
    productType: filters.productType || undefined,
    service: filters.service || undefined,
    farmMode: filters.farmMode || undefined,
    birds: extra?.birds,
    avgKg: extra?.avgKg,
    slaughterPayer: extra?.slaughterPayer,
    delivery: extra?.delivery,
  };
}

export function formatPriceBand(band: { min: number; max: number } | null | undefined): string {
  if (!band) return "Price on request";
  const fmt = (n: number) => Math.round(n).toLocaleString("en-RW");
  return `${fmt(band.min)} – ${fmt(band.max)} RWF/kg`;
}

export function formatWeightBand(band: { min: number; max: number } | null | undefined): string {
  if (!band) return "—";
  if (band.min === band.max) return `${band.min.toFixed(1)} kg`;
  return `${band.min.toFixed(1)} – ${band.max.toFixed(1)} kg`;
}
