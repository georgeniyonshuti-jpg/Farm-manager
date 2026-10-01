import { API_BASE_URL } from "./config";

export type PublicPriceBand = { min: number; max: number } | null;
export type PublicWeightBand = { min: number; max: number } | null;

export type PublicMedia = {
  url: string;
  purpose: string;
  caption: string | null;
  width: number | null;
  height: number | null;
};

export type PublicFarmCard = {
  slug: string;
  displayName: string;
  story: string | null;
  district: string | null;
  locationLabel: string | null;
  specialties: string[];
  slaughterAvailable: boolean;
  deliveryAvailable: boolean;
  coverUrl: string | null;
  media: PublicMedia[];
  verified: boolean;
  contactPhone?: string | null;
  contactWhatsapp?: string | null;
  exactLocation?: string | null;
  lat?: number;
  lng?: number;
};

export type PublicLot = {
  publicRef: string;
  district: string | null;
  birdsAvailable: number;
  breedLabel: string | null;
  productType?: string;
  title?: string | null;
  story?: string | null;
  weightBandKg: PublicWeightBand;
  readyFrom: string | null;
  readyTo: string | null;
  priceBandRwf: PublicPriceBand;
  slaughterAvailable: boolean;
  deliveryAvailable: boolean;
  minOrderBirds?: number | null;
  readyLabel: string | null;
  media?: PublicMedia[];
  coverUrl?: string | null;
  visibility?: string;
  farm?: PublicFarmCard | null;
  buyerRwfPerKg?: number | null;
  youPayRwf?: number | null;
  merchantTier?: "cleva_run" | "market_only" | null;
  quantityTier?: { id: string; label: string; minBirds: number; maxBirds: number | null } | null;
  rankEligible?: boolean;
  priced?: boolean;
  moneySplit?: {
    youPayRwf: number;
    buyerRwfPerKg?: number | null;
    lines: Array<{ key: string; labelKey: string; rwf: number }>;
  } | null;
};

export type PublicMarketSummary = {
  birdsThisWeek: number;
  birdsNextWeek: number;
  birdsLater: number;
  districtsSupplying: number;
  farmsVerified: number;
  districts: Array<{ district: string; birds: number }>;
  buckets?: Record<string, { from: string; to: string }>;
};

export type PublicLotsQuery = {
  district?: string;
  week?: "this" | "next" | "later" | "";
  minBirds?: number;
  sort?: "ready" | "birds" | "price";
  page?: number;
  pageSize?: number;
  productType?: string;
  service?: "slaughter" | "delivery" | "";
  farmMode?: "with_profile" | "";
  birds?: number;
  avgKg?: number;
  slaughterPayer?: "butcher" | "farm";
  delivery?: boolean;
};

async function publicJson<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE_URL}${path}`, {
    ...init,
    headers: {
      Accept: "application/json",
      ...(init?.body ? { "Content-Type": "application/json" } : {}),
      ...(init?.headers ?? {}),
    },
  });
  const body = (await res.json().catch(() => ({}))) as T & { error?: string };
  if (!res.ok) {
    throw new Error((body as { error?: string }).error || `Request failed (${res.status})`);
  }
  return body;
}

export function buildPublicLotsQuery(q: PublicLotsQuery): string {
  const sp = new URLSearchParams();
  if (q.district) sp.set("district", q.district);
  if (q.week) sp.set("week", q.week);
  if (q.minBirds != null && q.minBirds > 0) sp.set("minBirds", String(q.minBirds));
  if (q.sort) sp.set("sort", q.sort);
  if (q.page != null) sp.set("page", String(q.page));
  if (q.pageSize != null) sp.set("pageSize", String(q.pageSize));
  if (q.productType) sp.set("productType", q.productType);
  if (q.service) sp.set("service", q.service);
  if (q.farmMode) sp.set("farmMode", q.farmMode);
  if (q.birds) sp.set("birds", String(q.birds));
  if (q.avgKg) sp.set("avgKg", String(q.avgKg));
  if (q.slaughterPayer) sp.set("slaughterPayer", q.slaughterPayer);
  if (q.delivery) sp.set("delivery", "1");
  const s = sp.toString();
  return s ? `?${s}` : "";
}

export async function fetchPublicLots(q: PublicLotsQuery = {}) {
  return publicJson<{
    items: PublicLot[];
    page: number;
    pageSize: number;
    total: number;
    hasMore: boolean;
  }>(`/api/market/lots${buildPublicLotsQuery(q)}`);
}

export async function fetchPublicLot(publicRef: string) {
  return publicJson<{ lot: PublicLot }>(`/api/market/lots/${encodeURIComponent(publicRef)}`);
}

export async function fetchPublicMarketSummary() {
  return publicJson<PublicMarketSummary>("/api/market/summary");
}

export async function fetchPublicFarms(district?: string) {
  const q = district ? `?district=${encodeURIComponent(district)}` : "";
  return publicJson<{ items: PublicFarmCard[]; total: number }>(`/api/market/farms${q}`);
}

export async function fetchPublicFarm(slug: string) {
  return publicJson<{ farm: PublicFarmCard; lots: PublicLot[] }>(
    `/api/market/farms/${encodeURIComponent(slug)}`
  );
}

export async function fetchFeaturedLots(q: PublicLotsQuery = {}) {
  return publicJson<{ items: PublicLot[] }>(`/api/market/featured${buildPublicLotsQuery(q)}`);
}

export type { FarmerQuote, MarketBoard } from "../lib/marketQuote";

export async function fetchPublicQuote(q: {
  birds: number;
  avgKg: number;
  slaughterPayer?: "butcher" | "farm";
  delivery?: boolean;
}) {
  const sp = new URLSearchParams();
  sp.set("birds", String(q.birds));
  sp.set("avgKg", String(q.avgKg));
  if (q.slaughterPayer) sp.set("slaughterPayer", q.slaughterPayer);
  if (q.delivery) sp.set("delivery", "1");
  return publicJson<{ quote: import("../lib/marketQuote").FarmerQuote | null }>(
    `/api/market/quote?${sp}`
  );
}

export async function fetchPublicBoard() {
  return publicJson<{
    board: import("../lib/marketQuote").MarketBoard | null;
    whatsapp?: string | null;
  }>("/api/market/board");
}

export async function trackPublicMarketEvent(body: {
  eventType: "profile_view" | "listing_view" | "request_started";
  publicRef?: string;
  farmProfileId?: string;
}) {
  return publicJson<{ ok: true }>("/api/market/events", {
    method: "POST",
    body: JSON.stringify(body),
  }).catch(() => ({ ok: true as const }));
}

export type PublicRequestPayload = {
  publicRef?: string;
  contactName: string;
  phone: string;
  businessName?: string;
  buyerType?: string;
  district?: string;
  birds?: number;
  avgWeightKg?: number;
  typicalBirdsPerWeek?: number;
  settleTerms?: "cash_scale" | "same_week" | "days_7" | "days_14";
  expectedRwfPerKg?: number | null;
  handover?: "collect" | "delivery";
  process?: "live" | "slaughter";
  neededWhen?: "this" | "next" | "date";
  neededFrom?: string;
  message?: string;
  website?: string;
  formStartedAt?: number;
};

export async function submitPublicRequest(payload: PublicRequestPayload) {
  return publicJson<{ ok: true; reference: string }>("/api/market/requests", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function submitPublicSellRequest(payload: PublicRequestPayload) {
  return publicJson<{ ok: true; reference: string }>("/api/market/sell-requests", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}
