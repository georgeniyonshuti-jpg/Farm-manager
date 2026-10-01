/**
 * Poultry supply pipeline — desk, buyers, scout, opt-in APIs.
 */
import { legacyApiUrl } from "./config";
import { jsonAuthHeaders, readAuthHeaders } from "../lib/authHeaders";

async function pipelineFetch<T>(path: string, token: string | null, init?: RequestInit): Promise<T> {
  const res = await fetch(legacyApiUrl(`/api/pipeline${path}`), {
    ...init,
    headers: { ...readAuthHeaders(token), ...(init?.headers ?? {}) },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error((data as { error?: string }).error ?? `Request failed (${res.status})`);
  }
  return data as T;
}

export type PipelineBuyer = {
  id: string;
  name: string;
  buyerType: string;
  district: string | null;
  whatsapp: string | null;
  phone: string | null;
  weeklyBirdsMin: number | null;
  weeklyBirdsMax: number | null;
  weightKgMin: number | null;
  weightKgMax: number | null;
  prefersSlaughtered: boolean;
  collectOrDelivery: string;
  noticeDays: number;
  notes: string | null;
  active: boolean;
};

export type PipelineLot = {
  id: string;
  source: "managed_flock" | "scout";
  companyId: string | null;
  flockId: string | null;
  farmLabel: string | null;
  contactPhone: string | null;
  district: string | null;
  birdCount: number;
  saleableBirds: number | null;
  breedCode: string | null;
  avgWeightKg: number | null;
  expectedWeightKg: number | null;
  readyFrom: string;
  readyTo: string;
  askPricePerKg: number | null;
  butcherPricePerKg?: number | null;
  buyerRwfPerKg?: number | null;
  youPayRwf?: number | null;
  merchantTier?: "cleva_run" | "market_only" | null;
  rankEligible?: boolean;
  placementDate?: string | null;
  scoutConfirmedAt?: string | null;
  listingPhase?: "on_the_book" | "visit_due" | "weighed" | "live";
  visitDueOn?: string | null;
  sellingWeekLabel?: string | null;
  farmerCanSlaughter: boolean;
  deliveryAvailable: boolean;
  minOrderBirds?: number | null;
  status: string;
  verificationStatus?: string;
  publicRef?: string | null;
  listedBy?: string | null;
  matchedBirds?: number;
  remainingBirds?: number;
  notes: string | null;
  productType?: string;
  visibilityTier?: string;
  farmProfileId?: string | null;
  publicTitle?: string | null;
  publicStory?: string | null;
  processingNotes?: string | null;
  farmerSplit?: import("../components/market/MoneySplit").FarmerMoneySplit | null;
};

export type PipelineDemand = {
  id: string;
  buyerId: string;
  buyerName?: string;
  birdsNeeded: number;
  weightKgMin: number | null;
  weightKgMax: number | null;
  neededFrom: string | null;
  neededTo: string | null;
  districtPreference: string | null;
  slaughteredRequired: boolean;
  deliveryRequired: boolean;
  status: string;
  channel: string;
  rawNotes: string | null;
  filledBirds?: number;
};

export type PipelineMatch = {
  id: string;
  lotId: string;
  demandId: string | null;
  buyerId: string;
  buyerName?: string;
  birds: number;
  agreedPricePerKg: number | null;
  readyDate: string | null;
  status: string;
  transportNotes: string | null;
  slaughterNotes: string | null;
  learningNotes: string | null;
  salesOrderId: string | null;
  lotDistrict?: string | null;
  lotFarmLabel?: string | null;
  lotSource?: string;
  flockId?: string | null;
};

export type ForwardSummary = {
  weeks: Array<{
    key: string;
    label: string;
    from: string;
    to: string;
    birds: number;
    byDistrict: Record<string, number>;
  }>;
  openDemandBirds: number;
};

export async function fetchPipelineBuyers(token: string | null, activeOnly = true) {
  return pipelineFetch<{ buyers: PipelineBuyer[] }>(
    `/buyers?active=${activeOnly ? "1" : "0"}`,
    token
  );
}

export async function createPipelineBuyer(
  token: string | null,
  body: Record<string, unknown>
) {
  return pipelineFetch<{ buyer: PipelineBuyer }>("/buyers", token, {
    method: "POST",
    headers: jsonAuthHeaders(token),
    body: JSON.stringify(body),
  });
}

export async function updatePipelineBuyer(
  token: string | null,
  id: string,
  body: Record<string, unknown>
) {
  return pipelineFetch<{ buyer: PipelineBuyer }>(`/buyers/${encodeURIComponent(id)}`, token, {
    method: "PATCH",
    headers: jsonAuthHeaders(token),
    body: JSON.stringify(body),
  });
}

export async function fetchPipelineLots(token: string | null, status?: string) {
  const q = status ? `?status=${encodeURIComponent(status)}` : "";
  return pipelineFetch<{ lots: PipelineLot[] }>(`/lots${q}`, token);
}

export async function fetchFlockPipelineLot(token: string | null, flockId: string) {
  return pipelineFetch<{
    snapshot: {
      flockId: string;
      companyId: string | null;
      breedCode: string | null;
      birdCount: number;
      avgWeightKg: number | null;
      expectedWeightKg: number | null;
      readyFrom: string | null;
      readyTo: string | null;
      farmLabel: string | null;
    };
    lot: PipelineLot | null;
  }>(`/lots/by-flock/${encodeURIComponent(flockId)}`, token);
}

export async function optInFlockToPipeline(token: string | null, body: Record<string, unknown>) {
  return pipelineFetch<{ lot: PipelineLot }>("/lots/opt-in", token, {
    method: "POST",
    headers: jsonAuthHeaders(token),
    body: JSON.stringify(body),
  });
}

export async function scoutPipelineLot(token: string | null, body: Record<string, unknown>) {
  return pipelineFetch<{ lot: PipelineLot }>("/lots/scout", token, {
    method: "POST",
    headers: jsonAuthHeaders(token),
    body: JSON.stringify(body),
  });
}

export async function refreshPipelineLot(token: string | null, lotId: string) {
  return pipelineFetch<{ lot: PipelineLot }>(`/lots/refresh/${encodeURIComponent(lotId)}`, token, {
    method: "POST",
    headers: jsonAuthHeaders(token),
  });
}

export async function fetchPipelineDemands(token: string | null, status?: string) {
  const q = status ? `?status=${encodeURIComponent(status)}` : "";
  return pipelineFetch<{ demands: PipelineDemand[] }>(`/demands${q}`, token);
}

export async function createPipelineDemand(token: string | null, body: Record<string, unknown>) {
  return pipelineFetch<{ demand: PipelineDemand }>("/demands", token, {
    method: "POST",
    headers: jsonAuthHeaders(token),
    body: JSON.stringify(body),
  });
}

export async function fetchPipelineMatches(token: string | null, status?: string) {
  const q = status ? `?status=${encodeURIComponent(status)}` : "";
  return pipelineFetch<{ matches: PipelineMatch[] }>(`/matches${q}`, token);
}

export async function createPipelineMatch(token: string | null, body: Record<string, unknown>) {
  return pipelineFetch<{ match: PipelineMatch }>("/matches", token, {
    method: "POST",
    headers: jsonAuthHeaders(token),
    body: JSON.stringify(body),
  });
}

export async function updatePipelineMatch(
  token: string | null,
  id: string,
  body: Record<string, unknown>
) {
  return pipelineFetch<{ match: PipelineMatch }>(`/matches/${encodeURIComponent(id)}`, token, {
    method: "PATCH",
    headers: jsonAuthHeaders(token),
    body: JSON.stringify(body),
  });
}

export async function fetchPipelineForwardSummary(token: string | null) {
  return pipelineFetch<ForwardSummary>("/forward-summary", token);
}

export type MarketMe = {
  accountType: string;
  verificationStatus: string;
  buyer?: { id: string; name: string; verificationStatus: string } | null;
  company?: { id: string; name: string; verificationStatus: string } | null;
};

export type HandshakePhase =
  | "awaiting_payment"
  | "reserved"
  | "planned"
  | "buyer_confirmed"
  | "farmer_confirmed"
  | "settled"
  | "exception"
  | "failed"
  | "cancelled";

export type FulfillmentJob = {
  id: string;
  lotId: string;
  buyerId: string;
  buyerName?: string;
  birds: number;
  agreedPricePerKg: number | null;
  readyDate: string | null;
  status: string;
  handshake?: HandshakePhase;
  commissionStatus?: string;
  commissionAmountRwf?: number | null;
  createdAt?: string;
  lotFarmLabel?: string | null;
  lotDistrict?: string | null;
  avgWeightKg?: number | null;
  lotReadyFrom?: string | null;
  lotReadyTo?: string | null;
  collectOrDelivery?: string | null;
  slaughterMode?: string | null;
  deliveryActor?: "buyer" | "farm" | "cleva" | null;
  needClevaDelivery?: boolean;
  fulfillWindowStart?: string | null;
  fulfillWindowEnd?: string | null;
  logisticsNotes?: string | null;
  actualBirds?: number | null;
  actualWeightKg?: number | null;
  actualPricePerKg?: number | null;
  buyerConfirmedAt?: string | null;
  farmerConfirmedAt?: string | null;
  exceptionKind?: string | null;
  exceptionNotes?: string | null;
  exceptionOpenedAt?: string | null;
  exceptionResolvedAt?: string | null;
  buyerPhone?: string | null;
  farmPhone?: string | null;
  farmExactLocation?: string | null;
  farmDisplayName?: string | null;
  publicRef?: string | null;
  farmerCanSlaughter?: boolean;
  deliveryAvailable?: boolean;
  buyerPaymentStatus?: string;
  farmerPayoutStatus?: string;
  buyerPaidRwf?: number | null;
  farmerPaidRwf?: number | null;
  buyerPaymentRef?: string | null;
};

export type MarketOrder = FulfillmentJob;

export type CommissionMine = {
  ratePct: number;
  couldEarn: number;
  accruedUnpaid: number;
  paidThisMonth: number;
  rows: Array<{
    id: string;
    kind?: "visit" | "trade";
    birds: number;
    commissionAmountRwf: number | null;
    commissionStatus: string;
    commissionPaidAt: string | null;
    buyerName: string | null;
    lotFarmLabel: string | null;
    lotDistrict: string | null;
    createdAt: string;
    outcome?: string | null;
  }>;
};

export type WeighQueueLot = PipelineLot & {
  listingPhase?: PipelineLot["listingPhase"];
};

export async function fetchWeighQueue(token: string | null, all = false) {
  const q = all ? "?all=1" : "";
  return pipelineFetch<{ lots: WeighQueueLot[]; dueThisWeek: number; visitFeeRwf: number }>(
    `/market/scout/weigh-queue${q}`,
    token
  );
}

export async function submitLotWeigh(
  token: string | null,
  lotId: string,
  body: Record<string, unknown>
) {
  return pipelineFetch<{
    lot: PipelineLot;
    visit: { id: string; feeRwf: number | null; feeStatus: string; outcome: string };
    visitFeeRwf: number;
  }>(`/market/lots/${encodeURIComponent(lotId)}/weigh`, token, {
    method: "POST",
    headers: jsonAuthHeaders(token),
    body: JSON.stringify(body),
  });
}

export async function saveVisitFee(token: string | null, visitFeeRwf: number) {
  return pipelineFetch<{ visitFeeRwf: number }>("/market/visit-fee", token, {
    method: "PATCH",
    headers: jsonAuthHeaders(token),
    body: JSON.stringify({ visitFeeRwf }),
  });
}

export type VerifyQueue = {
  companies: Array<{ id: string; name: string; slug: string; verificationStatus: string; createdAt: string }>;
  buyers: Array<{
    id: string;
    name: string;
    buyerType: string;
    district: string | null;
    verificationStatus: string;
    userId: string | null;
    createdAt: string;
  }>;
  lots: PipelineLot[];
  profiles?: Array<{
    id: string;
    slug: string;
    displayName: string;
    district: string | null;
    verificationStatus: string;
    consentStatus: string;
    published: boolean;
    createdAt: string;
  }>;
};

export type FarmProfile = {
  id: string;
  companyId: string | null;
  slug: string;
  displayName: string;
  story: string | null;
  district: string | null;
  locationLabel: string | null;
  exactLocation: string | null;
  contactPhone: string | null;
  contactWhatsapp: string | null;
  contactEmail: string | null;
  specialties: string[];
  slaughterAvailable: boolean;
  deliveryAvailable: boolean;
  verificationStatus: string;
  published: boolean;
  consentStatus: string;
  consentAt: string | null;
  discloseContact: boolean;
  discloseExactLocation: boolean;
  discloseExactPrice: boolean;
};

export type MarketMedia = {
  id: string;
  ownerType?: string;
  ownerId?: string;
  publicId?: string;
  secureUrl: string;
  purpose: string;
  caption: string | null;
  sortOrder?: number;
  width?: number | null;
  height?: number | null;
};

export type MarketMediaOwnerType = "farm_profile" | "lot";
export type MarketMediaPurpose = "cover" | "gallery" | "certification" | "visit";

export type FarmAnalytics = {
  totals: {
    profileViews: number;
    listingViews: number;
    requestStarted: number;
    requestSubmitted: number;
    reservations: number;
  };
  byLot: Record<string, { listingViews: number; requestStarted: number; requestSubmitted: number; reservations: number }>;
};

export async function fetchMarketMe(token: string | null) {
  return pipelineFetch<MarketMe>("/market/me", token);
}

export async function fetchMarketOpsSummary(token: string | null) {
  return pipelineFetch<{
    openLotBirds: number;
    committedThisWeek: number;
    accruedUnpaidRwf: number;
    newLeads?: number;
    openExceptions?: number;
  }>("/market/ops-summary", token);
}

export async function fetchMarketLots(
  token: string | null,
  q: { district?: string; birds?: number; avgKg?: number; slaughterPayer?: string; delivery?: boolean } | string = {}
) {
  const trip = typeof q === "string" ? { district: q } : q;
  const sp = new URLSearchParams();
  if (trip.district) sp.set("district", trip.district);
  if (trip.birds) sp.set("birds", String(trip.birds));
  if (trip.avgKg) sp.set("avgKg", String(trip.avgKg));
  if (trip.slaughterPayer) sp.set("slaughterPayer", trip.slaughterPayer);
  if (trip.delivery) sp.set("delivery", "1");
  const qs = sp.toString();
  return pipelineFetch<{ lots: PipelineLot[] }>(`/market/lots${qs ? `?${qs}` : ""}`, token);
}

export async function fetchMarketLot(token: string | null, id: string) {
  return pipelineFetch<{ lot: PipelineLot }>(`/market/lots/${encodeURIComponent(id)}`, token);
}

export async function fetchListingRankPreview(
  token: string | null,
  q: { birds?: number; avgKg?: number; ask?: number; source?: string; flockId?: string } = {}
) {
  const sp = new URLSearchParams();
  if (q.birds) sp.set("birds", String(q.birds));
  if (q.avgKg) sp.set("avgKg", String(q.avgKg));
  if (q.ask) sp.set("ask", String(q.ask));
  if (q.source) sp.set("source", q.source);
  if (q.flockId) sp.set("flockId", q.flockId);
  const qs = sp.toString();
  return pipelineFetch<{
    rails: { min: number; max: number; boardFarmGate: number } | null;
    inRail: boolean;
    rankEligible: boolean;
    merchantTier: "cleva_run" | "market_only";
    rank: number | null;
    peers: number;
    cheaper: number;
    cheapestBuyerRwfPerKg: number | null;
    yourBuyerRwfPerKg: number | null;
    yourFarmGateRwfPerKg: number | null;
    takePct: number;
    farmerSplit?: import("../components/market/MoneySplit").FarmerMoneySplit | null;
  }>(`/market/my-listings/rank-preview${qs ? `?${qs}` : ""}`, token);
}

export async function bookMarketLot(token: string | null, body: Record<string, unknown>) {
  return pipelineFetch<{
    match: { id: string; birds: number; status: string; buyerPaymentStatus?: string };
    payment?: {
      status: string;
      amountRwf: number | null;
      reference: string | null;
      payToPhone: string | null;
      split?: unknown;
    };
  }>("/market/bookings", token, {
    method: "POST",
    headers: jsonAuthHeaders(token),
    body: JSON.stringify(body),
  });
}

export async function fetchBookingPayment(token: string | null, matchId: string) {
  return pipelineFetch<{
    matchId: string;
    buyerPaymentStatus: string;
    farmerPayoutStatus: string;
    amountRwf: number | null;
    reference: string | null;
    payToPhone: string | null;
    split: import("../components/market/MoneySplit").BuyerMoneySplit | null;
    farmerSplit: import("../components/market/MoneySplit").FarmerMoneySplit | null;
  }>(`/market/bookings/${encodeURIComponent(matchId)}/payment`, token);
}

export async function markBuyerPaymentSent(
  token: string | null,
  matchId: string,
  body: { payerPhone?: string; note?: string } = {}
) {
  return pipelineFetch<{ ok: boolean; status: string; amountRwf?: number; reference?: string; payToPhone?: string | null }>(
    `/market/bookings/${encodeURIComponent(matchId)}/pay`,
    token,
    {
      method: "POST",
      headers: jsonAuthHeaders(token),
      body: JSON.stringify(body),
    }
  );
}

export async function confirmBuyerPayment(token: string | null, matchId: string) {
  return pipelineFetch<{ ok: boolean; status: string; farmerPayoutStatus?: string }>(
    `/market/bookings/${encodeURIComponent(matchId)}/confirm-payment`,
    token,
    { method: "POST", headers: jsonAuthHeaders(token), body: "{}" }
  );
}

export async function markFarmPaid(token: string | null, matchId: string, body: Record<string, unknown> = {}) {
  return pipelineFetch<{ ok: boolean; status: string; amountRwf?: number }>(
    `/market/bookings/${encodeURIComponent(matchId)}/pay-farm`,
    token,
    {
      method: "POST",
      headers: jsonAuthHeaders(token),
      body: JSON.stringify(body),
    }
  );
}

export async function fetchMarketSettlements(token: string | null, queue = "open") {
  return pipelineFetch<{
    settlements: Array<{
      id: string;
      birds: number;
      buyerPaymentStatus: string;
      farmerPayoutStatus: string;
      buyerPaidRwf: number | null;
      farmerPaidRwf: number | null;
      buyerPaymentRef: string | null;
      buyerName: string;
      lotDistrict: string | null;
      publicRef: string | null;
    }>;
  }>(`/market/settlements?queue=${encodeURIComponent(queue)}`, token);
}

export async function fetchMyMarketOrders(token: string | null) {
  return pipelineFetch<{ orders: MarketOrder[] }>("/market/my-orders", token);
}

export async function confirmMatchDelivered(
  token: string | null,
  matchId: string,
  body: Record<string, unknown> = {}
) {
  return pipelineFetch<{ match: { id: string; status: string } }>(
    `/matches/${encodeURIComponent(matchId)}/confirm-delivered`,
    token,
    {
      method: "POST",
      headers: jsonAuthHeaders(token),
      body: JSON.stringify(body),
    }
  );
}

export async function fetchMyListings(token: string | null) {
  return pipelineFetch<{ lots: PipelineLot[] }>("/market/my-listings", token);
}

export async function createFarmerListing(token: string | null, body: Record<string, unknown>) {
  return pipelineFetch<{ lot: PipelineLot }>("/market/my-listings", token, {
    method: "POST",
    headers: jsonAuthHeaders(token),
    body: JSON.stringify(body),
  });
}

export type LotBooking = FulfillmentJob & {
  createdAt: string;
  buyerName: string;
};

export async function fetchMarketJobs(token: string | null, queue?: string) {
  const q = queue ? `?queue=${encodeURIComponent(queue)}` : "";
  return pipelineFetch<{ jobs: FulfillmentJob[] }>(`/market/jobs${q}`, token);
}

export async function planMatchLogistics(
  token: string | null,
  matchId: string,
  body: Record<string, unknown>
) {
  return pipelineFetch<{ job: FulfillmentJob }>(
    `/matches/${encodeURIComponent(matchId)}/logistics`,
    token,
    { method: "PATCH", headers: jsonAuthHeaders(token), body: JSON.stringify(body) }
  );
}

export async function confirmFulfillment(
  token: string | null,
  matchId: string,
  body: Record<string, unknown> = {}
) {
  return pipelineFetch<{ job: FulfillmentJob; settle?: boolean; conflict?: { kind: string } | null }>(
    `/matches/${encodeURIComponent(matchId)}/confirm`,
    token,
    { method: "POST", headers: jsonAuthHeaders(token), body: JSON.stringify(body) }
  );
}

export async function openFulfillmentException(
  token: string | null,
  matchId: string,
  body: Record<string, unknown>
) {
  return pipelineFetch<{ job: FulfillmentJob }>(
    `/matches/${encodeURIComponent(matchId)}/exception`,
    token,
    { method: "POST", headers: jsonAuthHeaders(token), body: JSON.stringify(body) }
  );
}

export async function resolveFulfillmentException(
  token: string | null,
  matchId: string,
  body: Record<string, unknown>
) {
  return pipelineFetch<{ job: FulfillmentJob; settle?: boolean }>(
    `/matches/${encodeURIComponent(matchId)}/resolve-exception`,
    token,
    { method: "POST", headers: jsonAuthHeaders(token), body: JSON.stringify(body) }
  );
}

export async function settleFulfillment(
  token: string | null,
  matchId: string,
  body: Record<string, unknown> = {}
) {
  return pipelineFetch<{ job: FulfillmentJob; settle?: boolean }>(
    `/matches/${encodeURIComponent(matchId)}/settle`,
    token,
    { method: "POST", headers: jsonAuthHeaders(token), body: JSON.stringify(body) }
  );
}

export async function fetchLotBookings(token: string | null, lotId: string) {
  return pipelineFetch<{ bookings: LotBooking[] }>(
    `/market/my-listings/${encodeURIComponent(lotId)}/bookings`,
    token
  );
}

export async function updateFarmerListing(
  token: string | null,
  lotId: string,
  body: Record<string, unknown>
) {
  return pipelineFetch<{ lot: PipelineLot }>(
    `/market/my-listings/${encodeURIComponent(lotId)}`,
    token,
    {
      method: "PATCH",
      headers: jsonAuthHeaders(token),
      body: JSON.stringify(body),
    }
  );
}

export async function cancelFarmerListing(token: string | null, lotId: string) {
  return pipelineFetch<{ ok: boolean; status: string }>(
    `/market/my-listings/${encodeURIComponent(lotId)}/cancel`,
    token,
    {
      method: "POST",
      headers: jsonAuthHeaders(token),
      body: JSON.stringify({}),
    }
  );
}


export async function fetchVerifyQueue(token: string | null) {
  return pipelineFetch<VerifyQueue>("/verify/queue", token);
}

export async function verifyCompany(token: string | null, id: string, status: "verified" | "rejected") {
  return pipelineFetch<{ ok: boolean }>(`/verify/company/${encodeURIComponent(id)}`, token, {
    method: "POST",
    headers: jsonAuthHeaders(token),
    body: JSON.stringify({ status }),
  });
}

export async function verifyBuyer(token: string | null, id: string, status: "verified" | "rejected") {
  return pipelineFetch<{ ok: boolean }>(`/verify/buyer/${encodeURIComponent(id)}`, token, {
    method: "POST",
    headers: jsonAuthHeaders(token),
    body: JSON.stringify({ status }),
  });
}

export async function verifyLot(token: string | null, id: string, status: "verified" | "rejected") {
  return pipelineFetch<{ ok: boolean }>(`/verify/lot/${encodeURIComponent(id)}`, token, {
    method: "POST",
    headers: jsonAuthHeaders(token),
    body: JSON.stringify({ status }),
  });
}

export async function fetchMyCommissions(token: string | null) {
  return pipelineFetch<CommissionMine>("/commissions/mine", token);
}

export async function fetchOpsCommissions(token: string | null, status?: string) {
  const q = status ? `?status=${encodeURIComponent(status)}` : "";
  return pipelineFetch<{
    commissions: Array<{
      id: string;
      birds: number;
      commissionAmountRwf: number | null;
      commissionStatus: string;
      commissionPaidAt: string | null;
      scoutName: string | null;
      buyerName: string | null;
      lotFarmLabel: string | null;
      lotDistrict: string | null;
      kind?: "visit" | "trade";
    }>;
  }>(`/commissions${q}`, token);
}

export async function markCommissionPaid(
  token: string | null,
  matchId: string,
  note?: string,
  kind: "visit" | "trade" = "trade"
) {
  return pipelineFetch<{ ok: boolean; amountRwf: number }>(
    `/commissions/${encodeURIComponent(matchId)}/pay`,
    token,
    {
      method: "POST",
      headers: jsonAuthHeaders(token),
      body: JSON.stringify({ note, kind }),
    }
  );
}

export async function voidCommission(
  token: string | null,
  matchId: string,
  note?: string,
  kind: "visit" | "trade" = "trade"
) {
  return pipelineFetch<{ ok: boolean }>(`/commissions/${encodeURIComponent(matchId)}/void`, token, {
    method: "POST",
    headers: jsonAuthHeaders(token),
    body: JSON.stringify({ note, kind }),
  });
}

export type MarketLead = {
  id: string;
  lotId: string | null;
  lotPublicRef: string | null;
  contactName: string;
  phone: string;
  businessName: string | null;
  buyerType: string | null;
  district: string | null;
  birds: number | null;
  neededFrom: string | null;
  message: string | null;
  source: string;
  status: string;
  assignedTo: string | null;
  buyerId: string | null;
  opsNotes: string | null;
  createdAt: string;
  updatedAt: string;
  avgWeightKg?: number | null;
  quoteJson?: import("../lib/marketQuote").FarmerQuote | null;
  typicalBirdsPerWeek?: number | null;
  settleTerms?: string | null;
  expectedRwfPerKg?: number | null;
  handover?: string | null;
  process?: string | null;
};

export async function fetchMarketLeads(
  token: string | null,
  status?: string,
  side?: "buy" | "sell"
) {
  const sp = new URLSearchParams();
  if (status && status !== "all") sp.set("status", status);
  if (side) sp.set("side", side);
  const q = sp.toString() ? `?${sp}` : "";
  return pipelineFetch<{ leads: MarketLead[] }>(`/leads${q}`, token);
}

export async function patchMarketLead(
  token: string | null,
  id: string,
  body: { status?: string; opsNotes?: string; assignedTo?: string | null }
) {
  return pipelineFetch<{ lead: Partial<MarketLead> }>(`/leads/${encodeURIComponent(id)}`, token, {
    method: "PATCH",
    headers: jsonAuthHeaders(token),
    body: JSON.stringify(body),
  });
}

export async function fetchFarmProfile(token: string | null) {
  return pipelineFetch<{ profile: FarmProfile | null; media: MarketMedia[]; analytics: FarmAnalytics | null }>(
    "/market/profile",
    token
  );
}

export async function saveFarmProfile(token: string | null, body: Record<string, unknown>) {
  return pipelineFetch<{ profile: FarmProfile; media: MarketMedia[] }>("/market/profile", token, {
    method: "PUT",
    headers: jsonAuthHeaders(token),
    body: JSON.stringify(body),
  });
}

export async function setFarmConsent(token: string | null, body: { granted: boolean; consentName?: string; consentPhone?: string }) {
  return pipelineFetch<{ profile: FarmProfile }>("/market/profile/consent", token, {
    method: "POST",
    headers: jsonAuthHeaders(token),
    body: JSON.stringify(body),
  });
}

export async function publishFarmProfile(token: string | null, published: boolean) {
  return pipelineFetch<{ profile: FarmProfile }>("/market/profile/publish", token, {
    method: "POST",
    headers: jsonAuthHeaders(token),
    body: JSON.stringify({ published }),
  });
}

export async function claimFarmProfile(token: string | null, claimToken: string) {
  return pipelineFetch<{ profile: FarmProfile }>("/market/profile/claim", token, {
    method: "POST",
    headers: jsonAuthHeaders(token),
    body: JSON.stringify({ token: claimToken }),
  });
}

export async function signMarketMedia(token: string | null, body: { purpose?: string } = {}) {
  return pipelineFetch<{
    ok: true;
    cloudName: string;
    apiKey: string;
    timestamp: number;
    signature: string;
    folder: string;
    uploadUrl: string;
    maxBytes: number;
  }>("/market/media/sign", token, {
    method: "POST",
    headers: jsonAuthHeaders(token),
    body: JSON.stringify(body),
  });
}

export async function saveMarketMedia(
  token: string | null,
  body: {
    ownerType: MarketMediaOwnerType;
    ownerId: string;
    publicId: string;
    secureUrl: string;
    width?: number;
    height?: number;
    format?: string;
    bytes?: number;
    purpose?: MarketMediaPurpose;
    caption?: string;
  }
) {
  return pipelineFetch<{ media: MarketMedia }>("/market/media", token, {
    method: "POST",
    headers: jsonAuthHeaders(token),
    body: JSON.stringify(body),
  });
}

export async function deleteMarketMedia(token: string | null, id: string) {
  return pipelineFetch<{ ok: boolean }>(`/market/media/${encodeURIComponent(id)}`, token, {
    method: "DELETE",
    headers: jsonAuthHeaders(token),
  });
}

export async function patchMarketMedia(token: string | null, id: string, body: Record<string, unknown>) {
  return pipelineFetch<{ ok: boolean }>(`/market/media/${encodeURIComponent(id)}`, token, {
    method: "PATCH",
    headers: jsonAuthHeaders(token),
    body: JSON.stringify(body),
  });
}

export async function fetchScoutFarms(token: string | null, q?: string) {
  const query = q ? `?q=${encodeURIComponent(q)}` : "";
  return pipelineFetch<{ farms: FarmProfile[] }>(`/market/scout/farms${query}`, token);
}

export async function createScoutFarm(token: string | null, body: Record<string, unknown>) {
  return pipelineFetch<{ profile: FarmProfile }>("/market/scout/farms", token, {
    method: "POST",
    headers: jsonAuthHeaders(token),
    body: JSON.stringify(body),
  });
}

export async function recordScoutVisit(token: string | null, farmId: string, body: Record<string, unknown>) {
  return pipelineFetch<{ visit: { id: string }; profile: FarmProfile }>(
    `/market/scout/farms/${encodeURIComponent(farmId)}/visits`,
    token,
    { method: "POST", headers: jsonAuthHeaders(token), body: JSON.stringify(body) }
  );
}

export async function inviteScoutFarm(token: string | null, farmId: string, body: { email?: string; phone?: string }) {
  return pipelineFetch<{ ok: boolean; token: string }>(
    `/market/scout/farms/${encodeURIComponent(farmId)}/invite`,
    token,
    { method: "POST", headers: jsonAuthHeaders(token), body: JSON.stringify(body) }
  );
}

export async function fetchVerifyProfiles(token: string | null) {
  return pipelineFetch<{ profiles: Array<{ profile: FarmProfile; media: MarketMedia[] }> }>(
    "/verify/profiles",
    token
  );
}

export async function verifyFarmProfile(token: string | null, id: string, status: "verified" | "rejected") {
  return pipelineFetch<{ ok: boolean; profile: FarmProfile }>(
    `/verify/profile/${encodeURIComponent(id)}`,
    token,
    { method: "POST", headers: jsonAuthHeaders(token), body: JSON.stringify({ status }) }
  );
}

export async function convertMarketLead(token: string | null, id: string) {
  return pipelineFetch<{
    ok: boolean;
    buyerId?: string;
    demandId?: string;
    lotId?: string;
    publicRef?: string | null;
    alreadyConverted?: boolean;
  }>(`/leads/${encodeURIComponent(id)}/convert`, token, {
    method: "POST",
    headers: jsonAuthHeaders(token),
    body: "{}",
  });
}

export type MarketRateCard = {
  id: string;
  validFrom: string;
  validTo: string;
  status: "draft" | "published" | "archived";
  slaughterRwfPerBird: number;
  deliveryRwfPerTrip: number;
  commissionPct: number;
  clevaRunCommissionPct?: number;
  bands: Array<{ minKg: number; maxKg: number; farmGateRwfPerKg: number; butcherRwfPerKg: number }>;
  quantityTiers?: Array<{
    id: string;
    minBirds: number;
    maxBirds: number | null;
    label: string;
    farmGateAdjRwf: number;
    butcherAdjRwf: number;
  }>;
  notes?: string | null;
};

export async function fetchMarketRates(token: string | null) {
  return pipelineFetch<{
    cards: MarketRateCard[];
    published: MarketRateCard | null;
    preview: {
      farmer: import("../lib/marketQuote").FarmerQuote;
      butcher: import("../lib/marketQuote").ButcherReceipt;
      board: import("../lib/marketQuote").MarketBoard;
    } | null;
    defaults: {
      validFrom: string;
      validTo: string;
      bands: MarketRateCard["bands"];
      quantityTiers?: MarketRateCard["quantityTiers"];
      slaughterRwfPerBird: number;
      deliveryRwfPerTrip: number;
      commissionPct: number;
      clevaRunCommissionPct?: number;
      visitFeeRwf?: number;
    };
    visitFeeRwf?: number;
  }>("/market/rates", token);
}

export async function saveMarketRateDraft(token: string | null, body: Record<string, unknown>, id?: string) {
  return pipelineFetch<{ card: MarketRateCard }>(id ? `/market/rates/${encodeURIComponent(id)}` : "/market/rates", token, {
    method: id ? "PATCH" : "POST",
    headers: jsonAuthHeaders(token),
    body: JSON.stringify(body),
  });
}

export async function publishMarketRate(token: string | null, id: string) {
  return pipelineFetch<{ card: MarketRateCard }>(`/market/rates/${encodeURIComponent(id)}/publish`, token, {
    method: "POST",
    headers: jsonAuthHeaders(token),
    body: "{}",
  });
}

