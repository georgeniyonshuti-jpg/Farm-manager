import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildSnapshot,
  DEFINITIONS_VERSION,
  definition,
  channelTable,
  cohortFunnel,
  commandHeadline,
  deadRate,
  deadStatus,
  deltaText,
  doToday,
  headline,
  kigaliWeek,
  leakSentence,
  maskPhone,
  median,
  normaliseChannel,
  pace,
  passedProbation,
  peopleForMetric,
  periodChange,
  previousRange,
  publishSnapshot,
  publicPerson,
  quantile,
  queryFailure,
  reconcile,
  rememberSnapshot,
  resolveTarget,
  resolveTargets,
  safeRate,
  scoutsProducing,
  sliceForOfficer,
  statedBlock,
  scoutStatus,
  stuckPeople,
  tileContext,
  timeSummary,
  visibleToSalesOfficer,
  weeklyNotes,
  whatsAppSummary,
  wilson,
  wordCount,
  xmr,
} from "../src/services/recruitmentAnalytics/index.js";
import { timedQuery } from "../src/services/recruitmentAnalytics/query.js";

const NOW = new Date("2026-10-22T10:00:00Z");

function person(overrides) {
  return {
    personId: "p1",
    role: "seller",
    createdAt: "2026-10-20T08:00:00Z",
    firstTouchChannel: "facebook",
    applicationSubmittedAt: "2026-10-20T08:00:00Z",
    contactedAt: null,
    kycVerifiedAt: null,
    activatedAt: null,
    productiveAt: null,
    lastActivityAt: "2026-10-20T08:00:00Z",
    district: "Gasabo",
    isInternal: false,
    isSynthetic: false,
    label: "Seller A",
    phone: "+250788000001",
    ...overrides,
  };
}

describe("wilson, rates, pace, quantiles", () => {
  it("gives a small upper bound when nobody converts", () => {
    const band = wilson(0, 40);
    assert.ok(band);
    assert.ok(band.high > 0.07 && band.high < 0.11);
    assert.equal(band.low, 0);
  });

  it("returns null when n is zero or the rate is impossible", () => {
    assert.equal(wilson(0, 0), null);
    assert.equal(wilson(3, 2), null);
    assert.equal(safeRate(11, 1).reason, "invariant-violation");
    assert.equal(safeRate(1, 0).reason, "no-denominator");
  });

  it("hides a percent when the previous value is under 5", () => {
    const change = periodChange(2, 0);
    assert.equal(change.abs, 2);
    assert.equal(change.pct, null);
    assert.equal(change.direction, "up");
  });

  it("places pace around a target of 10", () => {
    assert.equal(pace(0, 10, 1 / 7), "on_track");
    assert.equal(pace(2, 10, 4 / 7), "behind");
    assert.equal(pace(0, 10, 1), "behind");
    assert.equal(pace(10, 10, 1), "on_track");
    assert.equal(pace(12, 10, 1), "ahead");
  });

  it("handles empty and single quantiles, and refuses XmR before 8 points", () => {
    assert.equal(quantile([], 0.5), null);
    assert.equal(median([4]), 4);
    assert.equal(xmr([1, 2, 3, 4, 5, 6, 7]), null);
    assert.ok(xmr([1, 2, 3, 4, 5, 6, 7, 8]));
  });

  it("does not publish a negative duration", () => {
    const summary = timeSummary([3, -2, 4, 5, 6, 7]);
    assert.ok(summary.value >= 0);
    assert.equal(summary.excludedNegatives, 1);
    const few = timeSummary([1, -4]);
    assert.equal(few.value, null);
    assert.deepEqual(few.individuals, [1]);
  });
});

describe("Kigali weeks", () => {
  it("starts the week on Monday and keeps the previous window the same length", () => {
    const week = kigaliWeek(NOW);
    assert.equal(week.from, "2026-10-19");
    assert.equal(week.to, "2026-10-25");
    assert.ok(Math.abs(week.elapsedFraction - 0.5) < 0.02);
    const prev = previousRange("2026-10-16", "2026-10-22");
    assert.equal(prev.from, "2026-10-09");
    assert.equal(prev.to, "2026-10-15");
  });
});

describe("funnel, stuck, dead, channels", () => {
  it("imputes a missing earlier step so the funnel cannot exceed 100%", () => {
    const rows = [
      person({
        personId: "a",
        activatedAt: "2026-10-21T08:00:00Z",
        kycVerifiedAt: null,
        contactedAt: null,
      }),
      person({ personId: "b", createdAt: "2026-10-18T08:00:00Z", applicationSubmittedAt: "2026-10-18T08:00:00Z" }),
    ];
    const funnel = cohortFunnel(rows, { role: "seller", from: "2026-10-16", to: "2026-10-22", windowDays: 14 });
    const reaches = funnel.steps.map((s) => s.reach);
    for (let i = 1; i < reaches.length; i += 1) assert.ok(reaches[i] <= reaches[i - 1]);
    assert.equal(funnel.imputedCount, 1);
    assert.ok(funnel.steps.every((s) => s.ofPrev == null || s.ofPrev <= 1));
  });

  it("ignores an activation outside the 14-day window", () => {
    const funnel = cohortFunnel(
      [person({ createdAt: "2026-10-01T08:00:00Z", applicationSubmittedAt: "2026-10-01T08:00:00Z", activatedAt: "2026-10-20T08:00:00Z" })],
      { role: "seller", from: "2026-10-01", to: "2026-10-07", windowDays: 14 }
    );
    const activated = funnel.steps.find((s) => s.id === "activated");
    assert.equal(activated.reach, 0);
    assert.equal(funnel.entryN, 1);
  });

  it("marks a young cohort too early instead of 0% dead", () => {
    const young = person({ createdAt: NOW.toISOString(), lastActivityAt: NOW.toISOString() });
    assert.equal(deadStatus(young, NOW).tooEarly, true);
    const rate = deadRate([young], NOW);
    assert.equal(rate.tooEarly, true);
    assert.equal(rate.rate, null);
  });

  it("counts someone stuck at Applied after 2 days", () => {
    const rows = [person({ createdAt: "2026-10-18T08:00:00Z", lastActivityAt: "2026-10-18T08:00:00Z" })];
    const stuck = stuckPeople(rows, NOW);
    assert.equal(stuck.length, 1);
    assert.equal(stuck[0].stage, "applied");
  });

  it("shows n/a opens for WhatsApp and pins Unattributed", () => {
    const rows = [
      person({ personId: "w", firstTouchChannel: "whatsapp" }),
      person({ personId: "u", firstTouchChannel: "unknown", createdAt: "2026-10-19T08:00:00Z" }),
    ];
    const table = channelTable(rows, { from: "2026-10-16", to: "2026-10-22", now: NOW });
    const wa = table.rows.find((r) => r.channel === "whatsapp_direct_share");
    assert.equal(wa.opens, null);
    assert.equal(wa.accounts, 1);
    const un = table.rows.find((r) => r.channel === "unattributed");
    assert.equal(un.pinned, true);
    assert.equal(table.totals.accounts, rows.length);
    assert.equal(normaliseChannel("unknown"), "unattributed");
  });

  it("keeps random cohorts monotonic", () => {
    for (let seed = 1; seed <= 20; seed += 1) {
      const rows = [];
      for (let i = 0; i < 15; i += 1) {
        const step = (seed * (i + 3)) % 5;
        rows.push(
          person({
            personId: `s${seed}-${i}`,
            createdAt: "2026-10-20T08:00:00Z",
            applicationSubmittedAt: step >= 1 ? "2026-10-20T09:00:00Z" : null,
            contactedAt: step >= 2 ? "2026-10-21T09:00:00Z" : null,
            kycVerifiedAt: step >= 3 ? "2026-10-21T12:00:00Z" : null,
            activatedAt: step >= 4 ? "2026-10-22T08:00:00Z" : null,
            firstTouchChannel: i % 2 ? "facebook" : null,
          })
        );
      }
      const funnel = cohortFunnel(rows, { role: "seller", from: "2026-10-16", to: "2026-10-22" });
      assert.equal(funnel.monotonic, true);
      const table = channelTable(rows, { from: "2026-10-16", to: "2026-10-22", now: NOW });
      assert.equal(table.totals.accounts, rows.length);
    }
  });
});

describe("scouts and targets", () => {
  it("calls a new scout Ramping", () => {
    const status = scoutStatus(
      { approvedAt: "2026-10-20T08:00:00Z", lastActivityAt: "2026-10-21T08:00:00Z", weeks: [] },
      NOW
    );
    assert.equal(status, "ramping");
  });

  it("keeps an older week's target when a new target is saved", () => {
    const rows = [
      { id: "t1", metric: "sellers_activated_per_week", effectiveFrom: "2026-10-01", value: 10 },
      { id: "t2", metric: "sellers_activated_per_week", effectiveFrom: "2026-10-19", value: 20 },
    ];
    assert.equal(resolveTarget(rows, "sellers_activated_per_week", "2026-10-12").value, 10);
    assert.equal(resolveTarget(rows, "sellers_activated_per_week", "2026-10-19").value, 20);
  });
});

describe("stated call answers", () => {
  const rows = [
    { want: "sell", district: "Gasabo", flockSize: 80, readyInWeeks: 0, canSlaughter: true, canDeliver: false },
    { want: "sell", district: "Gasabo", flockSize: 0, readyInWeeks: 1, canSlaughter: false, canDeliver: null },
    { want: "sell", district: "Gasabo", flockSize: null, readyInWeeks: 0, canSlaughter: null, canDeliver: true },
    { want: "sell", district: "Musanze", flockSize: 1200, readyInWeeks: 1, canSlaughter: false, canDeliver: true },
    { want: "sell", district: "Musanze", flockSize: 500, readyInWeeks: null, canSlaughter: true, canDeliver: true },
    { want: "buy", district: "Gasabo", quantityMin: 200, buyerFor: "butcher", birdForm: "slaughtered" },
    { want: "buy", district: "Gasabo", quantityMin: 40, buyerFor: null, birdForm: null },
    { want: "buy", district: "Musanze", quantityMin: 100, buyerFor: "hotel", birdForm: "alive" },
    { want: "buy", district: "Gasabo", quantityMin: null, buyerFor: "vendor", birdForm: "either" },
    { want: "scout", district: "Gasabo", willVisit: true, farmsKnown: 6 },
    { want: "scout", district: "Gasabo", willVisit: false, farmsKnown: null },
    { want: "scout", district: "Musanze", willVisit: null, farmsKnown: 3 },
  ];

  it("sums flock sizes and leaves a blank answer out of n", () => {
    const block = statedBlock(rows);
    assert.equal(block.available, true);
    assert.equal(block.mode, "point-in-time");
    assert.equal(block.sellers.n, 4);
    assert.equal(block.sellers.flockBirds, 1780);
    assert.equal(block.sellers.definitionId, "M-STATED-FLOCK");
    assert.deepEqual(
      block.sellers.buckets.map((bucket) => [bucket.id, bucket.n, bucket.birds]),
      [
        ["1-99", 1, 80],
        ["100-499", 0, 0],
        ["500-999", 1, 500],
        ["1000+", 1, 1200],
      ]
    );
    assert.equal(block.sellers.ready.n, 3);
    assert.equal(block.sellers.ready.birds, 1280);
    assert.equal(block.sellers.ready.definitionId, "M-STATED-READY");
    assert.deepEqual(block.sellers.canSlaughter, { x: 2, of: 4, definitionId: "M-STATED-SLAUGHTER" });
    assert.deepEqual(block.sellers.canDeliver, { x: 3, of: 4, definitionId: "M-STATED-DELIVER" });
    assert.equal(definition("M-STATED-FLOCK")?.id, "M-STATED-FLOCK");
    assert.notEqual(DEFINITIONS_VERSION, "2026-10-22.1");
  });

  it("sums the weekly floor and does not invent a buyer type", () => {
    const block = statedBlock(rows);
    assert.equal(block.buyers.n, 3);
    assert.equal(block.buyers.weeklyFloor, 340);
    assert.equal(block.buyers.definitionId, "M-STATED-BUYER-WEEK");
    assert.deepEqual(
      block.buyers.byType.map((row) => [row.id, row.n, row.birds]),
      [
        ["butcher", 1, 200],
        ["hotel", 1, 100],
      ]
    );
    assert.equal(block.buyers.missingType.n, 1);
    assert.equal(block.buyers.missingType.birds, 40);
    assert.equal(block.buyers.byType.some((row) => row.id === "unattributed"), false);
    assert.deepEqual(
      block.buyers.byForm.map((row) => [row.id, row.n, row.birds]),
      [
        ["slaughtered", 1, 200],
        ["alive", 1, 100],
      ]
    );
    assert.equal(block.buyers.missingForm.n, 1);
    assert.equal(block.scouts.n, 2);
    assert.equal(block.scouts.willVisit, 1);
    assert.equal(block.scouts.definitionId, "M-STATED-VISIT");
    assert.equal(block.scouts.farms.n, 2);
    assert.equal(block.scouts.farms.sum, 9);
    assert.equal(block.scouts.farms.definitionId, "M-STATED-FARMS");
  });

  it("speaks only when both sides in a district answered", () => {
    const block = statedBlock(rows);
    assert.equal(block.sentences.slaughter.district, "Gasabo");
    assert.equal(block.sentences.slaughter.buyers, 1);
    assert.ok(block.sentences.slaughter.sellersCannot >= 1);
    assert.equal(block.sentences.balance.district, "Musanze");
    assert.match(block.sentences.balance.rule, /1\.5/);
    const gasabo = statedBlock(rows, { districts: ["Gasabo"] });
    assert.equal(gasabo.sellers.flockBirds, 80);
    assert.equal(gasabo.buyers.weeklyFloor, 240);
    assert.equal(statedBlock(rows, { role: "seller" }).buyers.n, 0);
    assert.equal(statedBlock(rows, { role: "seller" }).sentences.balance, null);
    const missing = statedBlock({ available: false, reason: "Interview facts are not installed yet. Apply migration 089, then reload." });
    assert.equal(missing.available, false);
    assert.match(missing.reason, /089/);
    assert.equal(missing.sellers, undefined);
    const empty = statedBlock([]);
    assert.equal(empty.available, true);
    assert.equal(empty.sellers.n, 0);
    assert.equal(empty.buyers.n, 0);
    assert.equal(empty.scouts.n, 0);
    assert.equal(empty.sentences.slaughter, null);
    assert.equal(empty.sentences.balance, null);
  });

  it("keeps live listed birds separate from what people said on the call", () => {
    const snapshot = buildSnapshot([], {
      now: NOW,
      from: "2026-10-22",
      to: "2026-10-22",
      supplyDemand: { available: true, liveBirds: 12, demandBirds: 4, byDistrict: [] },
      stated: { available: true, rows },
    });
    assert.equal(snapshot.supplyDemand.liveBirds, 12);
    assert.equal(snapshot.stated.mode, "point-in-time");
    assert.equal(snapshot.stated.sellers.flockBirds, 1780);
    const unloaded = buildSnapshot([], { now: NOW });
    assert.equal(unloaded.stated.available, false);
    assert.equal(unloaded.stated.sellers, undefined);
  });
});

describe("snapshot contract", () => {
  it("reconciles and keeps the click-through list the same length as the count", () => {
    const rows = [
      person({ personId: "live", activatedAt: "2026-10-21T08:00:00Z", kycVerifiedAt: "2026-10-20T10:00:00Z" }),
      person({ personId: "wait", createdAt: "2026-10-18T08:00:00Z" }),
      person({ personId: "staff", isInternal: true, activatedAt: "2026-10-21T08:00:00Z" }),
    ];
    const snapshot = buildSnapshot(rows, { now: NOW, from: "2026-10-16", to: "2026-10-22", targets: [
      { id: "t-week", metric: "sellers_activated_per_week", effectiveFrom: "2026-10-01", value: 10, scope: "team" },
      { id: "t-buy", metric: "buyers_activated_per_week", effectiveFrom: "2026-10-01", value: 8, scope: "team" },
      { id: "t-sc", metric: "scouts_activated_per_week", effectiveFrom: "2026-10-01", value: 2, scope: "team" },
    ], trackedLinksThisWeek: true, spend: [{ date: "2026-10-20", channel: "facebook_ads", amountRwf: 1000 }] });
    const check = reconcile(snapshot);
    assert.deepEqual(check.failures, []);
    assert.equal(snapshot.kpis.sellersActivated.value, 1);
    assert.equal(peopleForMetric(snapshot, "sellersActivated").length, snapshot.kpis.sellersActivated.value);
    assert.equal(snapshot.kpis.sellersActivated.definitionId, "M-SELLER-ACTIVATED");
    assert.equal(snapshot.kpis.sellersActivated.n, 1);
    assert.ok(snapshot.meta.generatedAt);
    assert.equal(snapshot.headline.segments.some((s) => s.emphasis), true);
    const text = whatsAppSummary(snapshot.briefing.whatsappText);
    assert.ok(text.length <= 1200);
    assert.equal(/\+2507\d{8}/.test(text), false);
  });

  it("masks a phone", () => {
    assert.equal(maskPhone("+250788123412"), "+250 78•• ••• 12");
  });

  it("builds a headline without inventing a target", () => {
    const line = headline({
      sellers: 0,
      sellerTarget: 10,
      sellerPace: "behind",
      scouts: 0,
      scoutTarget: 2,
      scoutPace: "behind",
      buyers: 0,
      buyerTarget: null,
      waitingContact: 3,
    });
    assert.match(line.text, /No activations yet/);
    assert.match(line.text, /3/);
  });
});

const WEEK_TARGETS = [
  { id: "t-week", metric: "sellers_activated_per_week", effectiveFrom: "2026-10-01", value: 10, scope: "team", tier: "t1" },
  { id: "t-buy", metric: "buyers_activated_per_week", effectiveFrom: "2026-10-01", value: 8, scope: "team", tier: "t1" },
  { id: "t-sc", metric: "scouts_activated_per_week", effectiveFrom: "2026-10-01", value: 2, scope: "team", tier: "t1" },
];

describe("command centre", () => {
  it("says who is live and who is still moving", () => {
    const people = [
      person({ personId: "live", activatedAt: "2026-10-21T08:00:00Z" }),
      person({ personId: "waiting" }),
      person({ personId: "closed", stageOverride: "not_a_fit" }),
    ];
    const line = leakSentence(
      {
        seller: {
          entryN: 3,
          steps: [
            { id: "application", reach: 3, personIds: ["live", "waiting", "closed"] },
            { id: "activated", reach: 1, personIds: ["live"] },
          ],
        },
      },
      people,
      NOW
    );
    assert.equal(
      line,
      "1 of 3 who applied are live. 2 are not live yet. 1 is still in Applied, Contacted, or KYC. 1 is Unreachable or Not a fit."
    );
  });

  it("keeps T1 and T2 apart", () => {
    const rows = [
      { id: "a", metric: "sellers_activated_per_week", effectiveFrom: "2026-01-01", value: 10, tier: "t1" },
      { id: "b", metric: "sellers_activated_per_week", effectiveFrom: "2026-01-01", value: 16, tier: "t2" },
      { id: "c", metric: "sellers_activated_per_week", effectiveFrom: "2026-10-01", value: 12, tier: "t1" },
    ];
    const got = resolveTargets(rows, "sellers_activated_per_week", "2026-10-19");
    assert.equal(got.t1.value, 12);
    assert.equal(got.t2.value, 16);
    assert.equal(deltaText(periodChange(3, 1)), "+2");
  });

  it("counts scouts producing this week separately from first activation", () => {
    const rows = [
      person({
        personId: "prod",
        role: "scout",
        approvedAt: "2026-09-01T08:00:00Z",
        activatedAt: "2026-09-02T08:00:00Z",
        lotEvents: [{ at: "2026-10-21T08:00:00Z", verified: true, birds: 10 }],
      }),
      person({
        personId: "new",
        role: "scout",
        approvedAt: "2026-10-20T08:00:00Z",
        activatedAt: "2026-10-21T08:00:00Z",
        lotEvents: [],
      }),
    ];
    assert.equal(scoutsProducing(rows, "2026-10-19", "2026-10-25").length, 1);
    const snapshot = buildSnapshot(rows, { now: NOW, targets: WEEK_TARGETS });
    assert.equal(snapshot.kpis.scoutsActivated.value, 1);
    assert.equal(snapshot.kpis.scoutsProducing.value, 1);
    assert.deepEqual(snapshot.kpis.scoutsProducing.personIds, ["prod"]);
    assert.equal(peopleForMetric(snapshot, "scoutsProducing").length, snapshot.kpis.scoutsProducing.value);
  });

  it("counts probation over three weeks and drops a late or early pass", () => {
    const lots = Array.from({ length: 8 }, () => ({ at: "2026-10-20T08:00:00Z", verified: true, birds: 1 }));
    const rows = [
      person({ personId: "paid", activatedAt: "2026-10-10T08:00:00Z", productiveAt: "2026-10-20T08:00:00Z" }),
      person({ personId: "slow", activatedAt: "2026-09-01T08:00:00Z", productiveAt: "2026-10-20T08:00:00Z" }),
      person({ personId: "old", activatedAt: "2026-08-01T08:00:00Z", productiveAt: "2026-08-10T08:00:00Z" }),
      person({ personId: "early", activatedAt: "2026-10-21T08:00:00Z", productiveAt: "2026-10-10T08:00:00Z" }),
      person({ personId: "scout-pass", role: "scout", approvedAt: "2026-10-06T08:00:00Z", lotEvents: lots }),
      person({
        personId: "scout-short",
        role: "scout",
        approvedAt: "2026-10-06T08:00:00Z",
        lotEvents: lots.slice(0, 7),
      }),
    ];
    const passed = passedProbation(rows, NOW);
    assert.deepEqual(passed.people.map((p) => p.personId).sort(), ["paid", "scout-pass"]);
    const snapshot = buildSnapshot(rows, { now: NOW, targets: WEEK_TARGETS });
    assert.equal(snapshot.kpis.passedProbation.value, 2);
    assert.equal(peopleForMetric(snapshot, "passedProbation").length, 2);
    assert.equal(snapshot.kpis.sellersActivated.value, 1);
  });

  it("lists the five most overdue people and keeps the phone out of the text", () => {
    const people = Array.from({ length: 6 }, (_, i) =>
      person({ personId: `w${i}`, createdAt: "2026-10-01T08:00:00Z", phone: "+250788000001", label: "Amina" })
    );
    const list = doToday(people, NOW, { includeContact: true, includeNames: true });
    assert.equal(list.total, 6);
    assert.equal(list.rows.length, 5);
    assert.equal(list.rows.some((row) => row.text.includes("788000001")), false);
    assert.equal(list.rows.some((row) => String(row.label).includes("788")), false);
    assert.match(list.rows[0].whatsappHref, /^https:\/\/wa\.me\/250788000001$/);
    const hidden = doToday(people, NOW, { includeContact: false });
    assert.equal(hidden.rows[0].whatsappHref, null);
  });

  it("keeps the headline and tile context inside the text budget", () => {
    const line = commandHeadline({ sellers: 5, sellerTarget: 10, waiting: 11, passed: 1 });
    assert.ok(wordCount(line.text) <= 20, line.text);
    for (const id of ["sellers", "buyers", "scouts", "probation"]) {
      const text = tileContext(id, {
        unverified: 2,
        buyerTarget: 8,
        scoutTarget: 2,
        passedSellers: 1,
        passedScouts: 0,
      });
      assert.ok(wordCount(text) <= 6, text);
    }
    assert.equal(tileContext("buyers", { buyersUnavailable: true }), "Unavailable");
    assert.equal(tileContext("scouts", { scoutTarget: null }), "Set target");
    const snapshot = buildSnapshot(
      [person({ personId: "live", activatedAt: "2026-10-21T08:00:00Z" })],
      { now: NOW, from: "2026-09-01", to: "2026-10-22", targets: WEEK_TARGETS }
    );
    assert.ok(wordCount(snapshot.command.headline.text) <= 20);
    assert.equal(snapshot.command.tiles.length, 4);
    for (const tile of snapshot.command.tiles) {
      assert.ok(wordCount(tile.label) <= 3, tile.label);
      assert.ok(wordCount(tile.context) <= 6, tile.context);
    }
    const tiered = buildSnapshot([person({ personId: "live", activatedAt: "2026-10-21T08:00:00Z" })], {
      now: NOW,
      targets: [...WEEK_TARGETS, { id: "t2", metric: "sellers_activated_per_week", effectiveFrom: "2026-10-01", value: 16, tier: "t2" }],
    });
    assert.equal(tiered.command.tiles.find((tile) => tile.id === "sellers").target, 10);
    assert.equal(tiered.command.tiles.find((tile) => tile.id === "sellers").targetT2, 16);
  });

  it("never lets a funnel step exceed the one before it", () => {
    const funnel = cohortFunnel(
      [person({ personId: "a", activatedAt: "2026-10-21T08:00:00Z" }), person({ personId: "b" })],
      { role: "seller", from: "2026-10-01", to: "2026-10-22" }
    );
    for (const step of funnel.steps) {
      if (step.ofPrev != null) assert.ok(step.ofPrev <= 1);
    }
    assert.equal(funnel.monotonic, true);
  });

  it("drops person id lists from the response and keeps the previous numbers when a refresh fails", () => {
    const snapshot = buildSnapshot(
      [person({ personId: "live", activatedAt: "2026-10-21T08:00:00Z" })],
      { now: NOW, targets: WEEK_TARGETS }
    );
    assert.equal(peopleForMetric(snapshot, "sellersActivated").length, snapshot.kpis.sellersActivated.value);
    const pub = publishSnapshot(snapshot);
    assert.equal(JSON.stringify(pub).includes("personIds"), false);
    const store = new Map();
    const first = rememberSnapshot(store, "k", { ok: true, snapshot: pub });
    assert.equal(first.stale, false);
    const second = rememberSnapshot(store, "k", { ok: false, error: "timeout" });
    assert.equal(second.stale, true);
    assert.equal(second.snapshot.command.tiles[0].value, first.snapshot.command.tiles[0].value);
    assert.match(second.snapshot.staleReason, /timeout/);
  });

  it("refuses a phone number in the weekly notes and caps each group at 3 bullets", () => {
    assert.equal(weeklyNotes({ goingWell: ["a", "b", "c", "d"] }).ok, false);
    assert.equal(weeklyNotes({ supportNeeded: ["call +250788123456"] }).ok, false);
    const ok = weeklyNotes({ goingWell: ["Calls are landing"], notGoingWell: ["KYC is slow"], supportNeeded: ["Need a bike"] });
    assert.equal(ok.ok, true);
    assert.equal(ok.notes.goingWell.length, 1);
  });

  it("treats a statement timeout as a failed module, not as zero", () => {
    assert.equal(queryFailure({ code: "57014" }), "timeout");
    assert.equal(queryFailure({ code: "42P01" }), "missing");
  });

  it("runs a query inside a timeout transaction", async () => {
    const calls = [];
    const client = {
      query: async (sql) => {
        calls.push(sql);
        if (sql === "SELECT 1") return { rows: [{ ok: 1 }] };
        return { rows: [] };
      },
      release() {
        calls.push("release");
      },
    };
    const result = await timedQuery(async () => client, "SELECT 1", [], 3000);
    assert.equal(result.rows[0].ok, 1);
    assert.match(calls[1], /statement_timeout/);
    assert.equal(calls[2], "SELECT 1");
    assert.equal(calls[3], "COMMIT");
    assert.equal(calls[4], "release");
  });

  it("builds the command numbers in under two seconds", () => {
    const rows = Array.from({ length: 40 }, (_, i) =>
      person({ personId: `n${i}`, createdAt: "2026-10-10T08:00:00Z", activatedAt: i < 3 ? "2026-10-21T08:00:00Z" : null })
    );
    const started = Date.now();
    const snapshot = buildSnapshot(rows, { now: NOW, targets: WEEK_TARGETS });
    assert.ok(Date.now() - started < 2000);
    assert.equal(reconcile(snapshot).ok, true);
    const officerCopy = sliceForOfficer(snapshot);
    assert.equal(officerCopy.view, "officer");
    assert.equal(officerCopy.scouts, undefined);
    assert.equal(officerCopy.briefing, undefined);
    assert.equal(officerCopy.channels, undefined);
    assert.ok(officerCopy.funnels);
    assert.equal(visibleToSalesOfficer(publicPerson(rows[0])), false);
    assert.equal(visibleToSalesOfficer(publicPerson(rows[10])), true);
  });
});
