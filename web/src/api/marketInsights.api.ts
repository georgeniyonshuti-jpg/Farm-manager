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

export type RecruitmentContact = {
  id: string;
  phone: string;
  name: string | null;
  email?: string | null;
  detailsEditedAt?: string | null;
  district: string | null;
  sector?: string | null;
  birdCount: number | null;
  want: "sell" | "buy" | "scout";
  stage: string;
  source: string;
  ownerUserId: string | null;
  ownerName: string | null;
  nextCallAt: string | null;
  lastTouchAt: string | null;
  userId: string | null;
  hasAccount: boolean;
  overdue: boolean;
  locationConfirmed?: boolean | null;
  locationCorrected?: string | null;
  ownsBroilers?: boolean | null;
  birdType?: string | null;
  quantityMin?: number | null;
  quantityMax?: number | null;
  canSlaughter?: boolean | null;
  canDeliver?: boolean | null;
  challenges?: string | null;
  nextAction?: string | null;
  flockCount?: number | null;
  listedCount?: number | null;
  kycContractStatus?: string | null;
  kycContractSnapshot?: string | null;
  kycSignatureUrl?: string | null;
  kycLocationStatus?: string | null;
  kycPlace?: string | null;
  kycPaymentStatus?: string | null;
  kycMomoPhone?: string | null;
  kycPaymentProofUrl?: string | null;
  kycIdentityStatus?: string | null;
  kycIdNumber?: string | null;
  kycIdPhotoUrl?: string | null;
  contractText?: string | null;
  createdAt: string;
};

export type RecruitmentTouch = {
  id: string;
  kind: string;
  outcome: string | null;
  note: string | null;
  challenges?: string | null;
  nextAction?: string | null;
  scheduledFor?: string | null;
  createdAt: string;
  byName: string | null;
};

export type RecruitmentQueue = {
  contacts: RecruitmentContact[];
  owners: { id: string | null; name: string; open: number; overdue: number; signedUp: number }[];
  trend: { day: string; newContacts: number; signups: number; activated: number }[];
  missing?: boolean;
};

async function recruitmentSend<T>(token: string | null, path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE_URL}/api/insights${path}`, {
    ...init,
    headers: init?.body ? jsonAuthHeaders(token) : readAuthHeaders(token),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error((data as { error?: string }).error || `Recruitment request failed (${res.status})`);
  }
  return data as T;
}

export function fetchRecruitmentQueue(
  token: string | null,
  query: {
    days?: number;
    stage?: string;
    want?: string;
    owner?: string;
    overdue?: boolean;
    q?: string;
    district?: string;
    kyc?: string;
    sort?: string;
    lane?: "recruitment" | "active";
  }
): Promise<RecruitmentQueue> {
  const params = new URLSearchParams();
  if (query.days) params.set("days", String(query.days));
  if (query.stage) params.set("stage", query.stage);
  if (query.want) params.set("want", query.want);
  if (query.owner) params.set("owner", query.owner);
  if (query.overdue) params.set("overdue", "1");
  if (query.q) params.set("q", query.q);
  if (query.lane) params.set("lane", query.lane);
  if (query.district) params.set("district", query.district);
  if (query.kyc) params.set("kyc", query.kyc);
  if (query.sort) params.set("sort", query.sort);
  return recruitmentSend(token, `/market/recruitment/contacts?${params.toString()}`);
}

export function createRecruitmentContact(
  token: string | null,
  body: { name?: string; phone: string; district?: string; birds?: number | null; want: string }
) {
  return recruitmentSend<{ contact?: RecruitmentContact }>(token, "/market/recruitment/contacts", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export function patchRecruitmentContact(token: string | null, id: string, body: Record<string, unknown>) {
  return recruitmentSend<{ contact: RecruitmentContact }>(token, `/market/recruitment/contacts/${id}`, {
    method: "PATCH",
    body: JSON.stringify(body),
  });
}

export function fetchRecruitmentContact(token: string | null, id: string) {
  return recruitmentSend<{ contact: RecruitmentContact; touches: RecruitmentTouch[] }>(
    token,
    `/market/recruitment/contacts/${id}`
  );
}

export function addRecruitmentTouch(
  token: string | null,
  id: string,
  body: Record<string, unknown>
) {
  return recruitmentSend<{ contact: RecruitmentContact }>(token, `/market/recruitment/contacts/${id}/touches`, {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export function decideRecruitmentContact(
  token: string | null,
  id: string,
  body: { decision: string; note?: string; idempotencyKey?: string }
) {
  return recruitmentSend<{ contact: RecruitmentContact }>(token, `/market/recruitment/contacts/${id}/decision`, {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export function fetchMyRecruitment(token: string | null) {
  return recruitmentSend<{ contact: RecruitmentContact | null }>(token, "/market/recruitment/me");
}

export function submitMyKyc(token: string | null, body: Record<string, unknown>) {
  return recruitmentSend<{ contact: RecruitmentContact }>(token, "/market/recruitment/me/kyc", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export function submitRecruitmentKyc(token: string | null, id: string, body: Record<string, unknown>) {
  return recruitmentSend<{ contact: RecruitmentContact }>(token, `/market/recruitment/contacts/${id}/kyc`, {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export function attachRecruitmentAccount(token: string | null, id: string, email: string) {
  return recruitmentSend<{ contact: RecruitmentContact }>(token, `/market/recruitment/contacts/${id}/attach`, {
    method: "POST",
    body: JSON.stringify({ email }),
  });
}
