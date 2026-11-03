/** Recommended actions. Each one names its rule. Thresholds are starting guesses. */

export function recommendedActions(ctx) {
  const actions = [];
  const channels = ctx.channels || [];
  for (const row of channels) {
    if (row.opens != null && row.opens >= 30 && row.accounts === 0) {
      actions.push({
        id: "R1",
        rule: "A paid channel has at least 30 link opens in 14 days and 0 accounts",
        text: `Pause or fix ${row.label}: ${row.opens} opens, 0 accounts in 14 days.`,
        owner: "Ops lead",
        evidence: { opens: row.opens, accounts: 0 },
      });
    }
  }
  const unattributed = channels.find((c) => c.channel === "unattributed");
  const accounts = channels.reduce((s, c) => s + (c.accounts || 0), 0);
  if (accounts > 0 && unattributed && unattributed.accounts / accounts > 0.2) {
    actions.push({
      id: "R4",
      rule: "Unattributed share of accounts is above 20%",
      text: "Fix attribution: add tracked links to WhatsApp shares.",
      owner: "Ops lead",
      evidence: { unattributed: unattributed.accounts, accounts },
    });
  }
  if ((ctx.stuckCount || 0) > 0) {
    actions.push({
      id: "R5",
      rule: "People stuck beyond the stage threshold",
      text: `Call these ${ctx.stuckCount} people today (open list).`,
      owner: "Recruiters",
      evidence: { count: ctx.stuckCount },
    });
  }
  if ((ctx.scoutsApprovedNoLot || 0) > 0) {
    actions.push({
      id: "R6",
      rule: "A scout approved at least 14 days ago has no verified lot",
      text: `Check in with ${ctx.scoutsApprovedNoLot} scouts who have not started.`,
      owner: "Scout lead",
      evidence: { count: ctx.scoutsApprovedNoLot },
    });
  }
  if ((ctx.listingsUnverified48h || 0) > 0) {
    actions.push({
      id: "R10",
      rule: "Listings awaiting verification for more than 48 hours",
      text: `Verify ${ctx.listingsUnverified48h} listings.`,
      owner: "Verification team",
      evidence: { count: ctx.listingsUnverified48h },
    });
  }
  if ((ctx.sellersNoListing || 0) > 0) {
    actions.push({
      id: "R11",
      rule: "Sellers who joined at least 5 days ago with no listing",
      text: `Help ${ctx.sellersNoListing} sellers create their first listing.`,
      owner: "Recruiters",
      evidence: { count: ctx.sellersNoListing },
    });
  }
  if (!ctx.spendEnteredThisWeek || !ctx.trackedLinksThisWeek) {
    actions.push({
      id: "R13",
      rule: "No tracked links or spend entered this week",
      text: "Enter this week's spend so cost per activation works.",
      owner: "Ops lead",
      evidence: { spendEntered: Boolean(ctx.spendEnteredThisWeek), links: Boolean(ctx.trackedLinksThisWeek) },
    });
  }
  for (const failure of ctx.reconciliationFailures || []) {
    actions.push({
      id: "R12",
      rule: "Any negative duration or invariant failure",
      text: `Data issue: ${failure.id}. Fix before trusting the affected number.`,
      owner: "Developer",
      evidence: failure,
    });
  }
  const supply = ctx.supplySentences;
  if (supply?.recruitSellers) {
    actions.push({
      id: "R8",
      rule: supply.recruitSellers.rule,
      text: `Recruit sellers in ${supply.recruitSellers.district}.`,
      owner: "Recruiters",
      evidence: supply.recruitSellers,
    });
  }
  if (supply?.recruitBuyers) {
    actions.push({
      id: "R9",
      rule: supply.recruitBuyers.rule,
      text: `Recruit buyers in ${supply.recruitBuyers.district}; send scouts to butcheries and restaurants.`,
      owner: "Scout lead",
      evidence: supply.recruitBuyers,
    });
  }
  return actions;
}
