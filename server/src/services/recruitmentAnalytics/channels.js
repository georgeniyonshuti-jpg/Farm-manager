/** One channel slug per person. Unknown stays visible as Unattributed. */

import { cohortFunnel } from "./funnel.js";
import { deadRate } from "./stuck.js";
import { safeRate, timeSummary, wilson } from "./stats.js";
import { daysBetween, inRange } from "./time.js";

export const CHANNELS = [
  "facebook_ads",
  "instagram_ads",
  "whatsapp_ctwa_ads",
  "whatsapp_group_share",
  "whatsapp_direct_share",
  "scout_referral",
  "market_visit",
  "word_of_mouth",
  "organic_search",
  "direct_unknown",
  "unattributed",
];

const LABELS = {
  facebook_ads: "Facebook ads",
  instagram_ads: "Instagram ads",
  whatsapp_ctwa_ads: "WhatsApp click-to-ad",
  whatsapp_group_share: "WhatsApp group",
  whatsapp_direct_share: "WhatsApp",
  scout_referral: "Scout referral",
  market_visit: "Market visit",
  word_of_mouth: "Word of mouth",
  organic_search: "Search",
  direct_unknown: "Direct",
  unattributed: "Unattributed",
};

const ALIASES = {
  facebook: "facebook_ads",
  fb: "facebook_ads",
  instagram: "instagram_ads",
  ig: "instagram_ads",
  insta: "instagram_ads",
  whatsapp: "whatsapp_direct_share",
  wa: "whatsapp_direct_share",
  market: "market_visit",
  google: "organic_search",
  direct: "direct_unknown",
  unknown: "unattributed",
  "": "unattributed",
  scout: "scout_referral",
  wom: "word_of_mouth",
};

export function channelLabel(slug) {
  return LABELS[slug] || slug;
}

export function normaliseChannel(raw) {
  const compact = String(raw ?? "")
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, "_");
  if (CHANNELS.includes(compact)) return compact;
  const key = compact.replace(/[^a-z0-9_]/g, "");
  if (ALIASES[key] ) return ALIASES[key];
  if (!key || key === "unknown") return "unattributed";
  return "unattributed";
}

/** Channels that do not have a public-page open event show opens as n/a. */
export const OPENS_NA_CHANNELS = new Set([
  "whatsapp_group_share",
  "whatsapp_direct_share",
  "whatsapp_ctwa_ads",
  "scout_referral",
  "market_visit",
  "word_of_mouth",
]);

function spendFor(spend, channel, from, to) {
  const rows = (spend || []).filter((row) => normaliseChannel(row.channel) === channel && row.date >= from && row.date <= to);
  if (!rows.length) return null;
  return rows.reduce((sum, row) => sum + Number(row.amountRwf || 0), 0);
}

/**
 * Cohort channel table. Rates stay inside one channel's own people.
 * Opens are n/a when that channel has no link-open events.
 */
export function channelTable(people, { from, to, windowDays = 14, opensByChannel = {}, spend = [], now = new Date() }) {
  const cohort = (people || []).filter((p) => !p.isInternal && !p.isSynthetic && inRange(p.createdAt, from, to));
  const groups = new Map();
  for (const person of cohort) {
    const channel = normaliseChannel(person.firstTouchChannel);
    if (!groups.has(channel)) groups.set(channel, []);
    groups.get(channel).push(person);
  }
  if (!groups.has("unattributed")) groups.set("unattributed", []);

  const rows = [];
  for (const [channel, members] of groups) {
    const sellers = members.filter((p) => p.role === "seller");
    const activated = sellers.filter((p) => {
      if (!p.activatedAt) return false;
      const limit = new Date(p.createdAt).getTime() + windowDays * 86400000;
      return new Date(p.activatedAt).getTime() <= limit;
    });
    const days = [];
    for (const person of activated) {
      const d = daysBetween(person.createdAt, person.activatedAt);
      if (d == null) continue;
      days.push(d);
    }
    const summary = timeSummary(days);
    const rate = safeRate(activated.length, sellers.length);
    const dead = deadRate(sellers, now);
    const explicitOpens = Object.prototype.hasOwnProperty.call(opensByChannel, channel)
      ? opensByChannel[channel]
      : undefined;
    const anyLink = members.some((p) => p.linkOpenAt);
    let opens = null;
    if (explicitOpens === null || OPENS_NA_CHANNELS.has(channel) && !anyLink && explicitOpens == null) {
      opens = null;
    } else if (typeof explicitOpens === "number") {
      opens = explicitOpens;
    } else if (anyLink) {
      opens = members.filter((p) => p.linkOpenAt).length;
    } else {
      opens = null;
    }
    const amount = spendFor(spend, channel, from, to);
    const wilsonBand = rate.ok ? wilson(activated.length, sellers.length) : sellers.length > 0 ? wilson(activated.length, sellers.length) : null;
    let quality = null;
    if (sellers.length >= 30 && wilsonBand) {
      const timeScore = summary.value == null ? 0.5 : Math.max(0, 1 - summary.value / 14);
      const deadScore = dead.tooEarly || dead.rate == null ? 0.5 : 1 - dead.rate;
      quality = 0.5 * wilsonBand.low + 0.3 * timeScore + 0.2 * deadScore;
    }
    rows.push({
      channel,
      label: channelLabel(channel),
      pinned: channel === "unattributed",
      opens,
      accounts: members.length,
      sellers: sellers.length,
      activatedSellers: { x: activated.length, of: sellers.length, rate: rate.ok ? rate.value : null },
      dead: dead.tooEarly ? { tooEarly: true, x: 0, of: 0 } : { tooEarly: false, x: dead.x, of: dead.of },
      medianDaysToActivate: { value: summary.value, n: summary.n, iqr: summary.iqr, individuals: summary.individuals },
      spendRwf: amount,
      costPerAccount: amount == null ? null : members.length > 0 ? Math.round(amount / members.length) : null,
      costPerActivation:
        amount == null
          ? null
          : activated.length === 0
            ? { text: `no activations yet · RWF ${Math.round(amount)} spent`, amount }
            : Math.round(amount / activated.length),
      wilson: wilsonBand,
      quality,
      qualityLabel: sellers.length >= 30 ? null : "Not enough data yet",
      lowSample: members.length < 10,
      personIds: members.map((p) => p.personId),
      activatedIds: activated.map((p) => p.personId),
      definitionId: "M-REACH",
      n: members.length,
    });
  }
  rows.sort((a, b) => {
    if (a.pinned && !b.pinned) return 1;
    if (b.pinned && !a.pinned) return -1;
    return b.accounts - a.accounts || a.channel.localeCompare(b.channel);
  });
  const accountSum = rows.reduce((s, r) => s + r.accounts, 0);
  const sellerSum = rows.reduce((s, r) => s + r.sellers, 0);
  const activatedSum = rows.reduce((s, r) => s + r.activatedSellers.x, 0);
  return {
    rows,
    totals: { accounts: accountSum, sellers: sellerSum, activatedSellers: activatedSum },
    funnelCheck: cohortFunnel(cohort.filter((p) => p.role === "seller"), { role: "seller", from, to, windowDays }).entryN,
  };
}
