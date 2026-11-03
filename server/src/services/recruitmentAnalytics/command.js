/**
 * Command-centre numbers. Tiles, the daily list, and the short headline.
 * Widgets render this. They do not count on their own.
 */

import { CHANNELS, channelLabel } from "./channels.js";
import { deriveStage } from "./funnel.js";
import { maskPhone, phoneLooksPersonal } from "./phone.js";
import { periodChange } from "./stats.js";
import { stuckPeople } from "./stuck.js";
import { resolveTargets } from "./targets.js";
import { addDays, daysBetween, inRange, kigaliWeek } from "./time.js";

export const PROBATION_DAYS = 21;
export const SCOUT_PROBATION_LOTS = 8;
export const STATEMENT_TIMEOUT_MS = 3000;
export const WORKLIST_LIMIT = 5;

const STAGE_LABEL = {
  applied: "Applied",
  contacted: "Contacted",
  kyc: "KYC",
  approved: "Approved",
  profile: "Profile",
  interviewed: "Interviewed",
  verified: "Verified",
  listing_live: "Live",
  first_paid: "First sale",
  activated: "Live",
  productive: "First sale",
  unreachable: "Unreachable",
  not_a_fit: "Not a fit",
};

const ROLE_LABEL = { seller: "Seller", buyer: "Buyer", scout: "Scout" };

const SELLER_STAGE_ORDER = ["applied", "contacted", "kyc", "listing_live", "first_paid", "unreachable", "not_a_fit"];

export function wordCount(text) {
  return String(text || "")
    .trim()
    .split(/\s+/)
    .filter(Boolean).length;
}

export function queryFailure(err) {
  const code = String(err?.code || "");
  if (code === "42P01" || code === "42703" || code === "3F000") return "missing";
  if (code === "57014") return "timeout";
  return "failed";
}

export function rollingThreeWeeks(now = new Date()) {
  const week = kigaliWeek(now);
  return { from: addDays(week.from, -14), to: week.to };
}

export function deltaText(change) {
  if (!change) return null;
  if (change.abs === 0) return "same";
  return change.abs > 0 ? `+${change.abs}` : String(change.abs);
}

function plain(text) {
  return { text: String(text), emphasis: false };
}

function bold(text) {
  return { text: String(text), emphasis: true };
}

export function commandHeadline(input) {
  const sellers = input.sellers ?? 0;
  const target = input.sellerTarget;
  const waiting = input.waiting ?? 0;
  const passed = input.passed ?? 0;
  if (sellers === 0 && passed === 0 && waiting === 0) {
    return { text: "No sellers went live this week.", segments: [plain("No sellers went live this week.")] };
  }
  const segments = [];
  if (target == null) {
    segments.push(bold(String(sellers)), plain(" sellers are live. Set a weekly target."));
  } else {
    segments.push(bold(`${sellers} of ${target}`), plain(" sellers are live."));
  }
  if (waiting > 0) {
    segments.push(plain(" "), bold(String(waiting)), plain(" people need a call today."));
  } else if (passed > 0) {
    segments.push(plain(" "), bold(String(passed)), plain(" passed probation."));
  }
  const text = segments.map((part) => part.text).join("");
  if (wordCount(text) <= 20) return { text, segments };
  const cut = text.trim().split(/\s+/).slice(0, 20).join(" ");
  return { text: cut, segments: [plain(cut)] };
}

export function tileContext(id, input) {
  if (id === "sellers") {
    const n = input.unverified || 0;
    return n > 0 ? `+${n} not verified` : "Verified this week";
  }
  if (id === "buyers") {
    if (input.buyersUnavailable) return "Unavailable";
    if (input.buyerTarget == null) return "Set target";
    return "First request";
  }
  if (id === "scouts") {
    if (input.scoutsUnavailable) return "Unavailable";
    if (input.scoutTarget == null) return "Set target";
    return "Verified lot this week";
  }
  return `sellers ${input.passedSellers || 0} · scouts ${input.passedScouts || 0}`;
}

export function scoutsProducing(people, from, to) {
  return (people || []).filter((person) => {
    if (person.role !== "scout" || person.isInternal || person.isSynthetic) return false;
    return (person.lotEvents || []).some((event) => event.verified && inRange(event.at, from, to));
  });
}

function scoutPassAt(scout) {
  if (!scout.approvedAt) return null;
  const start = new Date(scout.approvedAt).getTime();
  if (!Number.isFinite(start)) return null;
  const end = start + PROBATION_DAYS * 24 * 60 * 60 * 1000;
  const lots = (scout.lotEvents || [])
    .filter((event) => event.verified && event.at)
    .map((event) => new Date(event.at).getTime())
    .filter((time) => Number.isFinite(time) && time >= start && time <= end)
    .sort((a, b) => a - b);
  if (lots.length < SCOUT_PROBATION_LOTS) return null;
  return new Date(lots[SCOUT_PROBATION_LOTS - 1]).toISOString();
}

export function passedProbation(people, now = new Date(), range = rollingThreeWeeks(now)) {
  const sellers = [];
  const scouts = [];
  for (const person of people || []) {
    if (person.isInternal || person.isSynthetic) continue;
    if (person.role === "seller" && person.activatedAt && person.productiveAt) {
      const days = daysBetween(person.activatedAt, person.productiveAt);
      if (days == null || days < 0 || days > PROBATION_DAYS) continue;
      if (!inRange(person.productiveAt, range.from, range.to)) continue;
      sellers.push(person);
    }
    if (person.role === "scout") {
      const at = scoutPassAt(person);
      if (at && inRange(at, range.from, range.to)) scouts.push(person);
    }
  }
  return {
    sellers,
    scouts,
    people: [...sellers, ...scouts],
    value: sellers.length + scouts.length,
    from: range.from,
    to: range.to,
  };
}

function weekPoints(people, now, pick) {
  const week = kigaliWeek(now);
  const points = [];
  for (let i = 5; i >= 0; i -= 1) {
    const from = addDays(week.from, -7 * i);
    const to = addDays(from, 6);
    points.push(pick(from, to));
  }
  return points;
}

export function doToday(people, now = new Date(), { limit = WORKLIST_LIMIT, includeContact = false, includeNames = false } = {}) {
  const stuck = stuckPeople(people, now);
  stuck.sort(
    (a, b) =>
      b.waitedDays - b.thresholdDays - (a.waitedDays - a.thresholdDays) ||
      String(a.personId).localeCompare(String(b.personId))
  );
  const byId = new Map((people || []).map((person) => [person.personId, person]));
  const rows = stuck.slice(0, limit).map((row) => {
    const person = byId.get(row.personId) || {};
    const roleLabel = ROLE_LABEL[row.role] || "Person";
    const stage = STAGE_LABEL[row.stage] || row.stage;
    const district = person.district || "District unknown";
    const days = Math.max(0, Math.floor(row.waitedDays));
    const digits = String(person.phone || "").replace(/\D/g, "");
    const text = `${roleLabel} · ${district} · ${days}d at ${stage}`;
    return {
      personId: row.personId,
      role: row.role,
      roleLabel,
      label: includeNames ? person.label || roleLabel : roleLabel,
      district,
      stage: row.stage,
      stageLabel: stage,
      waitedDays: days,
      text,
      whatsappHref: includeContact && digits ? `https://wa.me/${digits}` : null,
      openHref: "/farm/pipeline/people",
    };
  });
  return {
    total: stuck.length,
    shown: rows.length,
    rows,
    definitionId: "M-STUCK",
    n: stuck.length,
  };
}

export function stageWaits(people, role, now = new Date()) {
  const stages = new Map();
  for (const person of people || []) {
    if (person.role !== role || person.isInternal || person.isSynthetic) continue;
    const derived = deriveStage(person, now);
    const days = Math.max(0, Math.floor(daysBetween(derived.enteredAt, now) || 0));
    if (!stages.has(derived.stage)) {
      stages.set(derived.stage, { stage: derived.stage, label: STAGE_LABEL[derived.stage] || derived.stage, count: 0, d0: 0, d3: 0, d6: 0 });
    }
    const row = stages.get(derived.stage);
    row.count += 1;
    if (days < 3) row.d0 += 1;
    else if (days < 6) row.d3 += 1;
    else row.d6 += 1;
  }
  const order = role === "seller" ? SELLER_STAGE_ORDER : [];
  return [...stages.values()].sort((a, b) => {
    const ai = order.indexOf(a.stage);
    const bi = order.indexOf(b.stage);
    return (ai < 0 ? 99 : ai) - (bi < 0 ? 99 : bi);
  });
}

export function sourcesTop(channels, limit = 3) {
  const rows = channels || [];
  const ranked = rows
    .filter((row) => !row.pinned)
    .slice()
    .sort((a, b) => (b.activatedSellers?.x || 0) - (a.activatedSellers?.x || 0) || b.accounts - a.accounts);
  const top = ranked.slice(0, limit);
  const unattributed = rows.find((row) => row.pinned);
  if (unattributed && (unattributed.accounts > 0 || (unattributed.activatedSellers?.x || 0) > 0)) {
    top.push(unattributed);
  }
  return top.map((row) => ({
    channel: row.channel,
    label: row.label,
    live: row.activatedSellers?.x || 0,
    of: row.sellers || row.activatedSellers?.of || 0,
    accounts: row.accounts || 0,
    opens: row.opens == null ? null : row.opens,
    pinned: Boolean(row.pinned),
  }));
}

const MOVING_STAGES = new Set(["applied", "contacted", "kyc"]);
const CLOSED_STAGES = new Set(["unreachable", "not_a_fit"]);

function peopleCount(n, singular, plural) {
  return `${n} ${n === 1 ? singular : plural}`;
}

export function leakSentence(funnels, people = [], now = new Date()) {
  const funnel = funnels?.seller;
  const steps = funnel?.steps || [];
  const applied = steps.find((step) => step.id === "application" || step.id === "applied" || step.id === "account");
  const live = steps.find((step) => step.id === "activated" || step.id === "live" || step.id === "listing_live");
  const appliedN = applied ? Number(applied.reach) || 0 : Number(funnel?.entryN) || 0;
  const liveN = live ? Number(live.reach) || 0 : 0;
  if (!funnel || appliedN <= 0) return "No seller gap stands out in this period.";
  const gap = Math.max(0, appliedN - liveN);
  if (gap === 0) return `${liveN} of ${appliedN} who applied are live.`;
  const head = `${liveN} of ${appliedN} who applied are live. ${peopleCount(gap, "is", "are")} not live yet.`;

  const appliedIds = new Set(applied?.personIds || []);
  const liveIds = new Set(live?.personIds || []);
  const pool = (people || []).filter((person) => {
    if (person.role !== "seller" || person.isInternal || person.isSynthetic) return false;
    if (appliedIds.size) return appliedIds.has(person.personId) && !liveIds.has(person.personId);
    return false;
  });
  if (!pool.length) return head;

  let moving = 0;
  let closed = 0;
  for (const person of pool) {
    const stage = deriveStage(person, now).stage;
    if (MOVING_STAGES.has(stage)) moving += 1;
    else if (CLOSED_STAGES.has(stage)) closed += 1;
  }
  if (moving + closed !== gap) return head;
  return `${head} ${peopleCount(moving, "is", "are")} still in Applied, Contacted, or KYC. ${peopleCount(closed, "is", "are")} Unreachable or Not a fit.`;
}

export function scoutDistricts(rows) {
  const map = new Map();
  for (const row of rows || []) {
    const district = row.district || "District unknown";
    const current = map.get(district) || { district, scouts: 0, lots: 0 };
    current.scouts += 1;
    current.lots += Number(row.lots || 0);
    map.set(district, current);
  }
  return [...map.values()].sort((a, b) => b.lots - a.lots || a.district.localeCompare(b.district));
}

function countField(people, role, field, from, to) {
  return people.filter((person) => person.role === role && person[field] && inRange(person[field], from, to));
}

export function buildCommand({
  facts,
  now,
  channels,
  supply,
  funnels,
  targets,
  includeContact = false,
  includeNames = false,
  buyersUnavailable = false,
}) {
  const week = kigaliWeek(now);
  const sellers = countField(facts, "seller", "activatedAt", week.from, week.to);
  const sellersPrev = countField(
    facts,
    "seller",
    "activatedAt",
    previousWeek(week.from).from,
    previousWeek(week.from).to
  );
  const unverified = countField(facts, "seller", "liveUnverifiedAt", week.from, week.to);
  const buyers = countField(facts, "buyer", "activatedAt", week.from, week.to);
  const buyersPrev = countField(
    facts,
    "buyer",
    "activatedAt",
    previousWeek(week.from).from,
    previousWeek(week.from).to
  );
  const producing = scoutsProducing(facts, week.from, week.to);
  const producingPrev = scoutsProducing(facts, previousWeek(week.from).from, previousWeek(week.from).to);
  const passedRange = rollingThreeWeeks(now);
  const passed = passedProbation(facts, now, passedRange);
  const prevRange = { from: addDays(passedRange.from, -21), to: addDays(passedRange.from, -1) };
  const passedPrev = passedProbation(facts, now, prevRange);
  const sellerTiers = resolveTargets(targets, "sellers_activated_per_week", week.from);
  const buyerTiers = resolveTargets(targets, "buyers_activated_per_week", week.from);
  const scoutTiers = resolveTargets(targets, "scouts_activated_per_week", week.from);
  const worklist = doToday(facts, now, { includeContact, includeNames });
  const contextInput = {
    unverified: unverified.length,
    buyersUnavailable,
    buyerTarget: buyerTiers.t1 ? Number(buyerTiers.t1.value) : null,
    scoutTarget: scoutTiers.t1 ? Number(scoutTiers.t1.value) : null,
    passedSellers: passed.sellers.length,
    passedScouts: passed.scouts.length,
  };
  const tiles = [
    tile("sellers", "Sellers live", "M-SELLER-ACTIVATED", "activity", sellers, sellerTiers, periodChange(sellers.length, sellersPrev.length), contextInput, weekPoints(facts, now, (from, to) => countField(facts, "seller", "activatedAt", from, to).length)),
    tile(
      "buyers",
      "Buyers active",
      "M-BUYER-ACTIVATED",
      "activity",
      buyersUnavailable ? null : buyers,
      buyerTiers,
      buyersUnavailable ? null : periodChange(buyers.length, buyersPrev.length),
      contextInput,
      buyersUnavailable ? [] : weekPoints(facts, now, (from, to) => countField(facts, "buyer", "activatedAt", from, to).length),
      buyersUnavailable
    ),
    tile("scouts", "Scouts producing", "M-SCOUT-PRODUCING", "activity", producing, scoutTiers, periodChange(producing.length, producingPrev.length), contextInput, weekPoints(facts, now, (from, to) => scoutsProducing(facts, from, to).length)),
    tile(
      "probation",
      "Passed probation",
      "M-PROBATION",
      "cohort",
      passed.people,
      { t1: null, t2: null },
      periodChange(passed.value, passedPrev.value),
      contextInput,
      weekPoints(facts, now, (from, to) => passedProbation(facts, now, { from, to }).value),
      false,
      { sellers: passed.sellers.length, scouts: passed.scouts.length }
    ),
  ];
  return {
    kpis: {
      scoutsProducing: kpiFrom(tiles[2], producing.map((person) => person.personId), scoutTiers.t1),
      passedProbation: kpiFrom(tiles[3], passed.people.map((person) => person.personId), null),
    },
    public: {
      headline: commandHeadline({
        sellers: sellers.length,
        sellerTarget: sellerTiers.t1 ? Number(sellerTiers.t1.value) : null,
        waiting: worklist.total,
        passed: passed.value,
      }),
      tiles,
      worklist,
      pipeline: orderStages(facts, now),
      waiting: stageWaits(facts, "seller", now),
      sources: sourcesTop(channels, 3),
      supply: supplyCard(supply),
      leak: leakSentence(funnels, facts, now),
      channelCatalog: CHANNELS.map((id) => ({ id, label: channelLabel(id) })),
    },
  };
}

function previousWeek(weekFrom) {
  const from = addDays(weekFrom, -7);
  return { from, to: addDays(from, 6) };
}

function orderStages(facts, now) {
  const counts = new Map();
  for (const person of facts || []) {
    if (person.role !== "seller" || person.isInternal || person.isSynthetic) continue;
    const stage = deriveStage(person, now).stage;
    counts.set(stage, (counts.get(stage) || 0) + 1);
  }
  return SELLER_STAGE_ORDER.filter((stage) => counts.has(stage)).map((stage) => ({
    stage,
    label: STAGE_LABEL[stage] || stage,
    count: counts.get(stage),
  }));
}

function tile(id, label, definitionId, mode, peopleOrNull, tiers, change, contextInput, spark, unavailable = false, extra = {}) {
  const people = Array.isArray(peopleOrNull) ? peopleOrNull : [];
  const value = unavailable ? null : people.length;
  return {
    id,
    label,
    definitionId,
    mode,
    value,
    n: unavailable ? 0 : people.length,
    unavailable,
    delta: unavailable ? null : deltaText(change),
    context: tileContext(id, contextInput),
    target: tiers.t1 ? Number(tiers.t1.value) : null,
    targetT2: tiers.t2 ? Number(tiers.t2.value) : null,
    spark: spark || [],
    ...extra,
  };
}

function kpiFrom(tileRow, personIds, targetRow) {
  return {
    definitionId: tileRow.definitionId,
    mode: tileRow.mode,
    value: tileRow.value ?? 0,
    n: tileRow.n,
    unavailable: tileRow.unavailable,
    target: tileRow.target,
    targetT2: tileRow.targetT2,
    targetVersion: targetRow?.id || null,
    delta: tileRow.delta,
    personIds,
    context: tileRow.context,
  };
}

function supplyCard(supply) {
  if (!supply || supply.available === false) {
    return { available: false, reason: supply?.reason || "Unavailable", liveBirds: null, demandBirds: null };
  }
  return {
    available: true,
    reason: null,
    liveBirds: Number(supply.liveBirds || 0),
    demandBirds: Number(supply.demandBirds || 0),
  };
}

export function weeklyNotes(input) {
  const source = input && !Array.isArray(input) ? input : { goingWell: Array.isArray(input) ? input : [] };
  const groups = ["goingWell", "notGoingWell", "supportNeeded"];
  const notes = {};
  for (const key of groups) {
    const bullets = Array.isArray(source[key]) ? source[key] : [];
    if (bullets.length > 3) return { ok: false, error: "At most 3 bullets in each group." };
    const clean = [];
    for (const bullet of bullets) {
      const text = String(bullet ?? "").trim();
      if (!text) continue;
      if (phoneLooksPersonal(text)) return { ok: false, error: "Notes cannot include a phone number." };
      clean.push(text.slice(0, 180));
    }
    notes[key] = clean;
  }
  return { ok: true, notes };
}

export function rememberSnapshot(store, key, result) {
  if (result?.ok && result.snapshot) {
    const snapshot = { ...result.snapshot, stale: false, staleReason: null };
    store.set(key, snapshot);
    return { ok: true, stale: false, snapshot };
  }
  const previous = store.get(key);
  if (previous) {
    const snapshot = {
      ...previous,
      stale: true,
      staleReason: result?.error || "Last refresh failed",
    };
    return { ok: true, stale: true, snapshot };
  }
  return { ok: false, stale: false, error: result?.error || "Unavailable" };
}

const STRIP_KEYS = new Set(["personIds", "activatedIds"]);

export function publishSnapshot(snapshot) {
  return stripIds(JSON.parse(JSON.stringify(snapshot)));
}

function stripIds(value) {
  if (Array.isArray(value)) return value.map(stripIds);
  if (!value || typeof value !== "object") return value;
  const next = {};
  for (const [key, child] of Object.entries(value)) {
    if (STRIP_KEYS.has(key)) continue;
    next[key] = stripIds(child);
  }
  return next;
}

export function sliceForView(snapshot, view = "all") {
  const name = ["overview", "pipeline", "sources", "scouts", "weekly", "all"].includes(view) ? view : "all";
  const command = snapshot.command || {};
  const base = {
    view: name,
    stale: Boolean(snapshot.stale),
    staleReason: snapshot.staleReason || null,
    meta: snapshot.meta,
    headline: command.headline || snapshot.headline,
    quality: snapshot.quality
      ? {
          confidence: snapshot.quality.confidence,
          checks: snapshot.quality.checks,
          reconciliation: snapshot.quality.reconciliation,
        }
      : null,
    command,
  };
  if (name === "overview") return base;
  if (name === "pipeline") {
    return { ...base, funnels: snapshot.funnels, pipeline: snapshot.pipeline };
  }
  if (name === "sources") return { ...base, channels: snapshot.channels, channelTotals: snapshot.channelTotals };
  if (name === "scouts") return { ...base, scouts: snapshot.scouts };
  if (name === "weekly") {
    return { ...base, funnels: snapshot.funnels, briefing: snapshot.briefing, pipeline: snapshot.pipeline };
  }
  return {
    ...base,
    funnels: snapshot.funnels,
    channels: snapshot.channels,
    channelTotals: snapshot.channelTotals,
    scouts: snapshot.scouts,
    briefing: snapshot.briefing,
    supplyDemand: snapshot.supplyDemand,
  };
}

/** Overview and pipeline only. Sources, scouts, and the weekly briefing stay off this copy. */
export function sliceForOfficer(snapshot) {
  const overview = sliceForView(snapshot, "overview");
  const pipeline = sliceForView(snapshot, "pipeline");
  return {
    ...overview,
    funnels: pipeline.funnels,
    pipeline: pipeline.pipeline,
    view: "officer",
  };
}
