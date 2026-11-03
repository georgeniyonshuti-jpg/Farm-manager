import type { CommandSnapshot, CommandTile, PersonRow } from "./api";

function tile(partial: CommandTile): CommandTile {
  return partial;
}

const tiles: CommandTile[] = [
  tile({
    id: "sellers",
    label: "Sellers live",
    value: 5,
    n: 5,
    delta: "+2",
    context: "+2 not verified",
    target: 10,
    targetT2: null,
    spark: [1, 2, 2, 3, 4, 5],
    definitionId: "M-SELLER-ACTIVATED",
  }),
  tile({
    id: "buyers",
    label: "Buyers active",
    value: 2,
    n: 2,
    delta: "same",
    context: "First request",
    target: 8,
    targetT2: null,
    spark: [0, 1, 1, 2, 2, 2],
    definitionId: "M-BUYER-ACTIVATED",
  }),
  tile({
    id: "scouts",
    label: "Scouts producing",
    value: 0,
    n: 0,
    delta: "same",
    context: "Verified lot this week",
    target: 2,
    targetT2: null,
    spark: [1, 1, 0, 0, 0, 0],
    definitionId: "M-SCOUT-PRODUCING",
  }),
  tile({
    id: "probation",
    label: "Passed probation",
    value: 1,
    n: 1,
    delta: "+1",
    context: "sellers 1 · scouts 0",
    target: null,
    targetT2: null,
    spark: [0, 0, 0, 0, 1, 1],
    definitionId: "M-PROBATION",
    sellers: 1,
    scouts: 0,
  }),
];

export const DEMO_DEFS = [
  { id: "M-SELLER-ACTIVATED", label: "Sellers live", definition: "Verified sellers who went live this week." },
  { id: "M-BUYER-ACTIVATED", label: "Buyers active", definition: "Buyers with a first request this week." },
  { id: "M-SCOUT-PRODUCING", label: "Scouts producing", definition: "Scouts with at least one verified lot this week." },
  { id: "M-PROBATION", label: "Passed probation", definition: "Sellers paid within 21 days, or scouts with 8 verified lots within 21 days." },
];

export function demoSnapshot(kind: "demo" | "stale" | "unavailable" = "demo"): CommandSnapshot {
  const nextTiles = tiles.map((row) => ({ ...row }));
  if (kind === "unavailable") {
    const buyers = nextTiles[1];
    buyers.value = null;
    buyers.unavailable = true;
    buyers.delta = null;
    buyers.context = "Unavailable";
    buyers.spark = [];
  }
  return {
    view: "all",
    stale: kind === "stale",
    staleReason: kind === "stale" ? "timeout" : null,
    meta: {
      generatedAt: "2026-10-23T07:00:00.000Z",
      timezone: "Africa/Kigali",
      week: { from: "2026-10-19", to: "2026-10-25" },
      durationMs: 40,
      definitionsVersion: "demo",
      note: "Demo data",
      modules: { buyers: kind === "unavailable" ? "unavailable" : "ok", opens: "ok", targets: "default" },
      districts: ["Gasabo", "Kicukiro"],
      channels: ["facebook_ads", "unattributed"],
      channelCatalog: [
        { id: "facebook_ads", label: "Facebook ads" },
        { id: "unattributed", label: "Unattributed" },
      ],
    },
    headline: {
      text: "5 of 10 sellers are live. 11 people need a call today.",
      segments: [
        { text: "5 of 10", emphasis: true },
        { text: " sellers are live. 11 people need a call today.", emphasis: false },
      ],
    },
    command: {
      headline: {
        text: "5 of 10 sellers are live. 11 people need a call today.",
        segments: [
          { text: "5 of 10", emphasis: true },
          { text: " sellers are live. 11 people need a call today.", emphasis: false },
        ],
      },
      tiles: nextTiles,
      worklist: {
        total: 11,
        shown: 3,
        n: 11,
        rows: [
          {
            personId: "p1",
            role: "seller",
            roleLabel: "Seller",
            label: "Seller",
            district: "Gasabo",
            stage: "applied",
            stageLabel: "Applied",
            waitedDays: 9,
            text: "Seller · Gasabo · 9d at Applied",
            whatsappHref: null,
            openHref: "/farm/pipeline/people",
          },
          {
            personId: "p2",
            role: "seller",
            roleLabel: "Seller",
            label: "Seller",
            district: "Kicukiro",
            stage: "visited",
            stageLabel: "Visited",
            waitedDays: 6,
            text: "Seller · Kicukiro · 6d at Visited",
            whatsappHref: null,
            openHref: "/farm/pipeline/people",
          },
          {
            personId: "p3",
            role: "buyer",
            roleLabel: "Buyer",
            label: "Buyer",
            district: "Gasabo",
            stage: "requested",
            stageLabel: "Requested",
            waitedDays: 4,
            text: "Buyer · Gasabo · 4d at Requested",
            whatsappHref: null,
            openHref: "/farm/pipeline/people",
          },
        ],
      },
      pipeline: [
        { stage: "applied", label: "Applied", count: 11 },
        { stage: "live", label: "Live", count: 5 },
      ],
      waiting: [
        { stage: "applied", label: "Applied", count: 11, d0: 4, d3: 3, d6: 4 },
        { stage: "live", label: "Live", count: 5, d0: 5, d3: 0, d6: 0 },
      ],
      sources: [
        { channel: "facebook_ads", label: "Facebook ads", live: 3, of: 6, accounts: 6, opens: 20 },
        { channel: "unattributed", label: "Unattributed", live: 2, of: 5, accounts: 5, opens: null, pinned: true },
      ],
      supply: { available: false, reason: "Not tracked yet", liveBirds: null, demandBirds: null },
      leak: "5 of 11 who applied are live. 6 are not live yet. 4 are still in Applied, Contacted, or KYC. 2 are Unreachable or Not a fit.",
      channelCatalog: [
        { id: "facebook_ads", label: "Facebook ads" },
        { id: "unattributed", label: "Unattributed" },
      ],
    },
    funnels: {
      seller: {
        mode: "activity",
        windowDays: 7,
        entryN: 11,
        biggestLeak: { from: "applied", to: "live", drop: 6, eligible: true },
        steps: [
          { id: "applied", reach: 11, n: 11, ofPrev: null, medianDaysFromPrev: null, definitionId: "M-FUNNEL" },
          { id: "live", reach: 5, n: 11, ofPrev: 5 / 11, ofPrevDen: 11, medianDaysFromPrev: 4, definitionId: "M-FUNNEL" },
        ],
      },
    },
    channels: [
      {
        channel: "facebook_ads",
        label: "Facebook ads",
        opens: 20,
        accounts: 6,
        sellers: 4,
        activatedSellers: { x: 3, of: 6, rate: 0.5 },
        dead: { x: 1, of: 6 },
        medianDaysToActivate: { value: 4, n: 3 },
        spendRwf: 12000,
        costPerAccount: 2000,
        costPerActivation: 4000,
        quality: null,
        qualityLabel: null,
        n: 6,
        definitionId: "M-CHANNEL",
      },
      {
        channel: "referral",
        label: "Referral",
        opens: null,
        accounts: 2,
        sellers: 2,
        activatedSellers: { x: 1, of: 2, rate: 0.5 },
        dead: { tooEarly: true, x: 0, of: 2 },
        medianDaysToActivate: { value: null, n: 1 },
        spendRwf: null,
        costPerAccount: null,
        costPerActivation: null,
        quality: null,
        qualityLabel: null,
        lowSample: true,
        n: 2,
        definitionId: "M-CHANNEL",
      },
      {
        channel: "unattributed",
        label: "Unattributed",
        pinned: true,
        opens: null,
        accounts: 5,
        sellers: 3,
        activatedSellers: { x: 2, of: 5, rate: 0.4 },
        dead: { x: 1, of: 5 },
        medianDaysToActivate: { value: 6, n: 2 },
        spendRwf: null,
        costPerAccount: null,
        costPerActivation: null,
        quality: null,
        qualityLabel: null,
        n: 5,
        definitionId: "M-CHANNEL",
      },
    ],
    channelTotals: { accounts: 13, sellers: 9, activatedSellers: 6 },
    scouts: {
      rows: [
        {
          personId: "s1",
          label: "Scout",
          status: "ramping",
          statusLabel: "Ramping",
          tenureDays: 10,
          lots: 2,
          sellers: 1,
          birds: 40,
          unpaidRwf: 0,
          n: 1,
          definitionId: "M-SCOUT",
          district: "Gasabo",
          buyers: 1,
          lotTarget: 8,
          lastActivityAt: "2026-10-22T10:00:00.000Z",
        },
        {
          personId: "s2",
          label: "Scout",
          status: "needs_support",
          statusLabel: "Needs support",
          tenureDays: 40,
          lots: 0,
          sellers: 0,
          birds: 0,
          unpaidRwf: 15000,
          n: 1,
          definitionId: "M-SCOUT",
          district: "Kicukiro",
          buyers: 0,
          lotTarget: 8,
          lastActivityAt: "2026-10-01T10:00:00.000Z",
        },
      ],
      totals: { lots: 2, sellers: 1, birds: 40, unpaidRwf: 15000 },
      byDistrict: [
        { district: "Gasabo", scouts: 1, lots: 2 },
        { district: "Kicukiro", scouts: 1, lots: 0 },
      ],
    },
    briefing: {
      whatsappText: "5 of 10 sellers are live. 11 people need a call today.",
    },
    quality: {
      confidence: "demo",
      checks: [],
      freshnessMinutes: 1,
      reconciliation: { ok: true, failures: [] },
    },
  };
}

export const DEMO_PEOPLE: PersonRow[] = [
  {
    personId: "p1",
    role: "seller",
    label: "Seller",
    district: "Gasabo",
    stage: "Applied",
    phone: "07X XXX X111",
    phoneMasked: true,
    channel: "Facebook ads",
    createdAt: "2026-10-14T08:00:00.000Z",
  },
  {
    personId: "p2",
    role: "seller",
    label: "Seller",
    district: "Kicukiro",
    stage: "Visited",
    phone: "07X XXX X222",
    phoneMasked: true,
    channel: "Unattributed",
    createdAt: "2026-10-16T08:00:00.000Z",
  },
];
