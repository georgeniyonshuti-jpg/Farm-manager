/**
 * One snapshot for every tab. Widgets must not count on their own.
 */

import { DEFINITIONS_VERSION } from "./definitions.js";
import { channelTable } from "./channels.js";
import { cohortFunnel, deriveStage } from "./funnel.js";
import { headline as buildHeadline, whatsAppSummary } from "./headline.js";
import { supplyDemandBlock } from "./liquidity.js";
import { statedBlock } from "./stated.js";
import { recommendedActions } from "./actions.js";
import { maskPhone } from "./phone.js";
import { DEFAULT_SCOUT_TARGETS, scoutStatus, STATUS_LABEL } from "./scouts.js";
import { deadRate, stuckPeople } from "./stuck.js";
import { pace, periodChange } from "./stats.js";
import { DEFAULT_TARGETS, resolveTarget } from "./targets.js";
import { daysBetween, inRange, kigaliWeek, previousRange } from "./time.js";
import { trendBlock } from "./trends.js";
import { normaliseChannel, CHANNELS, channelLabel } from "./channels.js";
import { buildCommand, scoutDistricts } from "./command.js";

function visible(people) {
  return (people || []).filter((p) => !p.isInternal && !p.isSynthetic);
}

function applyFilters(people, filters) {
  return visible(people).filter((p) => {
    if (filters.role && filters.role !== "all" && p.role !== filters.role) return false;
    if (filters.channels?.length && !filters.channels.includes(normaliseChannel(p.firstTouchChannel))) return false;
    if (filters.districts?.length && !filters.districts.includes(p.district || "District unknown")) return false;
    return true;
  });
}

function countActivity(people, role, field, from, to) {
  return people.filter((p) => p.role === role && p[field] && inRange(p[field], from, to));
}

function kpi(definitionId, mode, people, extra) {
  return {
    definitionId,
    mode,
    value: people.length,
    n: people.length,
    personIds: people.map((p) => p.personId),
    ...extra,
  };
}

function pipeline(people, role, now) {
  const buckets = new Map();
  for (const person of people.filter((p) => p.role === role)) {
    const stage = deriveStage(person, now);
    if (!buckets.has(stage.stage)) buckets.set(stage.stage, []);
    buckets.get(stage.stage).push(person.personId);
  }
  return [...buckets.entries()].map(([stage, ids]) => ({
    stage,
    count: ids.length,
    n: ids.length,
    personIds: ids,
    definitionId: "M-STUCK",
  }));
}

function qualityFrom(facts, channels, funnels, freshnessMinutes, extras) {
  const cohort = facts;
  const accounts = cohort.length;
  const unattributed = cohort.filter((p) => normaliseChannel(p.firstTouchChannel) === "unattributed").length;
  const share = accounts ? unattributed / accounts : 0;
  const negatives = (funnels.seller?.negativeCount || 0) + (funnels.buyer?.negativeCount || 0) + (funnels.scout?.negativeCount || 0);
  const imputed = (funnels.seller?.imputedCount || 0) + (funnels.buyer?.imputedCount || 0) + (funnels.scout?.imputedCount || 0);
  const assistedEarly = facts.filter((p) => p.assisted && p.activatedAt && daysBetween(p.createdAt, p.activatedAt) < 0).length;
  const unknownDistrict = facts.filter((p) => (p.district || "District unknown") === "District unknown").length;
  const stageBad = facts.filter((p) => p.activatedAt && ["applied", "contacted"].includes(p.rawStage)).length;
  const checks = [
    { id: "DQ-1", label: "Unattributed accounts", count: unattributed, severity: share > 0.4 ? "bad" : share > 0.2 ? "warn" : "ok" },
    { id: "DQ-2", label: "Negative durations excluded", count: negatives, severity: negatives > 0 ? "bad" : "ok" },
    { id: "DQ-3", label: "Imputed earlier steps", count: imputed, severity: imputed > 0 ? "warn" : "ok" },
    { id: "DQ-4", label: "Listings created before the account", count: assistedEarly, severity: assistedEarly > 0 ? "warn" : "ok" },
    { id: "DQ-5", label: "District unknown", count: unknownDistrict, severity: accounts && unknownDistrict / accounts > 0.1 ? "warn" : "ok" },
    { id: "DQ-6", label: "Duplicate phones folded into one person", count: extras.duplicatePhones || 0, severity: extras.duplicatePhones ? "warn" : "ok" },
    { id: "DQ-7", label: "Stored stage disagrees with a live listing", count: stageBad, severity: stageBad > 0 ? "bad" : "ok" },
    { id: "DQ-8", label: "Internal or test people excluded", count: extras.excludedInternal || 0, severity: "ok" },
    { id: "DQ-9", label: "Minutes since the newest activity", count: freshnessMinutes, severity: freshnessMinutes > 60 ? "warn" : "ok" },
    { id: "DQ-11", label: "Opens without a visitor id", count: extras.opensWithoutVisitor || 0, severity: "info" },
    { id: "DQ-12", label: "Targets still on the recorded default", count: extras.targetsFromDefault ? 1 : 0, severity: extras.targetsFromDefault ? "warn" : "ok" },
  ];
  return { checks, unattributed, negatives };
}

function confidenceOf(checks, failures) {
  if (failures.length) return "low";
  const bad = checks.some((c) => c.severity === "bad");
  if (bad) return "low";
  const warns = checks.filter((c) => c.severity === "warn").length;
  if (warns > 1) return "medium";
  return "high";
}

export function buildSnapshot(people, options = {}) {
  const now = options.now ? new Date(options.now) : new Date();
  const week = kigaliWeek(now);
  const from = options.from || week.from;
  const to = options.to || week.to;
  const prev = previousRange(from, to);
  const filters = {
    role: options.role || "all",
    channels: options.channels || [],
    districts: options.districts || [],
  };
  const facts = applyFilters(people, filters).map((p) => ({
    ...p,
    district: p.district || "District unknown",
    firstTouchChannel: normaliseChannel(p.firstTouchChannel),
  }));
  const windowDays = options.windowDays ?? 14;
  const targetRows = options.targets?.length ? options.targets : DEFAULT_TARGETS;
  const targetsFromDefault = !options.targets?.length;
  const sellerTarget = resolveTarget(targetRows, "sellers_activated_per_week", week.from);
  const buyerTarget = resolveTarget(targetRows, "buyers_activated_per_week", week.from);
  const scoutTarget = resolveTarget(targetRows, "scouts_activated_per_week", week.from);

  const sellersNow = countActivity(facts, "seller", "activatedAt", week.from, week.to);
  const sellersPrev = countActivity(facts, "seller", "activatedAt", previousRange(week.from, week.to).from, previousRange(week.from, week.to).to);
  const unverifiedNow = countActivity(facts, "seller", "liveUnverifiedAt", week.from, week.to);
  const buyersNow = countActivity(facts, "buyer", "activatedAt", week.from, week.to);
  const scoutsNow = countActivity(facts, "scout", "activatedAt", week.from, week.to);
  const sellerPace = pace(sellersNow.length, Number(sellerTarget?.value || 0), week.elapsedFraction);
  const buyerPace = pace(buyersNow.length, Number(buyerTarget?.value || 0), week.elapsedFraction);
  const scoutPace = pace(scoutsNow.length, Number(scoutTarget?.value || 0), week.elapsedFraction);

  const roles = filters.role === "all" ? ["seller", "buyer", "scout"] : [filters.role];
  const funnels = {};
  for (const role of ["seller", "buyer", "scout"]) {
    funnels[role] = cohortFunnel(facts, { role, from, to, windowDays });
  }
  const channels = channelTable(facts, {
    from,
    to,
    windowDays,
    opensByChannel: options.opensByChannel || {},
    spend: options.spend || [],
    now,
  });
  const stuck = stuckPeople(facts, now, options.stuckRules);
  const pipelineSeller = pipeline(facts, "seller", now);
  const pipelineBuyer = pipeline(facts, "buyer", now);
  const pipelineScout = pipeline(facts, "scout", now);

  const scoutRows = facts.filter((p) => p.role === "scout").map((scout) => {
    const lotTarget = Number(resolveTarget(targetRows, "scout_lots_per_week", week.from)?.value || DEFAULT_SCOUT_TARGETS.lots);
    const broughtTarget = Number(resolveTarget(targetRows, "scout_sellers_per_week", week.from)?.value || DEFAULT_SCOUT_TARGETS.sellers);
    const birdTarget = Number(resolveTarget(targetRows, "scout_birds_per_week", week.from)?.value || DEFAULT_SCOUT_TARGETS.birds);
    const status = scoutStatus(scout, now, {
      targets: { lots: lotTarget, sellers: broughtTarget, birds: birdTarget },
    });
    const lots = (scout.lotEvents || []).filter((e) => e.verified && inRange(e.at, from, to));
    return {
      personId: scout.personId,
      label: options.includeNames ? scout.label || "Scout" : "Scout",
      status,
      statusLabel: STATUS_LABEL[status],
      tenureDays: scout.approvedAt ? daysBetween(scout.approvedAt, now) : null,
      district: scout.district || "District unknown",
      lots: lots.length,
      lotTarget,
      sellers: facts.filter((p) => p.role === "seller" && p.referredByScoutId === scout.personId && inRange(p.createdAt, from, to)).length,
      sellerTarget: broughtTarget,
      buyers: facts.filter((p) => p.role === "buyer" && p.referredByScoutId === scout.personId && inRange(p.createdAt, from, to)).length,
      birds: lots.reduce((s, e) => s + Number(e.birds || 0), 0),
      birdTarget,
      unpaidRwf: Number(scout.unpaidRwf || 0),
      lastActivityAt: scout.lastActivityAt || null,
      definitionId: "M-SC-LOTS",
      n: lots.length,
    };
  });

  const supply = supplyDemandBlock(options.supplyDemand);
  const stated = statedBlock(options.stated, filters);
  const freshnessMinutes = Number.isFinite(options.freshnessMinutes) ? options.freshnessMinutes : 0;
  const excludedInternal = (people || []).filter((p) => p.isInternal).length;
  const qualityBase = qualityFrom(facts, channels, funnels, freshnessMinutes, {
    duplicatePhones: options.duplicatePhones || 0,
    excludedInternal,
    opensWithoutVisitor: options.opensWithoutVisitor || 0,
    targetsFromDefault,
  });

  const waiting = pipelineSeller.find((s) => s.stage === "applied");
  const stuckApplied = stuck.filter((s) => s.role === "seller" && s.stage === "applied");
  const best = [...channels.rows].filter((r) => !r.pinned && r.activatedSellers.x > 0).sort((a, b) => b.activatedSellers.x - a.activatedSellers.x)[0];
  const worst = channels.rows.find((r) => !r.pinned && r.accounts >= 30 && r.activatedSellers.x === 0);
  const gap = supply.available && supply.sentences?.recruitSellers ? supply.sentences.recruitSellers : null;

  const headlineInput = {
    sellers: sellersNow.length,
    sellerTarget: sellerTarget ? Number(sellerTarget.value) : null,
    sellerPace,
    scouts: scoutsNow.length,
    scoutTarget: scoutTarget ? Number(scoutTarget.value) : null,
    scoutPace,
    buyers: buyersNow.length,
    buyerTarget: buyerTarget ? Number(buyerTarget.value) : null,
    buyerPace,
    waitingN: waiting?.count || 0,
    waitingStage: "Applied",
    stuckN: stuckApplied.length,
    stuckThreshold: 2,
    bestChannel: best?.label,
    worstChannel: worst?.label,
    worstAccounts: worst?.accounts,
    channelEligible: Boolean(worst),
    supplyGap: gap?.gap || 0,
    supplyDistrict: gap?.district,
    confidence: "high",
    qualityCount: 0,
  };

  const snapshot = {
    meta: {
      generatedAt: now.toISOString(),
      timezone: "Africa/Kigali",
      range: { from, to },
      prevRange: prev,
      week,
      filters,
      definitionsVersion: DEFINITIONS_VERSION,
      windowDays,
      roles,
    },
    kpis: {
      sellersActivated: kpi("M-SELLER-ACTIVATED", "activity", sellersNow, {
        target: sellerTarget ? Number(sellerTarget.value) : null,
        targetVersion: sellerTarget?.id || null,
        pace: sellerPace,
        delta: periodChange(sellersNow.length, sellersPrev.length),
        listHref: `/api/analytics/recruitment/people?metric=sellersActivated&week=${week.from}`,
      }),
      sellersLiveUnverified: kpi("M-SELLER-LIVE-UNVERIFIED", "activity", unverifiedNow, {
        target: null,
        pace: null,
        listHref: `/api/analytics/recruitment/people?metric=sellersLiveUnverified&week=${week.from}`,
      }),
      buyersActivated: kpi("M-BUYER-ACTIVATED", "activity", buyersNow, {
        target: buyerTarget ? Number(buyerTarget.value) : null,
        targetVersion: buyerTarget?.id || null,
        pace: buyerPace,
        listHref: `/api/analytics/recruitment/people?metric=buyersActivated&week=${week.from}`,
      }),
      scoutsActivated: kpi("M-SCOUT-ACTIVATED", "activity", scoutsNow, {
        target: scoutTarget ? Number(scoutTarget.value) : null,
        targetVersion: scoutTarget?.id || null,
        pace: scoutPace,
        listHref: `/api/analytics/recruitment/people?metric=scoutsActivated&week=${week.from}`,
      }),
    },
    funnels,
    channels: channels.rows,
    channelTotals: channels.totals,
    pipeline: { seller: pipelineSeller, buyer: pipelineBuyer, scout: pipelineScout },
    alerts: stuck.slice(0, 8).map((row) => ({
      id: `A-STUCK-${row.ruleId}`,
      severity: "warn",
      count: 1,
      personId: row.personId,
      rule: `${row.role} at ${row.stage} for more than ${row.thresholdDays} days`,
      href: `/api/analytics/recruitment/people?metric=stuck&stage=${row.stage}&role=${row.role}`,
      definitionId: "M-STUCK",
      n: 1,
    })),
    stuck,
    scouts: {
      rows: scoutRows,
      totals: {
        lots: scoutRows.reduce((s, r) => s + r.lots, 0),
        sellers: scoutRows.reduce((s, r) => s + r.sellers, 0),
        birds: scoutRows.reduce((s, r) => s + r.birds, 0),
        unpaidRwf: scoutRows.reduce((s, r) => s + r.unpaidRwf, 0),
      },
      byDistrict: scoutDistricts(scoutRows),
    },
    supplyDemand: supply,
    stated,
    trends: trendBlock(facts, { to, now }),
    quality: {
      confidence: "high",
      checks: qualityBase.checks,
      freshnessMinutes,
      reconciliation: { ok: true, failures: [] },
    },
  };

  const groupedAlerts = groupAlerts(snapshot.alerts);
  snapshot.alerts = groupedAlerts;

  const command = buildCommand({
    facts,
    now,
    channels: snapshot.channels,
    supply: snapshot.supplyDemand,
    funnels: snapshot.funnels,
    targets: targetRows,
    includeContact: options.includeContact === true,
    includeNames: options.includeNames === true,
    buyersUnavailable: options.modules?.buyers === "unavailable",
  });
  snapshot.kpis.scoutsProducing = command.kpis.scoutsProducing;
  snapshot.kpis.passedProbation = command.kpis.passedProbation;
  snapshot.command = command.public;
  snapshot.meta.modules = {
    people: "ok",
    opens: options.modules?.opens || "ok",
    supply: options.modules?.supply || (snapshot.supplyDemand.available ? "ok" : "unavailable"),
    spend: options.modules?.spend || "ok",
    targets: options.modules?.targets || (targetsFromDefault ? "default" : "ok"),
    buyers: options.modules?.buyers || "ok",
  };
  snapshot.meta.districts = [...new Set(facts.map((person) => person.district))].sort();
  snapshot.meta.channels = [...new Set(facts.map((person) => person.firstTouchChannel))].sort();
  snapshot.meta.channelCatalog = CHANNELS.map((id) => ({ id, label: channelLabel(id) }));

  const failures = reconcile(snapshot).failures;
  snapshot.quality.checks.push({
    id: "DQ-10",
    label: "Reconciliation failures",
    count: failures.length,
    severity: failures.length ? "bad" : "ok",
  });
  snapshot.quality.confidence = confidenceOf(snapshot.quality.checks, failures);
  snapshot.quality.reconciliation = { ok: failures.length === 0, failures };
  headlineInput.confidence = snapshot.quality.confidence;
  const topIssue = snapshot.quality.checks.find((c) => c.severity === "warn" || c.severity === "bad");
  headlineInput.qualityCount = topIssue?.count || 0;
  headlineInput.qualityIssue = topIssue?.label || "";
  const line = buildHeadline(headlineInput);
  snapshot.headline = line;
  snapshot.briefing = {
    whatsappText: whatsAppSummary(snapshot.command.headline.text),
    slides: slideOutline(snapshot),
  };
  snapshot.recommendations = recommendedActions({
    channels: snapshot.channels,
    stuckCount: stuck.length,
    scoutsApprovedNoLot: scoutRows.filter((s) => s.status === "needs_support").length,
    listingsUnverified48h: unverifiedNow.length,
    sellersNoListing: facts.filter((p) => p.role === "seller" && !p.activatedAt && (daysBetween(p.createdAt, now) || 0) >= 5).length,
    spendEnteredThisWeek: (options.spend || []).some((s) => s.date >= week.from && s.date <= week.to),
    trackedLinksThisWeek: options.trackedLinksThisWeek !== false,
    reconciliationFailures: failures,
    supplySentences: supply.sentences,
  });
  snapshot.meta.note = targetsFromDefault
    ? "Weekly targets are the recorded defaults (sellers 10, scouts 2, buyers 8) until a target row is saved."
    : null;
  return snapshot;
}

function groupAlerts(alerts) {
  const map = new Map();
  for (const alert of alerts) {
    const key = alert.rule;
    if (!map.has(key)) map.set(key, { ...alert, count: 0, personIds: [] });
    const row = map.get(key);
    row.count += 1;
    row.n = row.count;
    row.personIds.push(alert.personId);
    delete row.personId;
  }
  return [...map.values()].sort((a, b) => b.count - a.count);
}

function slideOutline(snapshot) {
  return [
    { id: "title", title: "Weekly recruitment briefing" },
    { id: "outcomes", title: "Outcomes", kpis: snapshot.kpis },
    { id: "backlog", title: "Who is waiting", pipeline: snapshot.pipeline },
    { id: "funnels", title: "Where people stop" },
    { id: "channels", title: "Channels" },
    { id: "scouts", title: "Scouts" },
    { id: "liquidity", title: "Supply and demand" },
    { id: "quality", title: "Can we trust this" },
    { id: "decisions", title: "Decisions" },
  ];
}

export function peopleForMetric(snapshot, metric, extra = {}) {
  const map = {
    sellersActivated: snapshot.kpis.sellersActivated.personIds,
    sellersLiveUnverified: snapshot.kpis.sellersLiveUnverified.personIds,
    buyersActivated: snapshot.kpis.buyersActivated.personIds,
    scoutsActivated: snapshot.kpis.scoutsActivated.personIds,
    scoutsProducing: snapshot.kpis.scoutsProducing?.personIds,
    passedProbation: snapshot.kpis.passedProbation?.personIds,
  };
  if (map[metric]) return map[metric];
  if (metric === "stuck") {
    return snapshot.stuck
      .filter((s) => (!extra.role || s.role === extra.role) && (!extra.stage || s.stage === extra.stage))
      .map((s) => s.personId);
  }
  if (metric === "funnel") {
    const funnel = snapshot.funnels[extra.role || "seller"];
    const step = funnel?.steps?.find((s) => s.id === extra.step);
    return step?.personIds || [];
  }
  if (metric === "channel") {
    const row = snapshot.channels.find((c) => c.channel === extra.channel);
    return extra.activated ? row?.activatedIds || [] : row?.personIds || [];
  }
  if (metric === "stage") {
    const rows = snapshot.pipeline[extra.role || "seller"] || [];
    return rows.find((r) => r.stage === extra.stage)?.personIds || [];
  }
  return [];
}

export function publicPerson(person, { reveal = false } = {}) {
  const stage = deriveStage(person);
  return {
    personId: person.personId,
    role: person.role,
    label: person.label || "Person",
    district: person.district || "District unknown",
    stage: stage.stage,
    stageEnteredAt: stage.enteredAt,
    channel: normaliseChannel(person.firstTouchChannel),
    phone: reveal ? person.phone || null : maskPhone(person.phone),
    phoneMasked: !reveal,
    activatedAt: person.activatedAt || null,
    createdAt: person.createdAt,
  };
}

const OFFICER_HIDDEN_STAGES = new Set(["listing_live", "activated", "first_paid", "productive", "active"]);

/** Live sellers stay off the officer's recruitment list. */
export function visibleToSalesOfficer(person) {
  if (!person || person.activatedAt) return false;
  return !OFFICER_HIDDEN_STAGES.has(person.stage);
}

export function reconcile(snapshot) {
  const failures = [];
  const fail = (id, detail) => failures.push({ id, ...detail });

  for (const [role, funnel] of Object.entries(snapshot.funnels || {})) {
    const steps = funnel.steps || [];
    for (let i = 1; i < steps.length; i += 1) {
      if (steps[i].reach > steps[i - 1].reach) {
        fail("I-1", { role, step: steps[i].id, reach: steps[i].reach, prev: steps[i - 1].reach });
      }
      if (steps[i].ofPrev != null && (steps[i].ofPrev > 1 || steps[i].ofPrev < 0)) {
        fail("I-2", { role, step: steps[i].id, ofPrev: steps[i].ofPrev });
      }
      if (steps[i].medianDaysFromPrev != null && steps[i].medianDaysFromPrev < 0) {
        fail("I-3", { role, step: steps[i].id, days: steps[i].medianDaysFromPrev });
      }
    }
  }
  const accountSum = (snapshot.channels || []).reduce((s, r) => s + (r.accounts || 0), 0);
  if (accountSum !== (snapshot.channelTotals?.accounts ?? accountSum)) {
    fail("I-4", { accountSum, total: snapshot.channelTotals?.accounts });
  }
  const sellerEntry = snapshot.funnels?.seller?.entryN;
  const sellerAccounts = (snapshot.channels || []).reduce((s, r) => s + (r.sellers || 0), 0);
  if (snapshot.meta?.filters?.role !== "buyer" && snapshot.meta?.filters?.role !== "scout") {
    if (sellerEntry != null && sellerEntry !== sellerAccounts) {
      fail("I-5", { funnelEntry: sellerEntry, channelSellers: sellerAccounts });
    }
  }
  if ((snapshot.kpis?.sellersActivated?.personIds || []).length !== snapshot.kpis?.sellersActivated?.value) {
    fail("I-6", { value: snapshot.kpis?.sellersActivated?.value, list: snapshot.kpis?.sellersActivated?.personIds?.length });
  }
  for (const role of ["seller", "buyer", "scout"]) {
    const rows = snapshot.pipeline?.[role] || [];
    const seen = new Set();
    let sum = 0;
    for (const row of rows) {
      sum += row.count;
      for (const id of row.personIds || []) {
        if (seen.has(id)) fail("I-7", { role, personId: id });
        seen.add(id);
      }
    }
    const expected = (snapshot.funnels ? null : null);
    void expected;
    const early = rows.filter((r) => r.stage === "applied" || r.stage === "contacted");
    for (const row of early) {
      const activated = new Set(snapshot.kpis?.sellersActivated?.personIds || []);
      for (const id of row.personIds || []) {
        if (activated.has(id) && role === "seller") fail("I-8", { personId: id, stage: row.stage });
      }
    }
    void sum;
  }
  for (const kpi of Object.values(snapshot.kpis || {})) {
    if (!kpi.definitionId || kpi.n == null) fail("I-11", { kpi });
  }
  if (!snapshot.kpis?.sellersActivated?.targetVersion && snapshot.kpis?.sellersActivated?.target != null) {
    fail("I-12", {});
  }
  const range = snapshot.meta?.range;
  const prev = snapshot.meta?.prevRange;
  if (range && prev) {
    const len = (a, b) => (Date.parse(b) - Date.parse(a)) / 86400000;
    if (len(range.from, range.to) !== len(prev.from, prev.to)) fail("I-13", { range, prev });
  }
  if (!snapshot.meta?.generatedAt) fail("I-15", {});
  return { ok: failures.length === 0, failures };
}
