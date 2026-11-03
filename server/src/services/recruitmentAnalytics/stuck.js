/** Stuck and dead. Thresholds are the recorded defaults from AUDIT D6 and D7. */

import { daysBetween } from "./time.js";
import { deriveStage } from "./funnel.js";

export const DEFAULT_STUCK_RULES = [
  { id: "seller-applied", role: "seller", stage: "applied", days: 2, action: "Call or WhatsApp to start KYC" },
  { id: "seller-contacted", role: "seller", stage: "contacted", days: 5, action: "Follow up; help complete KYC" },
  { id: "seller-kyc", role: "seller", stage: "kyc", days: 5, action: "Help create the first listing" },
  { id: "buyer-applied", role: "buyer", stage: "applied", days: 3, action: "Call to complete profile" },
  { id: "buyer-profile", role: "buyer", stage: "profile", days: 3, action: "Call to complete profile" },
  { id: "buyer-verified", role: "buyer", stage: "verified", days: 7, action: "Show matching listings; ask what they need" },
  { id: "scout-applied", role: "scout", stage: "applied", days: 3, action: "Interview" },
  { id: "scout-approved", role: "scout", stage: "approved", days: 7, action: "Assign first targets; check in" },
];

export const DEAD_DAYS = 14;

export function personAgeDays(person, now) {
  return daysBetween(person.createdAt, now);
}

export function isMarkedClosed(person) {
  const stage = person.stageOverride || person.rawStage;
  return stage === "unreachable" || stage === "not_a_fit";
}

export function deadStatus(person, now = new Date()) {
  if (person.isInternal) return { dead: false, tooEarly: false, reason: null };
  const age = personAgeDays(person, now);
  const marked = isMarkedClosed(person);
  if (marked && !person.activatedAt) return { dead: true, tooEarly: false, reason: "marked" };
  if (age == null || age < DEAD_DAYS) return { dead: false, tooEarly: true, reason: "too_early" };
  if (person.activatedAt) return { dead: false, tooEarly: false, reason: null };
  const last = person.lastActivityAt || person.createdAt;
  const idle = daysBetween(last, now);
  if (idle != null && idle >= DEAD_DAYS) return { dead: true, tooEarly: false, reason: "inactive" };
  return { dead: false, tooEarly: false, reason: null };
}

export function stuckPeople(people, now = new Date(), rules = DEFAULT_STUCK_RULES) {
  const out = [];
  for (const person of people || []) {
    if (person.isInternal || person.isSynthetic) continue;
    if (person.activatedAt) continue;
    const dead = deadStatus(person, now);
    if (dead.dead) continue;
    const derived = deriveStage(person, now);
    const rule = rules.find((r) => r.role === person.role && r.stage === derived.stage);
    if (!rule) continue;
    const waited = daysBetween(derived.enteredAt, now);
    if (waited == null || waited < rule.days) continue;
    out.push({
      personId: person.personId,
      role: person.role,
      stage: derived.stage,
      waitedDays: waited,
      ruleId: rule.id,
      action: rule.action,
      thresholdDays: rule.days,
    });
  }
  return out;
}

export function deadRate(people, now = new Date()) {
  const judged = [];
  const dead = [];
  let tooEarly = 0;
  for (const person of people || []) {
    if (person.isInternal || person.isSynthetic) continue;
    const status = deadStatus(person, now);
    if (status.tooEarly && !status.dead) {
      tooEarly += 1;
      continue;
    }
    judged.push(person.personId);
    if (status.dead) dead.push(person.personId);
  }
  if (judged.length === 0) {
    return { tooEarly: true, x: 0, of: 0, rate: null, personIds: [] };
  }
  return { tooEarly: false, x: dead.length, of: judged.length, rate: dead.length / judged.length, personIds: dead, young: tooEarly };
}
