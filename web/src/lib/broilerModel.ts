export type BroilerModelInputs = {
  chicksPlaced: number;
  costPerChick: number;
  mortalityPct: number;
  cycleDays: number;
  finishWeight: number;
  pricePerKg: number;
  feedPerKg: number;
  fcr: number;
  feedKgTotal: number;
  medVaccine: number;
  labor: number;
  utilities: number;
  transport: number;
  overheadFixed: number;
  mortalityCurveExp: number;
};

export type CostBreakdownItem = {
  name: string;
  value: number;
  color: string;
  pct: string | number;
};

export type WaterfallItem = {
  name: string;
  value: number;
  type: "total" | "negative";
  color: string;
};

export type SensitivityCell = {
  priceDelta: number;
  fcrDelta: number;
  profit: number;
  margin: number;
};

export type SensitivityRow = {
  fcrDelta: number;
  points: SensitivityCell[];
};

export type ScenarioItem = {
  name: string;
  description: string;
  profit: number;
  margin: number;
  color: string;
};

export type DailyCurvePoint = {
  day: number;
  cost: number;
  revenue: number;
};

export type HealthFlag = "good" | "ok" | "risk";

export type BroilerModelResults = {
  chicksPlaced: number;
  birdsLost: number;
  birdsSold: number;
  mortalityRate: number;
  totalLiveKg: number;
  actualFeedKg: number;
  actualFCR: number;
  grossRevenue: number;
  chickCost: number;
  feedCost: number;
  mortalityCost: number;
  totalVariableCost: number;
  totalFixedCost: number;
  totalCost: number;
  grossProfit: number;
  grossMarginPct: number;
  profitPerBird: number;
  profitPerKg: number;
  costPerKgProduced: number;
  breakEvenPricePerKg: number;
  breakEvenKg: number;
  breakEvenBirds: number;
  marginToBreakEven: number;
  costBreakdown: CostBreakdownItem[];
  waterfall: WaterfallItem[];
  sensitivityGrid: SensitivityRow[];
  scenarios: ScenarioItem[];
  dailyCurve: DailyCurvePoint[];
  healthFlags: {
    fcr: HealthFlag;
    margin: HealthFlag;
    mortality: HealthFlag;
    costPerKg: HealthFlag;
  };
  benchmarks: Record<string, { good: number; ok: number; label: string }>;
  inputs: BroilerModelInputs;
};

/** Map API / form snake_case keys to model inputs. */
export function broilerInputsFromRecord(inputs: Record<string, number>): BroilerModelInputs {
  return {
    chicksPlaced: Number(inputs.chicks ?? 0),
    costPerChick: Number(inputs.cost_per_chick ?? 0),
    mortalityPct: Number(inputs.mortality_pct ?? 0),
    cycleDays: Number(inputs.cycle_days ?? 35),
    finishWeight: Number(inputs.finish_weight_kg ?? 0),
    pricePerKg: Number(inputs.price_per_kg ?? 0),
    feedPerKg: Number(inputs.feed_price_per_kg ?? 0),
    fcr: Number(inputs.fcr ?? 0),
    feedKgTotal: Number(inputs.feed_kg_total ?? 0),
    medVaccine: Number(inputs.med_vaccine_total ?? 0),
    labor: Number(inputs.labor_total ?? 0),
    utilities: Number(inputs.utilities_total ?? 0),
    transport: Number(inputs.transport_total ?? 0),
    overheadFixed: Number(inputs.overhead_fixed ?? 0),
    mortalityCurveExp: Number(inputs.mortality_curve_exponent ?? 1),
  };
}

export function runBroilerModel(inputs: BroilerModelInputs): BroilerModelResults {
  const {
    chicksPlaced,
    costPerChick,
    mortalityPct,
    cycleDays,
    finishWeight,
    pricePerKg,
    feedPerKg,
    fcr,
    feedKgTotal,
    medVaccine,
    labor,
    utilities,
    transport,
    overheadFixed,
    mortalityCurveExp,
  } = inputs;

  const mortalityRate = mortalityPct / 100;
  const birdsLost = Math.round(chicksPlaced * mortalityRate);
  const birdsSold = chicksPlaced - birdsLost;

  const totalLiveKg = birdsSold * finishWeight;
  const derivedFeedKg = totalLiveKg * fcr;
  const actualFeedKg = feedKgTotal > 0 ? feedKgTotal : derivedFeedKg;
  const actualFCR = totalLiveKg > 0 ? actualFeedKg / totalLiveKg : fcr;

  const grossRevenue = totalLiveKg * pricePerKg;
  const chickCost = chicksPlaced * costPerChick;
  const feedCost = actualFeedKg * feedPerKg;
  const mortalityCost = birdsLost * costPerChick;
  const totalVariableCost = chickCost + feedCost + medVaccine + transport;
  const totalFixedCost = labor + utilities + overheadFixed;
  const totalCost = totalVariableCost + totalFixedCost;

  const grossProfit = grossRevenue - totalCost;
  const grossMarginPct = grossRevenue > 0 ? (grossProfit / grossRevenue) * 100 : 0;
  const profitPerBird = birdsSold > 0 ? grossProfit / birdsSold : 0;
  const profitPerKg = totalLiveKg > 0 ? grossProfit / totalLiveKg : 0;
  const costPerKgProduced = totalLiveKg > 0 ? totalCost / totalLiveKg : 0;

  const breakEvenPricePerKg = totalLiveKg > 0 ? totalCost / totalLiveKg : 0;
  const breakEvenKg = pricePerKg > 0 ? totalCost / pricePerKg : 0;
  const breakEvenBirds = finishWeight > 0 && pricePerKg > 0 ? breakEvenKg / finishWeight : 0;
  const marginToBreakEven = pricePerKg - breakEvenPricePerKg;

  const costBreakdown: CostBreakdownItem[] = [
    { name: "Chicks", value: chickCost, color: "#4ADE80" },
    { name: "Feed", value: feedCost, color: "#60A5FA" },
    { name: "Med/Vaccine", value: medVaccine, color: "#FBBF24" },
    { name: "Labor", value: labor, color: "#F87171" },
    { name: "Transport", value: transport, color: "#A78BFA" },
    { name: "Utilities", value: utilities, color: "#FB923C" },
    { name: "Overhead", value: overheadFixed, color: "#34D399" },
  ]
    .filter((item) => item.value > 0)
    .map((item) => ({
      ...item,
      pct: totalCost > 0 ? ((item.value / totalCost) * 100).toFixed(1) : 0,
    }));

  const waterfall: WaterfallItem[] = [
    { name: "Revenue", value: grossRevenue, type: "total", color: "#4ADE80" },
    { name: "Chicks", value: -chickCost, type: "negative", color: "#F87171" },
    { name: "Feed", value: -feedCost, type: "negative", color: "#F87171" },
    { name: "Med/Vax", value: -medVaccine, type: "negative", color: "#F87171" },
    { name: "Labor", value: -labor, type: "negative", color: "#F87171" },
    { name: "Transport", value: -transport, type: "negative", color: "#F87171" },
    { name: "Utilities", value: -utilities, type: "negative", color: "#F87171" },
    { name: "Overhead", value: -overheadFixed, type: "negative", color: "#F87171" },
    {
      name: "Net Profit",
      value: grossProfit,
      type: "total",
      color: grossProfit >= 0 ? "#4ADE80" : "#F87171",
    },
  ];

  const priceRange = [-15, -10, -5, 0, 5, 10, 15];
  const fcrRange = [-15, -10, -5, 0, 5, 10, 15];

  const sensitivityGrid: SensitivityRow[] = fcrRange.map((fcrDelta) => ({
    fcrDelta,
    points: priceRange.map((priceDelta) => {
      const p = pricePerKg * (1 + priceDelta / 100);
      const f = fcr * (1 + fcrDelta / 100);
      const fkgAdj = totalLiveKg * f;
      const fcostAdj = fkgAdj * feedPerKg;
      const revAdj = totalLiveKg * p;
      const costAdj =
        chickCost + fcostAdj + medVaccine + transport + labor + utilities + overheadFixed;
      const profitAdj = revAdj - costAdj;
      const marginAdj = revAdj > 0 ? (profitAdj / revAdj) * 100 : 0;
      return { priceDelta, fcrDelta, profit: profitAdj, margin: marginAdj };
    }),
  }));

  const scenarios: ScenarioItem[] = [
    {
      name: "Base case",
      description: "Your current inputs as entered",
      profit: grossProfit,
      margin: grossMarginPct,
      color: "#60A5FA",
    },
    {
      name: "Optimistic",
      description: "+5% price/kg, FCR improved by 0.1",
      profit: (() => {
        const r = totalLiveKg * (pricePerKg * 1.05);
        const c =
          chickCost +
          totalLiveKg * (fcr - 0.1) * feedPerKg +
          medVaccine +
          transport +
          labor +
          utilities +
          overheadFixed;
        return r - c;
      })(),
      margin: 0,
      color: "#4ADE80",
    },
    {
      name: "Pessimistic",
      description: "-8% price/kg, FCR worsened by 0.15",
      profit: (() => {
        const r = totalLiveKg * (pricePerKg * 0.92);
        const c =
          chickCost +
          totalLiveKg * (fcr + 0.15) * feedPerKg +
          medVaccine +
          transport +
          labor +
          utilities +
          overheadFixed;
        return r - c;
      })(),
      margin: 0,
      color: "#FBBF24",
    },
    {
      name: "Stress test",
      description: "-15% price, +10% mortality, FCR +0.2",
      profit: (() => {
        const stressMortality = mortalityRate + 0.1;
        const stressBirdsSold = chicksPlaced * (1 - stressMortality);
        const stressKg = stressBirdsSold * finishWeight;
        const r = stressKg * (pricePerKg * 0.85);
        const c =
          chickCost +
          stressKg * (fcr + 0.2) * feedPerKg +
          medVaccine +
          transport +
          labor +
          utilities +
          overheadFixed;
        return r - c;
      })(),
      margin: 0,
      color: "#F87171",
    },
  ];

  scenarios.forEach((s) => {
    s.margin = grossRevenue > 0 ? (s.profit / grossRevenue) * 100 : 0;
  });

  const dailyCurve: DailyCurvePoint[] = Array.from({ length: cycleDays + 1 }, (_, day) => {
    const dayFraction = cycleDays > 0 ? day / cycleDays : 0;
    const cumulativeFeed = feedCost * Math.pow(dayFraction, mortalityCurveExp || 1);
    const cumulativeFixed = (labor + utilities + overheadFixed) * dayFraction;
    const cumulativeCost =
      chickCost +
      cumulativeFeed +
      cumulativeFixed +
      medVaccine * dayFraction +
      transport * dayFraction;
    return { day, cost: Math.round(cumulativeCost), revenue: 0 };
  });
  if (dailyCurve.length > 0) {
    dailyCurve[cycleDays].revenue = grossRevenue;
  }

  const benchmarks = {
    fcr: { good: 1.6, ok: 1.8, label: "FCR" },
    marginPct: { good: 15, ok: 5, label: "Gross margin %" },
    mortalityPct: { good: 3, ok: 6, label: "Mortality %" },
    costPerKg: { good: 1100, ok: 1300, label: "Cost/kg produced" },
  };

  const healthFlags = {
    fcr: actualFCR <= benchmarks.fcr.good ? "good" : actualFCR <= benchmarks.fcr.ok ? "ok" : "risk",
    margin:
      grossMarginPct >= benchmarks.marginPct.good
        ? "good"
        : grossMarginPct >= benchmarks.marginPct.ok
          ? "ok"
          : "risk",
    mortality:
      mortalityPct <= benchmarks.mortalityPct.good
        ? "good"
        : mortalityPct <= benchmarks.mortalityPct.ok
          ? "ok"
          : "risk",
    costPerKg:
      costPerKgProduced <= benchmarks.costPerKg.good
        ? "good"
        : costPerKgProduced <= benchmarks.costPerKg.ok
          ? "ok"
          : "risk",
  } as BroilerModelResults["healthFlags"];

  return {
    chicksPlaced,
    birdsLost,
    birdsSold,
    mortalityRate,
    totalLiveKg,
    actualFeedKg,
    actualFCR,
    grossRevenue,
    chickCost,
    feedCost,
    mortalityCost,
    totalVariableCost,
    totalFixedCost,
    totalCost,
    grossProfit,
    grossMarginPct,
    profitPerBird,
    profitPerKg,
    costPerKgProduced,
    breakEvenPricePerKg,
    breakEvenKg,
    breakEvenBirds,
    marginToBreakEven,
    costBreakdown,
    waterfall,
    sensitivityGrid,
    scenarios,
    dailyCurve,
    healthFlags,
    benchmarks,
    inputs,
  };
}

export function fmtRWF(n: number | null | undefined): string {
  if (n === null || n === undefined || Number.isNaN(n)) return "—";
  const abs = Math.abs(n);
  const sign = n < 0 ? "-" : "";
  if (abs >= 1_000_000) return `${sign}${(abs / 1_000_000).toFixed(2)}M RWF`;
  if (abs >= 1_000) return `${sign}${Math.round(abs).toLocaleString()} RWF`;
  return `${sign}${Math.round(abs)} RWF`;
}

export function fmtNum(n: number | null | undefined, decimals = 0): string {
  if (n === null || n === undefined || Number.isNaN(n)) return "—";
  return Number(n).toLocaleString(undefined, {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}
