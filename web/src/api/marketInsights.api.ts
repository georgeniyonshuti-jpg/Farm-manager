/**
 * Market Analytics API — native summary + optional Superset embed.
 */
import { API_BASE_URL } from "./config";
import { jsonAuthHeaders, readAuthHeaders } from "../lib/authHeaders";
import type { InsightsEmbedToken, InsightsMeta, InsightsPack } from "./insights.api";

export type MarketInsightsMeta = InsightsMeta & {
  mode?: "superset" | "native" | "unconfigured";
  marketAnalyticsPath?: string;
  barnTrendsHint?: string;
};

export type MarketFunnelStep = { stage: string; count: number };

export type MarketAnalyticsSummary = {
  days: number;
  dataAsOf: string;
  expectations: Record<string, number>;
  overview: {
    kpis: {
      gmvRwf: number;
      birdsSold: number;
      commissionRwf: number;
      takeRatePct: number;
      matchRatePct: number;
      sellThroughPct: number;
      listingsLive: number;
      activeSellers: number;
      activeBuyers: number;
      sellerBuyerRatio: number | null;
      reachOpens: number;
      signupsOk: number;
      matchRateTargetPct: number;
      sellThroughTargetPct: number;
    };
    gmvTrend: { week: string; birds: number; gmv: number }[];
    matchTrend: { week: string; lots: number; matches: number; matchRatePct: number }[];
    byRegion: { district: string; listings: number; birdsListed: number; buyers: number }[];
  };
  supply: {
    funnel: MarketFunnelStep[];
    sellThroughPct: number;
    listed: number;
    sold: number;
    expired: number;
    expectationDaysToListing: number;
    peopleByStage: { stage: string; count: number }[];
    byRegion: { district: string; listings: number; birdsListed: number }[];
  };
  demand: {
    funnel: MarketFunnelStep[];
    expectationDaysToDemand: number;
    peopleByStage: { stage: string; count: number }[];
    byRegion: { district: string; buyers: number; birdsListed: number }[];
  };
  scouts: {
    expectations: { sellersPerWeek: number; lotsPerWeek: number; birdsPerWeek: number };
    leaderboard: Array<{
      scoutId: string;
      name: string;
      district: string;
      lots: number;
      birds: number;
      sellers: number;
      matches: number;
      expected: { lots: number; sellers: number; birds: number };
      vsExpected: { lotsPct: number; sellersPct: number; birdsPct: number };
    }>;
    coverage: Record<string, number>;
  };
  sales: {
    channel: {
      scoutLots: number;
      appLots: number;
      scoutBirdsSold: number;
      appBirdsSold: number;
    };
    gmvTrend: { week: string; birds: number; gmv: number }[];
    settlements: { side: string; status: string; count: number; amountRwf: number }[];
    cycle: {
      hoursToUpdate: number | null;
      hoursToBuyerPay: number | null;
      hoursPayoutLag: number | null;
    };
  };
};

export async function fetchMarketInsightsMeta(
  token: string | null
): Promise<MarketInsightsMeta> {
  const res = await fetch(`${API_BASE_URL}/api/insights/market/meta`, {
    headers: readAuthHeaders(token),
  });
  const data = (await res.json().catch(() => ({}))) as MarketInsightsMeta & {
    pack_dashboards?: Record<string, string>;
  };
  if (!res.ok) {
    return {
      configured: false,
      mode: "unconfigured",
      error: data.error || `Market Insights meta failed (${res.status})`,
      packs: data.packs,
    };
  }
  return {
    ...data,
    packDashboards: data.packDashboards || data.pack_dashboards || {},
  };
}

export async function fetchMarketInsightsEmbedToken(
  token: string | null,
  dashboardUuid?: string
): Promise<InsightsEmbedToken> {
  const q = dashboardUuid ? `?dashboardUuid=${encodeURIComponent(dashboardUuid)}` : "";
  const res = await fetch(`${API_BASE_URL}/api/insights/market/embed/token${q}`, {
    headers: readAuthHeaders(token),
  });
  const data = (await res.json().catch(() => ({}))) as InsightsEmbedToken & {
    error?: string;
  };
  if (!res.ok || !data.token) {
    throw new Error(data.error || `Could not mint market guest token (${res.status})`);
  }
  return data;
}

export async function fetchMarketAnalyticsSummary(
  token: string | null,
  days = 30
): Promise<MarketAnalyticsSummary> {
  const res = await fetch(
    `${API_BASE_URL}/api/insights/market/summary?days=${encodeURIComponent(String(days))}`,
    { headers: readAuthHeaders(token) }
  );
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error((data as { error?: string }).error || `Market summary failed (${res.status})`);
  }
  return data as MarketAnalyticsSummary;
}

export async function fetchMarketInsightsPacks(
  token: string | null
): Promise<{ packs: InsightsPack[]; note?: string }> {
  const res = await fetch(`${API_BASE_URL}/api/insights/market/packs`, {
    headers: readAuthHeaders(token),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error((data as { error?: string }).error || `Packs failed (${res.status})`);
  }
  return data as { packs: InsightsPack[]; note?: string };
}

export async function saveMarketInsightsPacks(
  token: string | null,
  packs: InsightsPack[]
): Promise<{ packs: InsightsPack[]; note?: string }> {
  const res = await fetch(`${API_BASE_URL}/api/insights/market/packs`, {
    method: "PUT",
    headers: jsonAuthHeaders(token),
    body: JSON.stringify({ packs }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error((data as { error?: string }).error || `Save packs failed (${res.status})`);
  }
  return data as { packs: InsightsPack[]; note?: string };
}

export type MarketExpectations = {
  scoutSellersPerWeek: number;
  scoutLotsPerWeek: number;
  scoutBirdsPerWeek: number;
  newSellersPerWeek: number;
  newScoutsPerWeek: number;
  newBuyersPerWeek: number;
  deadAfterDays: number;
  sellerDaysToFirstListing: number;
  buyerDaysToFirstDemand: number;
  matchRateTargetPct: number;
  sellThroughTargetPct: number;
};

export type RecruitmentChannelRow = {
  source: string;
  opens: number;
  joinStarted: number;
  attempts: number;
  accounts: number;
  failed: number;
  sellers: number;
  scouts: number;
  buyers: number;
  sellersActivated: number;
  sellersDead: number;
  firstPaid: number;
  openToAccountPct: number;
  accountToActivatedPct: number;
  activatedToPaidPct: number;
  deadRatePct: number;
  avgDaysToListing: number | null;
};

export type RecruitmentScoutRow = {
  scoutId: string;
  name: string;
  district: string;
  lots: number;
  birds: number;
  sellers: number;
  lastLotAt: string | null;
  applicationStatus: string | null;
  expected: { lots: number; sellers: number; birds: number };
  vsExpected: { lotsPct: number; sellersPct: number; birdsPct: number };
  tone: "ok" | "warn" | "danger";
};

export type RecruitmentSummary = {
  days: number;
  dataAsOf: string;
  expectations: MarketExpectations;
  scorecard: {
    opens: number;
    joinStarted: number;
    attempts: number;
    accounts: number;
    failed: number;
    failRatePct: number;
    newSellers: number;
    newScouts: number;
    newBuyers: number;
    sellersActivated: number;
    scoutsActivated: number;
    buyersActivated: number;
    sellersVsTargetPct: number;
    scoutsVsTargetPct: number;
    buyersVsTargetPct: number;
    targets: { sellers: number; scouts: number; buyers: number };
    stuckSellers: number;
  };
  channels: RecruitmentChannelRow[];
  scouts: {
    leaderboard: RecruitmentScoutRow[];
    applications: { pending: number; approved: number; rejected: number };
    inactive: Array<{
      scoutId: string;
      name: string;
      district: string;
      lastLotAt: string | null;
    }>;
    coverageGaps: Array<{
      district: string;
      openDemands: number;
      birdsWanted: number;
      scoutLots30d: number;
      scoutBirds30d: number;
      gap: boolean;
    }>;
    unpaidCommissions: { count: number; amountRwf: number };
  };
};

export async function fetchRecruitmentSummary(
  token: string | null,
  days = 7
): Promise<RecruitmentSummary> {
  const res = await fetch(
    `${API_BASE_URL}/api/insights/market/recruitment?days=${encodeURIComponent(String(days))}`,
    { headers: readAuthHeaders(token) }
  );
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error((data as { error?: string }).error || `Recruitment failed (${res.status})`);
  }
  return data as RecruitmentSummary;
}

export async function fetchMarketExpectations(
  token: string | null
): Promise<{ expectations: MarketExpectations }> {
  const res = await fetch(`${API_BASE_URL}/api/insights/market/expectations`, {
    headers: readAuthHeaders(token),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error((data as { error?: string }).error || `Expectations failed (${res.status})`);
  }
  return data as { expectations: MarketExpectations };
}

export async function saveMarketExpectations(
  token: string | null,
  expectations: Partial<MarketExpectations>
): Promise<{ expectations: MarketExpectations }> {
  const res = await fetch(`${API_BASE_URL}/api/insights/market/expectations`, {
    method: "PUT",
    headers: jsonAuthHeaders(token),
    body: JSON.stringify({ expectations }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error((data as { error?: string }).error || `Save expectations failed (${res.status})`);
  }
  return data as { expectations: MarketExpectations };
}
