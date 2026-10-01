import type {
  FulfillmentJob,
  MarketLead,
  MarketRateCard,
  PipelineBuyer,
  PipelineLot,
  PipelineMatch,
  WeighQueueLot,
} from "../../../api/pipeline.api";
import { previewFromDraft } from "../../../lib/marketQuote";

/** ISO date helpers for demo fixtures relative to “today”. */
function dayOffset(days: number): string {
  const d = new Date();
  d.setHours(12, 0, 0, 0);
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

export const DEMO_RATE_CARD: MarketRateCard = {
  id: "demo_rate_live",
  validFrom: dayOffset(0),
  validTo: dayOffset(6),
  status: "published",
  slaughterRwfPerBird: 200,
  deliveryRwfPerTrip: 15000,
  commissionPct: 5,
  clevaRunCommissionPct: 2,
  bands: [
    { minKg: 1.4, maxKg: 1.6, farmGateRwfPerKg: 3600, butcherRwfPerKg: 4100 },
    { minKg: 1.6, maxKg: 1.8, farmGateRwfPerKg: 3800, butcherRwfPerKg: 4300 },
    { minKg: 1.8, maxKg: 2.1, farmGateRwfPerKg: 3950, butcherRwfPerKg: 4450 },
  ],
  quantityTiers: [
    { id: "kitchen", minBirds: 10, maxBirds: 49, label: "Kitchen", farmGateAdjRwf: 0, butcherAdjRwf: 150 },
    { id: "shop", minBirds: 50, maxBirds: 99, label: "Shop", farmGateAdjRwf: 0, butcherAdjRwf: 0 },
    { id: "usual", minBirds: 100, maxBirds: 199, label: "Usual", farmGateAdjRwf: -30, butcherAdjRwf: -50 },
    { id: "load", minBirds: 200, maxBirds: null, label: "Load", farmGateAdjRwf: -80, butcherAdjRwf: -150 },
  ],
};

export const DEMO_RATE_DRAFT: MarketRateCard = {
  ...DEMO_RATE_CARD,
  id: "demo_rate_draft",
  status: "draft",
  bands: [
    { minKg: 1.4, maxKg: 1.6, farmGateRwfPerKg: 3650, butcherRwfPerKg: 4150 },
    { minKg: 1.6, maxKg: 1.8, farmGateRwfPerKg: 3850, butcherRwfPerKg: 4350 },
    { minKg: 1.8, maxKg: 2.1, farmGateRwfPerKg: 4000, butcherRwfPerKg: 4500 },
  ],
};

export function demoRatesPayload() {
  const preview =
    previewFromDraft({
      slaughterRwfPerBird: DEMO_RATE_DRAFT.slaughterRwfPerBird,
      deliveryRwfPerTrip: DEMO_RATE_DRAFT.deliveryRwfPerTrip,
      commissionPct: DEMO_RATE_DRAFT.commissionPct,
      bands: DEMO_RATE_DRAFT.bands,
    }) || null;
  return {
    cards: [DEMO_RATE_DRAFT, DEMO_RATE_CARD],
    published: DEMO_RATE_CARD,
    preview: preview
      ? {
          farmer: {
            cardId: DEMO_RATE_CARD.id,
            validFrom: DEMO_RATE_CARD.validFrom,
            validTo: DEMO_RATE_CARD.validTo,
            birds: 200,
            avgKg: 1.8,
            slaughterPayer: "butcher" as const,
            delivery: false,
            farmer: preview.farmer,
          },
          butcher: preview.butcher,
          board: {
            validFrom: DEMO_RATE_CARD.validFrom,
            validTo: DEMO_RATE_CARD.validTo,
            slaughterRwfPerBird: DEMO_RATE_CARD.slaughterRwfPerBird,
            deliveryRwfPerTrip: DEMO_RATE_CARD.deliveryRwfPerTrip,
            bands: DEMO_RATE_CARD.bands.map((b) => ({
              minKg: b.minKg,
              maxKg: b.maxKg,
              fromRwfPerKg: b.butcherRwfPerKg,
            })),
            quantityTiers: DEMO_RATE_CARD.quantityTiers?.map((t) => ({
              id: t.id,
              label: t.label,
              minBirds: t.minBirds,
              maxBirds: t.maxBirds,
              fromRwfPerKg: null,
            })),
            headlineRwfPerKg: 4300,
          },
        }
      : null,
    defaults: {
      validFrom: dayOffset(0),
      validTo: dayOffset(6),
      bands: DEMO_RATE_DRAFT.bands,
      quantityTiers: DEMO_RATE_DRAFT.quantityTiers,
      slaughterRwfPerBird: 200,
      deliveryRwfPerTrip: 15000,
      commissionPct: 5,
      clevaRunCommissionPct: 2,
      visitFeeRwf: 5000,
    },
    visitFeeRwf: 5000,
  };
}

export const DEMO_BUYERS: PipelineBuyer[] = [
  {
    id: "demo_buyer_1",
    name: "Kigali Fresh Meats",
    buyerType: "butcher",
    district: "Gasabo",
    whatsapp: "+250788111001",
    phone: "+250788111001",
    weeklyBirdsMin: 200,
    weeklyBirdsMax: 400,
    weightKgMin: 1.6,
    weightKgMax: 2.0,
    prefersSlaughtered: true,
    collectOrDelivery: "delivery",
    noticeDays: 2,
    notes: "Pays MoMo same day",
    active: true,
  },
  {
    id: "demo_buyer_2",
    name: "Hotel des Mille Collines",
    buyerType: "hotel",
    district: "Nyarugenge",
    whatsapp: "+250788222002",
    phone: null,
    weeklyBirdsMin: 80,
    weeklyBirdsMax: 120,
    weightKgMin: 1.7,
    weightKgMax: 1.9,
    prefersSlaughtered: true,
    collectOrDelivery: "delivery",
    noticeDays: 3,
    notes: null,
    active: true,
  },
  {
    id: "demo_buyer_3",
    name: "Nyamata Vendor Co-op",
    buyerType: "vendor",
    district: "Bugesera",
    whatsapp: "+250788333003",
    phone: "+250788333003",
    weeklyBirdsMin: 50,
    weeklyBirdsMax: 100,
    weightKgMin: null,
    weightKgMax: null,
    prefersSlaughtered: false,
    collectOrDelivery: "collect",
    noticeDays: 1,
    notes: "Prefers live birds",
    active: true,
  },
];

function lot(
  partial: Partial<PipelineLot> & Pick<PipelineLot, "id" | "farmLabel" | "district" | "birdCount" | "listingPhase">
): PipelineLot {
  return {
    source: "scout",
    companyId: "comp_default",
    flockId: null,
    contactPhone: "+250788000000",
    saleableBirds: partial.birdCount,
    breedCode: "cobb_500",
    avgWeightKg: 1.75,
    expectedWeightKg: 1.8,
    readyFrom: dayOffset(2),
    readyTo: dayOffset(5),
    askPricePerKg: 3800,
    butcherPricePerKg: 4300,
    status: "open",
    remainingBirds: partial.birdCount,
    farmerCanSlaughter: true,
    deliveryAvailable: true,
    notes: null,
    ...partial,
  };
}

export const DEMO_LOTS: PipelineLot[] = [
  lot({
    id: "demo_lot_1",
    farmLabel: "Rwamagana Broilers",
    district: "Rwamagana",
    birdCount: 320,
    listingPhase: "live",
    avgWeightKg: 1.82,
    status: "open",
  }),
  lot({
    id: "demo_lot_2",
    farmLabel: "Kayonza Hills",
    district: "Kayonza",
    birdCount: 180,
    listingPhase: "weighed",
    avgWeightKg: 1.68,
    status: "open",
  }),
  lot({
    id: "demo_lot_3",
    farmLabel: "Bugesera Coop A",
    district: "Bugesera",
    birdCount: 250,
    listingPhase: "visit_due",
    avgWeightKg: null,
    status: "open",
    readyFrom: dayOffset(1),
    readyTo: dayOffset(4),
  }),
  lot({
    id: "demo_lot_4",
    farmLabel: "Musanze Family Farm",
    district: "Musanze",
    birdCount: 110,
    listingPhase: "visit_due",
    avgWeightKg: null,
    status: "draft",
    readyFrom: dayOffset(0),
    readyTo: dayOffset(3),
  }),
];

export const DEMO_MATCHES: PipelineMatch[] = [
  {
    id: "demo_match_1",
    lotId: "demo_lot_1",
    demandId: null,
    buyerId: "demo_buyer_1",
    birds: 150,
    agreedPricePerKg: 4300,
    readyDate: dayOffset(3),
    status: "committed",
    transportNotes: null,
    slaughterNotes: null,
    learningNotes: null,
    salesOrderId: null,
    buyerName: "Kigali Fresh Meats",
    lotFarmLabel: "Rwamagana Broilers",
    lotDistrict: "Rwamagana",
  },
  {
    id: "demo_match_2",
    lotId: "demo_lot_2",
    demandId: null,
    buyerId: "demo_buyer_2",
    birds: 80,
    agreedPricePerKg: 4350,
    readyDate: dayOffset(4),
    status: "committed",
    transportNotes: null,
    slaughterNotes: null,
    learningNotes: null,
    salesOrderId: null,
    buyerName: "Hotel des Mille Collines",
    lotFarmLabel: "Kayonza Hills",
    lotDistrict: "Kayonza",
  },
];

export const DEMO_JOBS: FulfillmentJob[] = [
  {
    id: "demo_job_1",
    lotId: "demo_lot_1",
    buyerId: "demo_buyer_1",
    buyerName: "Kigali Fresh Meats",
    birds: 150,
    agreedPricePerKg: 4300,
    readyDate: dayOffset(3),
    status: "committed",
    handshake: "awaiting_payment",
    buyerPaymentStatus: "unpaid",
    farmerPayoutStatus: "unpaid",
    lotFarmLabel: "Rwamagana Broilers",
    lotDistrict: "Rwamagana",
    publicRef: "LOT-RW-01",
    exceptionKind: "none",
  },
  {
    id: "demo_job_2",
    lotId: "demo_lot_2",
    buyerId: "demo_buyer_2",
    buyerName: "Hotel des Mille Collines",
    birds: 80,
    agreedPricePerKg: 4350,
    readyDate: dayOffset(4),
    status: "committed",
    handshake: "reserved",
    buyerPaymentStatus: "pending",
    farmerPayoutStatus: "unpaid",
    lotFarmLabel: "Kayonza Hills",
    publicRef: "LOT-KY-02",
    exceptionKind: "weight_dispute",
    exceptionNotes: "Buyer claims birds ran light",
  },
  {
    id: "demo_job_3",
    lotId: "demo_lot_1",
    buyerId: "demo_buyer_3",
    buyerName: "Nyamata Vendor Co-op",
    birds: 50,
    agreedPricePerKg: 4200,
    readyDate: dayOffset(2),
    status: "committed",
    handshake: "planned",
    buyerPaymentStatus: "paid",
    farmerPayoutStatus: "unpaid",
    lotFarmLabel: "Rwamagana Broilers",
    publicRef: "LOT-RW-01B",
    exceptionKind: "none",
  },
];

export const DEMO_LEADS: MarketLead[] = [
  {
    id: "demo_lead_1",
    lotId: null,
    lotPublicRef: null,
    contactName: "Jean Bosco",
    phone: "+250788444004",
    businessName: "Remera Butchery",
    buyerType: "butcher",
    district: "Gasabo",
    birds: 100,
    neededFrom: dayOffset(5),
    message: "Need 100 birds Friday morning",
    source: "public_request",
    status: "new",
    assignedTo: null,
    buyerId: null,
    opsNotes: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  {
    id: "demo_lead_2",
    lotId: null,
    lotPublicRef: null,
    contactName: "Alice Uwase",
    phone: "+250788555005",
    businessName: null,
    buyerType: "restaurant",
    district: "Kicukiro",
    birds: 40,
    neededFrom: dayOffset(7),
    message: null,
    source: "whatsapp",
    status: "new",
    assignedTo: null,
    buyerId: null,
    opsNotes: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
];

export const DEMO_WEIGH: WeighQueueLot[] = DEMO_LOTS.filter((l) => l.listingPhase === "visit_due").map((l) => ({
  ...l,
  sellingWeekLabel: `Week of ${l.readyFrom}`,
}));

export const DEMO_COMMISSIONS = [
  {
    id: "demo_comm_1",
    birds: 150,
    commissionAmountRwf: 58000,
    commissionStatus: "accrued",
    commissionPaidAt: null,
    scoutName: "Lead Vet",
    buyerName: "Kigali Fresh Meats",
    lotFarmLabel: "Rwamagana Broilers",
    lotDistrict: "Rwamagana",
    kind: "trade" as const,
  },
  {
    id: "demo_comm_2",
    birds: 0,
    commissionAmountRwf: 5000,
    commissionStatus: "accrued",
    commissionPaidAt: null,
    scoutName: "Lead Vet",
    buyerName: null,
    lotFarmLabel: "Bugesera Coop A",
    lotDistrict: "Bugesera",
    kind: "visit" as const,
  },
  {
    id: "demo_comm_3",
    birds: 0,
    commissionAmountRwf: 5000,
    commissionStatus: "accrued",
    commissionPaidAt: null,
    scoutName: "Field Scout",
    buyerName: null,
    lotFarmLabel: "Musanze Family Farm",
    lotDistrict: "Musanze",
    kind: "visit" as const,
  },
];

export const DEMO_VERIFY = {
  companies: [{ id: "demo_co_1", name: "New Valley Farms", slug: "new-valley", verificationStatus: "pending", createdAt: new Date().toISOString() }],
  buyers: [
    {
      id: "demo_buyer_pending",
      name: "Gikondo Grill",
      buyerType: "restaurant",
      district: "Kicukiro",
      verificationStatus: "pending",
      userId: null,
      createdAt: new Date().toISOString(),
    },
  ],
  lots: [DEMO_LOTS[3]],
  profiles: [
    {
      id: "demo_prof_1",
      slug: "kayonza-hills",
      displayName: "Kayonza Hills",
      district: "Kayonza",
      verificationStatus: "pending",
      consentStatus: "granted",
      published: false,
      createdAt: new Date().toISOString(),
    },
  ],
};

export const DEMO_OPS_SUMMARY = {
  openLotBirds: DEMO_LOTS.reduce((s, l) => s + (l.remainingBirds ?? l.birdCount), 0),
  committedThisWeek: 280,
  accruedUnpaidRwf: DEMO_COMMISSIONS.reduce((s, c) => s + (c.commissionAmountRwf || 0), 0),
  newLeads: DEMO_LEADS.length,
  openExceptions: 1,
};

export const DEMO_FORWARD: {
  weeks: Array<{ key: string; label: string; from: string; to: string; birds: number; byDistrict: Record<string, number> }>;
  openDemandBirds: number;
} = {
  weeks: [
    { key: "w0", label: "This week", from: dayOffset(0), to: dayOffset(6), birds: 430, byDistrict: { Rwamagana: 320, Kayonza: 110 } },
    { key: "w1", label: "Next week", from: dayOffset(7), to: dayOffset(13), birds: 610, byDistrict: { Bugesera: 250, Musanze: 180, Gasabo: 180 } },
    { key: "w2", label: "+2 weeks", from: dayOffset(14), to: dayOffset(20), birds: 280, byDistrict: { Kayonza: 180, Rwamagana: 100 } },
    { key: "w3", label: "+3 weeks", from: dayOffset(21), to: dayOffset(27), birds: 150, byDistrict: { Bugesera: 150 } },
  ],
  openDemandBirds: 140,
};

/** True when the failure is “no DB / API down”, not an auth/permission issue. */
export function isMarketDemoEligibleError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err ?? "");
  return /database unavailable|failed to fetch|network|api down|503/i.test(msg);
}

export function forceMarketDemoFromUrl(search: string): boolean {
  const sp = new URLSearchParams(search.startsWith("?") ? search.slice(1) : search);
  return sp.get("demo") === "1" || sp.get("demo") === "true";
}
