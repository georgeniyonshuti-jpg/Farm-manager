export type FarmerReceipt = {
  farmGateRwfPerKg: number;
  meatRwf: number;
  commissionRwf: number;
  commissionPct: number;
  processingRwf: number;
  youReceiveRwf: number;
};

export type ButcherReceipt = {
  butcherRwfPerKg: number;
  meatRwf: number;
  slaughterRwf: number;
  deliveryRwf: number;
  youPayRwf: number;
  validTo?: string;
};

export type FarmerQuote = {
  cardId: string;
  validFrom: string;
  validTo: string;
  birds: number;
  avgKg: number;
  slaughterPayer: "butcher" | "farm";
  delivery: boolean;
  farmer: FarmerReceipt;
};

export type MarketBoardBand = {
  minKg: number;
  maxKg: number;
  fromRwfPerKg: number;
};

export type MarketQuantityTier = {
  id: string;
  label: string;
  minBirds: number;
  maxBirds: number | null;
  fromRwfPerKg: number | null;
};

export type MarketBoardTrend = {
  previousRwfPerKg: number;
  changePct: number;
};

export type MarketBoard = {
  validFrom: string;
  validTo: string;
  slaughterRwfPerBird: number;
  deliveryRwfPerTrip: number;
  bands: MarketBoardBand[];
  quantityTiers?: MarketQuantityTier[];
  rankMoq?: number;
  headlineRwfPerKg?: number | null;
  trend?: MarketBoardTrend | null;
};

/** Desk default butcher band — used on the public board until Clevatech publishes. */
export const DEMO_STRIP_RATE_RWF = 4300;

/** Public chocolate strip: posted headline, else first band. */
export function resolveStripRate(board: MarketBoard | null | undefined): number | null {
  const n = board?.headlineRwfPerKg ?? board?.bands?.[0]?.fromRwfPerKg;
  return n != null && Number.isFinite(n) ? n : null;
}

/** Posted Cleva rate, else the demo board rate. */
export function displayStripRate(board: MarketBoard | null | undefined, fallback = DEMO_STRIP_RATE_RWF): number {
  return resolveStripRate(board) ?? fallback;
}

export function formatRwf(n: number | null | undefined) {
  if (n == null || !Number.isFinite(n)) return "—";
  return `${Math.round(n).toLocaleString("en-RW")} RWF`;
}

export function formatKgRange(minKg: number, maxKg: number) {
  return `${minKg.toFixed(1)}–${maxKg.toFixed(1)} kg`;
}

/** Monday–Sunday containing `now` (UTC date). Matches the server week window. */
export function defaultWeekBounds(now = new Date()) {
  const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const day = d.getUTCDay();
  const mondayOffset = day === 0 ? -6 : 1 - day;
  const from = new Date(d);
  from.setUTCDate(d.getUTCDate() + mondayOffset);
  const to = new Date(from);
  to.setUTCDate(from.getUTCDate() + 6);
  return { validFrom: from.toISOString().slice(0, 10), validTo: to.toISOString().slice(0, 10) };
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export function formatWeekRange(validFrom: string, validTo: string) {
  const from = new Date(`${validFrom}T00:00:00Z`);
  const to = new Date(`${validTo}T00:00:00Z`);
  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) return `${validFrom}–${validTo}`;
  const sameMonth = from.getUTCMonth() === to.getUTCMonth();
  const dayMonth = (d: Date) => `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}`;
  return `${sameMonth ? from.getUTCDate() : dayMonth(from)}–${dayMonth(to)}`;
}

export function butcherPayFromBoard(
  board: MarketBoard | null | undefined,
  input: { birds: number; avgKg: number; slaughterPayer?: "butcher" | "farm"; delivery?: boolean }
): ButcherReceipt | null {
  if (!board) return null;
  const birds = Math.round(Number(input.birds));
  const avgKg = Number(input.avgKg);
  if (!(birds > 0) || !(avgKg > 0)) return null;
  const band = board.bands.find((b, i, list) => {
    const last = i === list.length - 1;
    return avgKg >= b.minKg && (last ? avgKg <= b.maxKg : avgKg < b.maxKg);
  });
  if (!band) return null;
  const slaughterPayer = input.slaughterPayer === "farm" ? "farm" : "butcher";
  const tiers = board.quantityTiers || [];
  const tier = tiers.find((t) => {
    const hi = t.maxBirds == null ? Infinity : t.maxBirds;
    return birds >= t.minBirds && birds <= hi;
  });
  const minFrom = board.bands.reduce((m, b) => Math.min(m, b.fromRwfPerKg), Number.POSITIVE_INFINITY);
  const adj =
    tier && tier.fromRwfPerKg != null && Number.isFinite(minFrom) ? tier.fromRwfPerKg - minFrom : 0;
  const butcherRwfPerKg = band.fromRwfPerKg + adj;
  const meatRwf = Math.round(birds * avgKg * butcherRwfPerKg);
  const slaughterRwf = slaughterPayer === "butcher" ? (board.slaughterRwfPerBird || 0) * birds : 0;
  const deliveryRwf = input.delivery ? board.deliveryRwfPerTrip || 0 : 0;
  return {
    butcherRwfPerKg,
    meatRwf,
    slaughterRwf,
    deliveryRwf,
    youPayRwf: meatRwf + slaughterRwf + deliveryRwf,
    validTo: board.validTo,
  };
}

export function midWeight(band: { minKg: number; maxKg: number }) {
  return Math.round(((band.minKg + band.maxKg) / 2) * 10) / 10;
}

function pickDraftBand(
  bands: Array<{ minKg: number; maxKg: number; farmGateRwfPerKg: number; butcherRwfPerKg: number }>,
  avgKg: number
) {
  for (let i = 0; i < bands.length; i += 1) {
    const b = bands[i];
    const last = i === bands.length - 1;
    if (avgKg >= b.minKg && (last ? avgKg <= b.maxKg : avgKg < b.maxKg)) return b;
  }
  return null;
}

/** Ops preview from the card they are editing — 200 birds × 1.8 kg by default. */
export function previewFromDraft(
  card: {
    slaughterRwfPerBird: number;
    deliveryRwfPerTrip: number;
    commissionPct: number;
    bands: Array<{ minKg: number; maxKg: number; farmGateRwfPerKg: number; butcherRwfPerKg: number }>;
  },
  input: { birds?: number; avgKg?: number } = {}
): { farmer: FarmerReceipt; butcher: ButcherReceipt } | null {
  const birds = Math.round(Number(input.birds ?? 200));
  const avgKg = Number(input.avgKg ?? 1.8);
  if (!(birds > 0) || !(avgKg > 0)) return null;
  const band = pickDraftBand(card.bands, avgKg);
  if (!band) return null;
  const meatRwf = Math.round(birds * avgKg * band.farmGateRwfPerKg);
  const commissionRwf = Math.round((meatRwf * (Number(card.commissionPct) || 0)) / 100);
  const butcherMeatRwf = Math.round(birds * avgKg * band.butcherRwfPerKg);
  const slaughterRwf = (card.slaughterRwfPerBird || 0) * birds;
  return {
    farmer: {
      farmGateRwfPerKg: band.farmGateRwfPerKg,
      meatRwf,
      commissionRwf,
      commissionPct: Number(card.commissionPct) || 0,
      processingRwf: 0,
      youReceiveRwf: meatRwf - commissionRwf,
    },
    butcher: {
      butcherRwfPerKg: band.butcherRwfPerKg,
      meatRwf: butcherMeatRwf,
      slaughterRwf,
      deliveryRwf: 0,
      youPayRwf: butcherMeatRwf + slaughterRwf,
    },
  };
}
