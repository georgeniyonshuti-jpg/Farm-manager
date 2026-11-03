/**
 * Metric ids, labels, and plain-English definitions.
 * Widgets show these; they do not invent their own wording.
 */

export const DEFINITIONS_VERSION = "2026-10-23.2";

/** @type {Record<string, { id: string, label: string, definition: string, formula: string }>} */
export const DEFINITIONS = {
  "M-SELLER-ACTIVATED": {
    id: "M-SELLER-ACTIVATED",
    label: "Sellers live and verified",
    definition:
      "Sellers whose first listing is live (open or partial) and verified, in the current Kigali week. This is the weekly target.",
    formula: "count of sellers with activated_at inside the current Monday–Sunday week",
  },
  "M-SELLER-LIVE-UNVERIFIED": {
    id: "M-SELLER-LIVE-UNVERIFIED",
    label: "Sellers live, not verified",
    definition:
      "Sellers with a live listing (open or partial) whose verification is pending review or rejected. Shown beside the target. It is not a second target.",
    formula: "count of sellers with live_unverified_at inside the current week",
  },
  "M-BUYER-ACTIVATED": {
    id: "M-BUYER-ACTIVATED",
    label: "Buyers activated",
    definition:
      "Buyers with a profile and a first demand, lead, or match. Signing up alone does not count.",
    formula: "count of buyers with activated_at inside the current week",
  },
  "M-SCOUT-ACTIVATED": {
    id: "M-SCOUT-ACTIVATED",
    label: "Scouts activated",
    definition:
      "Scouts who are approved and have at least one verified lot. Approved alone does not count.",
    formula: "count of scouts with activated_at inside the current week",
  },
  "M-SCOUT-PRODUCING": {
    id: "M-SCOUT-PRODUCING",
    label: "Scouts producing",
    definition: "Approved scouts with at least one verified lot in the current Kigali week.",
    formula: "count of scouts with a verified lot timestamp inside the current week",
  },
  "M-PROBATION": {
    id: "M-PROBATION",
    label: "Passed probation",
    definition:
      "Sellers whose first paid sale was within 21 days of going live, plus scouts with at least 8 verified lots within 21 days of approval. Counted over the last 3 Kigali weeks.",
    formula: "sellers with 0 <= productive_at - activated_at <= 21 days, plus scouts with 8 verified lots in the 21 days after approval, pass date inside the rolling 3 weeks",
  },
  "M-REACH": {
    id: "M-REACH",
    label: "People who reached a step",
    definition:
      "Of people who joined in the selected period, how many reached this step within 14 days. Missing earlier steps are filled in and flagged.",
    formula: "distinct people with entry in range and step time within the window",
  },
  "M-STEP-RATE": {
    id: "M-STEP-RATE",
    label: "Step conversion",
    definition: "People at this step divided by people at the previous step. Printed as x of n.",
    formula: "reach(k) / reach(k-1)",
  },
  "M-TOP-RATE": {
    id: "M-TOP-RATE",
    label: "Conversion from entry",
    definition: "People at this step divided by people who joined in the period.",
    formula: "reach(k) / reach(entry)",
  },
  "M-MEDIAN-TTS": {
    id: "M-MEDIAN-TTS",
    label: "Median days between steps",
    definition:
      "The middle number of days between two steps, only where the later step is not before the earlier one. Fewer than 5 people: individual values, not a median.",
    formula: "median(t_b - t_a) where t_b >= t_a",
  },
  "M-PERIOD-CHANGE": {
    id: "M-PERIOD-CHANGE",
    label: "Change vs previous period",
    definition:
      "This period minus the previous period of the same length. A percent is shown only when the previous value is at least 5.",
    formula: "current - previous; percent only if previous >= 5",
  },
  "M-PACE": {
    id: "M-PACE",
    label: "Pace vs weekly target",
    definition:
      "Ahead, on track, or behind, compared with how much of the Kigali week has passed. One extra unit of slack is allowed because weekly counts jump.",
    formula: "expected = target × elapsed fraction; slack = max(15% of target, 1)",
  },
  "M-STUCK": {
    id: "M-STUCK",
    label: "Stuck",
    definition:
      "People still in a stage longer than the threshold, not yet activated, and not dead. The list is the count.",
    formula: "now − stage_entered_at > threshold for that stage",
  },
  "M-DEAD": {
    id: "M-DEAD",
    label: "Dead or dormant",
    definition:
      "No activity for 14 days and not activated, or marked unreachable or not a fit. People younger than 14 days are too early to judge, unless they were marked.",
    formula: "inactive 14 days and not activated, or side state",
  },
  "M-DEAD-RATE": {
    id: "M-DEAD-RATE",
    label: "Dead rate",
    definition: "Dead people divided by people old enough to judge. If nobody is old enough, the result is too early, not 0%.",
    formula: "dead / people at least 14 days old",
  },
  "M-ATTR-HEALTH": {
    id: "M-ATTR-HEALTH",
    label: "Attribution health",
    definition:
      "Share of accounts whose channel came from a tracked link, plus how many only have a self-reported source, plus how many are unattributed.",
    formula: "tracked-link accounts / all accounts in the cohort",
  },
  "M-CPA": {
    id: "M-CPA",
    label: "Cost per account",
    definition: "Ad spend divided by accounts for that channel. If spend is missing, the page says to add spend.",
    formula: "spend / accounts",
  },
  "M-CPAS": {
    id: "M-CPAS",
    label: "Cost per activation",
    definition:
      "Ad spend divided by activated people. If nobody was activated, the page shows the spend and does not divide.",
    formula: "spend / activated",
  },
  "M-QUALITY": {
    id: "M-QUALITY",
    label: "Channel quality",
    definition:
      "Only when a channel has at least 30 accounts. Score uses the Wilson lower bound of the activation rate (weight 0.5), a faster median time to activate (weight 0.3), and a lower dead rate (weight 0.2).",
    formula: "0.5 × wilson_low + 0.3 × time_score + 0.2 × (1 − dead_rate)",
  },
  "M-SUPPLY-LIVE": {
    id: "M-SUPPLY-LIVE",
    label: "Live supply",
    definition: "Birds on listings that are live and verified and whose availability window includes today.",
    formula: "sum of birds on open or partial verified lots covering today",
  },
  "M-SUPPLY-FCST": {
    id: "M-SUPPLY-FCST",
    label: "Supply forecast",
    definition:
      "Birds expected to reach market in the next 14 days, from flock placement dates. Shown only when those dates exist, and always labelled forecast.",
    formula: "placed birds on flocks whose market window falls in the next 14 days",
  },
  "M-DEMAND": {
    id: "M-DEMAND",
    label: "Demand",
    definition: "Birds wanted on open buyer requests. If that is missing, a recent order run-rate is labelled proxy.",
    formula: "sum of birds_needed on open demands",
  },
  "M-COVERAGE": {
    id: "M-COVERAGE",
    label: "Coverage ratio",
    definition: "Live verified birds divided by birds wanted, per district. A starting healthy band is 0.8 to 1.5.",
    formula: "supply / demand",
  },
  "M-LISTING-RESPONSE": {
    id: "M-LISTING-RESPONSE",
    label: "Listing response rate",
    definition: "Share of live listings that received a buyer inquiry within 72 hours.",
    formula: "listings with an inquiry in 72 hours / live listings",
  },
  "M-TTFI": {
    id: "M-TTFI",
    label: "Time to first inquiry",
    definition: "Median hours from a listing going live to the first inquiry.",
    formula: "median(first_inquiry_at − listing_live_at)",
  },
  "M-MATCH": {
    id: "M-MATCH",
    label: "Match rate",
    definition: "Share of buyer requests that have at least one listing in the same district.",
    formula: "demands with a district match / demands",
  },
  "M-FILL": {
    id: "M-FILL",
    label: "Fill rate",
    definition: "Birds sold divided by birds listed, for listings whose window has ended.",
    formula: "birds sold / birds listed on ended lots",
  },
  "M-ACTIVE-SELL": {
    id: "M-ACTIVE-SELL",
    label: "Active sellers",
    definition: "Sellers with a live listing in the last 14 days.",
    formula: "distinct sellers with a live lot in 14 days",
  },
  "M-ACTIVE-BUY": {
    id: "M-ACTIVE-BUY",
    label: "Active buyers",
    definition: "Buyers with an inquiry or order in the last 30 days.",
    formula: "distinct buyers with a lead, demand, or match in 30 days",
  },
  "M-SC-TENURE": {
    id: "M-SC-TENURE",
    label: "Days since approved",
    definition: "Days since the scout application was approved.",
    formula: "now − approved_at",
  },
  "M-SC-LOTS": {
    id: "M-SC-LOTS",
    label: "Verified lots",
    definition: "Verified lots this scout submitted in the selected period.",
    formula: "count of verified lots in range",
  },
  "M-SC-SELLERS": {
    id: "M-SC-SELLERS",
    label: "Sellers brought",
    definition: "Seller accounts referred by this scout, or whose first lot this scout verified.",
    formula: "distinct sellers with referred_by_scout_id or scout-verified first lot",
  },
  "M-SC-BIRDS": {
    id: "M-SC-BIRDS",
    label: "Birds verified",
    definition: "Birds on this scout's verified lots in the period.",
    formula: "sum of bird_count on verified lots",
  },
  "M-SC-ATTAIN": {
    id: "M-SC-ATTAIN",
    label: "Target attainment",
    definition:
      "Actual divided by the per-scout weekly target, only for weeks after the 14-day ramp. New scouts are Ramping, not Behind.",
    formula: "actual / target after ramp",
  },
  "M-SC-UNPAID": {
    id: "M-SC-UNPAID",
    label: "Unpaid commission",
    definition: "Commission on verified outcomes that is accrued and not yet paid, in RWF.",
    formula: "sum of accrued commission_amount_rwf",
  },
  "M-STATED-FLOCK": {
    id: "M-STATED-FLOCK",
    label: "Birds in the flock, as told on the call",
    definition:
      "Sum of flock sizes sellers gave on the verification call. A seller who did not give a number is left out of n. This is not a live listing.",
    formula: "sum of flock_size where flock_size is not null",
  },
  "M-STATED-READY": {
    id: "M-STATED-READY",
    label: "Birds they said are ready soon",
    definition:
      "Flock size for sellers who said the birds are ready now or within 1 week. A missing week is left out, not treated as ready.",
    formula: "sum of flock_size where ready_in_weeks is 0 or 1",
  },
  "M-STATED-SLAUGHTER": {
    id: "M-STATED-SLAUGHTER",
    label: "Sellers who can slaughter",
    definition: "Sellers who said they can slaughter on the farm, out of sellers who answered that question.",
    formula: "yes answers / sellers who answered can_slaughter",
  },
  "M-STATED-DELIVER": {
    id: "M-STATED-DELIVER",
    label: "Sellers who can deliver",
    definition: "Sellers who said they can deliver, out of sellers who answered that question.",
    formula: "yes answers / sellers who answered can_deliver",
  },
  "M-STATED-BUYER-WEEK": {
    id: "M-STATED-BUYER-WEEK",
    label: "Birds buyers said they need in a week",
    definition:
      "Sum of the fewest birds each buyer said they need in a normal week. A buyer who gave no number is left out of n.",
    formula: "sum of quantity_min for buyers where quantity_min is not null",
  },
  "M-STATED-VISIT": {
    id: "M-STATED-VISIT",
    label: "Scouts who will visit",
    definition: "Scouts who said they will visit farms, out of scouts who answered that question.",
    formula: "yes answers / scouts who answered will_visit",
  },
  "M-STATED-FARMS": {
    id: "M-STATED-FARMS",
    label: "Farms scouts said they know",
    definition: "Sum of farms scouts said they already know. A blank answer is left out of n.",
    formula: "sum of farms_known where farms_known is not null",
  },
};

export function definition(id) {
  return DEFINITIONS[id] || null;
}
