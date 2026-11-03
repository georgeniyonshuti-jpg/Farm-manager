/** Marketplace balance. Forecast stays off unless flock dates are supplied. */

export const HEALTHY_COVERAGE = { low: 0.8, high: 1.5 };

export function coverageRatio(supply, demand) {
  if (!(demand > 0)) return null;
  return supply / demand;
}

export function coverageSentence(rows) {
  const list = rows || [];
  let recruitSellers = null;
  let recruitBuyers = null;
  for (const row of list) {
    const ratio = coverageRatio(row.supply, row.demand);
    if (ratio == null) continue;
    if (row.demand > row.supply * 1.5) {
      if (!recruitSellers || row.demand - row.supply > recruitSellers.gap) {
        recruitSellers = { district: row.district, gap: row.demand - row.supply, rule: "demand above 1.5× supply" };
      }
    }
    if (row.supply > row.demand * 1.5 && row.demand > 0) {
      if (!recruitBuyers || row.supply - row.demand > recruitBuyers.gap) {
        recruitBuyers = { district: row.district, gap: row.supply - row.demand, rule: "supply above 1.5× demand" };
      }
    }
  }
  return { recruitSellers, recruitBuyers };
}

/**
 * @param {object|null} input
 */
export function supplyDemandBlock(input) {
  if (!input || input.available === false) {
    return {
      available: false,
      reason: input?.reason || "Supply and demand are not both available for this range.",
      forecast: null,
    };
  }
  const rows = input.byDistrict || [];
  const supply = Number(input.liveBirds || 0);
  const demand = Number(input.demandBirds || 0);
  const sentences = coverageSentence(rows);
  const forecast = input.forecast && input.flocksSupportForecast
    ? { birds: input.forecast.birds, label: "forecast", definitionId: "M-SUPPLY-FCST" }
    : null;
  return {
    available: true,
    definitionId: "M-SUPPLY-LIVE",
    liveBirds: supply,
    demandBirds: demand,
    demandLabel: input.demandIsProxy ? "proxy" : "requests",
    coverage: coverageRatio(supply, demand),
    healthy: HEALTHY_COVERAGE,
    byDistrict: rows.map((row) => ({
      district: row.district || "District unknown",
      supply: row.supply || 0,
      demand: row.demand || 0,
      coverage: coverageRatio(row.supply || 0, row.demand || 0),
      n: (row.supply || 0) + (row.demand || 0),
    })),
    listingResponse: input.listingResponse || null,
    timeToFirstInquiryHours: input.timeToFirstInquiryHours ?? null,
    matchRate: input.matchRate || null,
    fillRate: input.fillRate || null,
    activeSellers: input.activeSellers ?? null,
    activeBuyers: input.activeBuyers ?? null,
    forecast,
    forecastHiddenReason: forecast ? null : "Flock placement dates are not used for a forecast until they are checked.",
    sentences,
  };
}
