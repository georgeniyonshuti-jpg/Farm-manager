export type MarketSurface = "landing" | "shop";

export function resolveMarketSurface(_input: {
  total?: number | null;
  failed?: boolean;
}): MarketSurface {
  return "shop";
}

/** Filters only when the list is long enough and there is more than one useful facet. */
export function shouldShowMarketFilters(input: {
  total: number;
  districtCount: number;
  weekCount: number;
}): boolean {
  if (input.total < 6) return false;
  return input.districtCount >= 2 || input.weekCount >= 2;
}

export function countWeekFacets(summary: {
  birdsThisWeek?: number;
  birdsNextWeek?: number;
  birdsLater?: number;
} | null | undefined): number {
  if (!summary) return 0;
  return [summary.birdsThisWeek, summary.birdsNextWeek, summary.birdsLater].filter((n) => (n ?? 0) > 0)
    .length;
}
