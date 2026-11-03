/**
 * Cohort funnel. A later step cannot outcount an earlier step.
 * Missing earlier timestamps are imputed and flagged (DQ-3).
 */

import { daysBetween, inRange } from "./time.js";
import { safeRate, timeSummary } from "./stats.js";

export const ROLE_STEPS = {
  seller: [
    { id: "account", field: "createdAt" },
    { id: "application", field: "applicationSubmittedAt" },
    { id: "contacted", field: "contactedAt" },
    { id: "kyc", field: "kycVerifiedAt" },
    { id: "activated", field: "activatedAt" },
    { id: "productive", field: "productiveAt" },
  ],
  buyer: [
    { id: "account", field: "createdAt" },
    { id: "profile", field: "applicationSubmittedAt" },
    { id: "verified", field: "kycVerifiedAt" },
    { id: "activated", field: "activatedAt" },
    { id: "productive", field: "productiveAt" },
  ],
  scout: [
    { id: "applied", field: "applicationSubmittedAt" },
    { id: "interviewed", field: "contactedAt" },
    { id: "approved", field: "kycVerifiedAt" },
    { id: "activated", field: "activatedAt" },
    { id: "productive", field: "productiveAt" },
  ],
};

const STAGE_RANK = {
  applied: 0,
  interviewed: 1,
  profile: 1,
  contacted: 1,
  verified: 2,
  kyc: 2,
  approved: 2,
  listing_live: 3,
  activated: 3,
  first_paid: 4,
  productive: 4,
  unreachable: 9,
  not_a_fit: 9,
  dormant: 9,
};

export function windowEnd(createdAt, windowDays) {
  return new Date(createdAt).getTime() + windowDays * 24 * 60 * 60 * 1000;
}

/**
 * Fill gaps so step k is never reached without step k-1.
 * Times after the conversion window are ignored for later steps.
 * @returns {{ times: (number|null)[], imputed: boolean }}
 */
export function imputeStepTimes(person, role, windowDays) {
  const steps = ROLE_STEPS[role] || ROLE_STEPS.seller;
  const created = new Date(person.createdAt).getTime();
  const limit = windowEnd(person.createdAt, windowDays);
  const times = steps.map((step, index) => {
    const raw = person[step.field];
    if (!raw) return null;
    const t = new Date(raw).getTime();
    if (!Number.isFinite(t)) return null;
    if (index === 0) return t;
    if (t > limit) return null;
    return t;
  });
  let imputed = false;
  let last = -1;
  for (let i = times.length - 1; i >= 0; i -= 1) {
    if (times[i] != null) {
      last = i;
      break;
    }
  }
  if (last > 0) {
    for (let i = last - 1; i >= 0; i -= 1) {
      if (times[i] == null && times[i + 1] != null) {
        times[i] = times[i + 1];
        imputed = true;
      }
    }
  }
  if (!Number.isFinite(created)) {
    return { times, imputed };
  }
  return { times, imputed };
}

export function cohortPeople(people, { role, from, to }) {
  return (people || []).filter((p) => {
    if (p.isInternal || p.isSynthetic) return false;
    if (p.role !== role) return false;
    const entryField = role === "scout" ? p.applicationSubmittedAt || p.createdAt : p.createdAt;
    return inRange(entryField, from, to);
  });
}

export function cohortFunnel(people, { role, from, to, windowDays = 14 }) {
  const steps = ROLE_STEPS[role] || ROLE_STEPS.seller;
  const cohort = cohortPeople(people, { role, from, to });
  const reached = steps.map(() => []);
  const dayPairs = steps.map(() => []);
  let imputedCount = 0;
  let negativeCount = 0;

  for (const person of cohort) {
    const { times, imputed } = imputeStepTimes(person, role, windowDays);
    if (imputed) imputedCount += 1;
    steps.forEach((step, index) => {
      if (times[index] == null) return;
      reached[index].push(person.personId);
      if (index === 0) return;
      const prevField = steps[index - 1].field;
      const nextField = step.field;
      const a = person[prevField] ? new Date(person[prevField]).getTime() : null;
      const b = person[nextField] ? new Date(person[nextField]).getTime() : null;
      if (a == null || b == null) return;
      const days = (b - a) / (24 * 60 * 60 * 1000);
      if (days < 0) negativeCount += 1;
      dayPairs[index].push(days);
    });
  }

  const counts = reached.map((ids) => ids.length);
  const violations = [];
  const stepRows = steps.map((step, index) => {
    const ofPrev = index === 0 ? null : safeRate(counts[index], counts[index - 1]);
    const ofTop = index === 0 ? { ok: true, value: 1, num: counts[0], den: counts[0] } : safeRate(counts[index], counts[0]);
    if (ofPrev && !ofPrev.ok && ofPrev.reason === "invariant-violation") violations.push(step.id);
    if (ofTop && !ofTop.ok && ofTop.reason === "invariant-violation") violations.push(step.id);
    const summary = index === 0 ? null : timeSummary(dayPairs[index]);
    return {
      id: step.id,
      definitionId: "M-REACH",
      reach: counts[index],
      n: counts[index],
      ofPrev: ofPrev && ofPrev.ok ? ofPrev.value : null,
      ofPrevNum: ofPrev ? ofPrev.num : null,
      ofPrevDen: ofPrev && ofPrev.ok ? ofPrev.den : index === 0 ? null : counts[index - 1],
      ofTop: ofTop && ofTop.ok ? ofTop.value : null,
      medianDaysFromPrev: summary ? summary.value : null,
      iqr: summary ? summary.iqr : null,
      individuals: summary ? summary.individuals : null,
      lowSample: counts[index] > 0 && counts[index] < 10,
      personIds: reached[index],
    };
  });

  let biggestLeak = null;
  let worstDrop = 0;
  for (let i = 1; i < counts.length; i += 1) {
    const drop = counts[i - 1] - counts[i];
    if (drop > worstDrop) {
      worstDrop = drop;
      biggestLeak = {
        from: steps[i - 1].id,
        to: steps[i].id,
        drop,
        eligible: counts[i - 1] >= 30,
      };
    }
  }

  return {
    mode: "cohort",
    windowDays,
    entryN: counts[0] || 0,
    steps: stepRows,
    biggestLeak,
    imputedCount,
    negativeCount,
    violations,
    monotonic: counts.every((n, i) => i === 0 || n <= counts[i - 1]),
  };
}

const EARLY = new Set(["applied", "contacted", "interviewed", "profile"]);

/**
 * Analytics stage comes from timestamps. A live listing never stays in Applied.
 * The recruitment_contacts stage names are mapped, not copied when they disagree.
 */
export function deriveStage(person, now = new Date()) {
  if (person.stageOverride === "unreachable" || person.stageOverride === "not_a_fit") {
    if (!person.activatedAt) {
      return {
        stage: person.stageOverride,
        enteredAt: person.stageEnteredAt || person.createdAt,
      };
    }
  }
  if (person.productiveAt) {
    return { stage: person.role === "seller" ? "first_paid" : "productive", enteredAt: person.productiveAt };
  }
  if (person.activatedAt) {
    return {
      stage: person.role === "seller" ? "listing_live" : "activated",
      enteredAt: person.activatedAt,
    };
  }
  if (person.kycVerifiedAt || person.approvedAt) {
    const stage = person.role === "scout" ? "approved" : person.role === "buyer" ? "verified" : "kyc";
    return { stage, enteredAt: person.kycVerifiedAt || person.approvedAt };
  }
  if (person.contactedAt) {
    const stage = person.role === "scout" ? "interviewed" : person.role === "buyer" ? "profile" : "contacted";
    return { stage, enteredAt: person.contactedAt };
  }
  const entered = person.applicationSubmittedAt || person.createdAt;
  return { stage: "applied", enteredAt: entered || now.toISOString() };
}

export function stageDisagrees(person) {
  const derived = deriveStage(person);
  if (!person.activatedAt) return false;
  return EARLY.has(person.rawStage);
}

export function stageRank(stage) {
  return STAGE_RANK[stage] ?? 0;
}

export { daysBetween };
