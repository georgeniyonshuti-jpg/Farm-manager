export type ListingRankPreview = {
  rails?: { min: number; max: number } | null;
  inRail?: boolean;
  rank?: number | null;
  peers?: number;
  cheaper?: number;
  cheapestBuyerRwfPerKg?: number | null;
  yourBuyerRwfPerKg?: number | null;
};

export function formatListingRankHint(r: ListingRankPreview): string {
  const rail = r.rails ? `Rail ${r.rails.min}–${r.rails.max} RWF/kg.` : "";
  const place = r.rank && r.peers ? `You would sit ${r.rank} of ${r.peers} this week.` : "";
  const delta =
    r.yourBuyerRwfPerKg != null && r.cheapestBuyerRwfPerKg != null
      ? Math.round(r.yourBuyerRwfPerKg - r.cheapestBuyerRwfPerKg)
      : 0;
  const cheaper = r.cheaper
    ? delta > 0
      ? `${r.cheaper} offer${r.cheaper === 1 ? " is" : "s are"} ${delta} RWF/kg cheaper.`
      : `${r.cheaper} offer${r.cheaper === 1 ? " is" : "s are"} cheaper.`
    : "";
  const out = r.inRail === false ? "Outside the rail — this lot will not rank." : "";
  return [place, rail, cheaper, out].filter(Boolean).join(" ");
}

export function offerRowLeakKeys(lot: Record<string, unknown>) {
  return (["farm", "farmLabel", "askPricePerKg", "companyId", "contactPhone"] as const).filter(
    (key) => lot[key] != null && lot[key] !== ""
  );
}
