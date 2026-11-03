/** Numbers in, sentence out. No model writes these. */

const PACE_WORD = {
  ahead: "ahead of pace",
  on_track: "on track",
  behind: "behind pace",
};

function bold(text) {
  return { text: String(text), emphasis: true };
}

function plain(text) {
  return { text: String(text), emphasis: false };
}

export function headline(input) {
  const segments = [];
  const sellers = input.sellers ?? 0;
  const sellerTarget = input.sellerTarget;
  const scouts = input.scouts ?? 0;
  const scoutTarget = input.scoutTarget;
  const buyers = input.buyers ?? 0;
  const quiet = sellers === 0 && scouts === 0 && buyers === 0;

  if (quiet) {
    segments.push(plain("No activations yet this week."));
  } else {
    segments.push(plain("This week we activated "));
    segments.push(bold(`${sellers} of ${sellerTarget ?? "—"}`));
    segments.push(plain(` target sellers (${PACE_WORD[input.sellerPace] || "on track"})`));
    segments.push(plain(", "));
    segments.push(bold(`${scouts} of ${scoutTarget ?? "—"}`));
    segments.push(plain(` scouts (${PACE_WORD[input.scoutPace] || "on track"}) and `));
    segments.push(bold(String(buyers)));
    if (input.buyerTarget != null) {
      segments.push(plain(` of ${input.buyerTarget} target buyers (${PACE_WORD[input.buyerPace] || "on track"}).`));
    } else {
      segments.push(plain(" buyers (no target set)."));
    }
  }

  if (input.waitingN > 0 && input.stuckN > 0) {
    if (segments.length) segments.push(plain(" "));
    segments.push(bold(String(input.waitingN)));
    segments.push(plain(` sellers are waiting at ${input.waitingStage || "Applied"}; `));
    segments.push(bold(String(input.stuckN)));
    segments.push(plain(` have waited over ${input.stuckThreshold ?? 2} days.`));
  } else if (quiet && input.waitingContact > 0) {
    segments.push(plain(" "));
    segments.push(bold(String(input.waitingContact)));
    segments.push(plain(" people are waiting for a first contact."));
  }

  if (input.bestChannel && input.worstChannel && input.channelEligible) {
    segments.push(plain(" "));
    segments.push(plain(`${input.bestChannel} is bringing the most activations; `));
    segments.push(plain(`${input.worstChannel} has ${input.worstAccounts} accounts and none activated.`));
  }

  if (input.supplyGap > 0 && input.supplyDistrict) {
    segments.push(plain(" "));
    segments.push(plain(`Birds wanted exceed birds listed by ${input.supplyGap}, mostly in ${input.supplyDistrict}.`));
  }

  if (input.confidence && input.confidence !== "high" && input.qualityCount > 0) {
    segments.push(plain(" "));
    segments.push(plain(`Numbers are ${input.confidence} confidence: `));
    segments.push(bold(String(input.qualityCount)));
    segments.push(plain(` ${input.qualityIssue || "data issues"}.`));
  }

  if (segments.length === 0) {
    return {
      segments: [plain("Not enough activity this week to summarise.")],
      text: "Not enough activity this week to summarise.",
    };
  }
  const text = segments.map((s) => s.text).join("");
  return { segments, text };
}

export function whatsAppSummary(text) {
  const clean = String(text || "")
    .replace(/\+?\d[\d\s•]{6,}/g, "")
    .replace(/\s+/g, " ")
    .trim();
  return clean.slice(0, 1200);
}
