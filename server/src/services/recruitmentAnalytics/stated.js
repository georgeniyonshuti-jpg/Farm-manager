/**
 * What people told us on the verification call.
 * Point in time. Not live listings, and not limited to the date range.
 * A blank answer is left out of n. It is not counted as zero birds.
 */

const BUCKETS = [
  { id: "1-99", label: "1–99", min: 1, max: 99 },
  { id: "100-499", label: "100–499", min: 100, max: 499 },
  { id: "500-999", label: "500–999", min: 500, max: 999 },
  { id: "1000+", label: "1000+", min: 1000, max: Infinity },
];

const BUYER_TYPES = ["butcher", "restaurant", "hotel", "vendor", "institution", "household"];
const BIRD_FORMS = ["slaughtered", "alive", "either"];

function whole(value) {
  if (value == null || value === "") return null;
  const n = Number(value);
  if (!Number.isInteger(n) || n < 0) return null;
  return n;
}

function flag(value) {
  if (value === true || value === false) return value;
  if (value === "true") return true;
  if (value === "false") return false;
  return null;
}

function districtOf(row) {
  const text = String(row.district || "").trim();
  return text || "District unknown";
}

function wanted(row, role) {
  if (!role || role === "all") return true;
  if (role === "seller") return row.want === "sell";
  if (role === "buyer") return row.want === "buy";
  if (role === "scout") return row.want === "scout";
  return true;
}

function selected(rows, filters) {
  const districts = filters.districts || [];
  return rows.filter((row) => {
    if (!wanted(row, filters.role)) return false;
    const district = districtOf(row);
    if (districts.length && !districts.includes(district)) return false;
    return true;
  });
}

function share(rows, field, definitionId) {
  const answered = rows.filter((row) => flag(row[field]) != null);
  return {
    x: answered.filter((row) => flag(row[field]) === true).length,
    of: answered.length,
    definitionId,
  };
}

function grouped(rows, key, allowed) {
  const known = [];
  let missingN = 0;
  let missingBirds = 0;
  for (const id of allowed) {
    const group = rows.filter((row) => String(row[key] || "") === id);
    if (!group.length) continue;
    known.push({
      id,
      n: group.length,
      birds: group.reduce((sum, row) => sum + whole(row.quantityMin), 0),
    });
  }
  for (const row of rows) {
    if (allowed.includes(String(row[key] || ""))) continue;
    missingN += 1;
    missingBirds += whole(row.quantityMin) || 0;
  }
  return { known, missing: { n: missingN, birds: missingBirds } };
}

function slaughterSentence(rows) {
  const districts = new Map();
  for (const row of rows) {
    const district = districtOf(row);
    if (!districts.has(district)) districts.set(district, { buyers: 0, sellersCannot: 0 });
    const slot = districts.get(district);
    if (row.want === "buy" && row.birdForm === "slaughtered") slot.buyers += 1;
    if (row.want === "sell" && flag(row.canSlaughter) === false) slot.sellersCannot += 1;
  }
  let best = null;
  for (const [district, slot] of districts) {
    if (slot.buyers < 1 || slot.sellersCannot < 1) continue;
    if (!best || slot.buyers > best.buyers || (slot.buyers === best.buyers && slot.sellersCannot > best.sellersCannot)) {
      best = { district, buyers: slot.buyers, sellersCannot: slot.sellersCannot };
    }
  }
  return best;
}

function balanceSentence(rows) {
  const districts = new Map();
  for (const row of rows) {
    const district = districtOf(row);
    if (!districts.has(district)) {
      districts.set(district, { readyBirds: 0, readyN: 0, demand: 0, demandN: 0 });
    }
    const slot = districts.get(district);
    const flock = whole(row.flockSize);
    const weeks = whole(row.readyInWeeks);
    if (row.want === "sell" && flock != null && (weeks === 0 || weeks === 1)) {
      slot.readyBirds += flock;
      slot.readyN += 1;
    }
    const floor = whole(row.quantityMin);
    if (row.want === "buy" && floor != null) {
      slot.demand += floor;
      slot.demandN += 1;
    }
  }
  let best = null;
  for (const [district, slot] of districts) {
    if (slot.readyN < 1 || slot.demandN < 1) continue;
    let gap = 0;
    let rule = null;
    if (slot.demand > slot.readyBirds * 1.5) {
      gap = slot.demand - slot.readyBirds;
      rule = "stated weekly demand above 1.5× birds they said are ready";
    } else if (slot.demand > 0 && slot.readyBirds > slot.demand * 1.5) {
      gap = slot.readyBirds - slot.demand;
      rule = "birds they said are ready above 1.5× stated weekly demand";
    }
    if (!rule) continue;
    if (!best || gap > best.gap) best = { district, gap, rule };
  }
  return best;
}

function compute(rows) {
  const sellers = rows.filter((row) => row.want === "sell");
  const withFlock = sellers.filter((row) => whole(row.flockSize) != null);
  const buckets = BUCKETS.map((bucket) => {
    const group = withFlock.filter((row) => {
      const size = whole(row.flockSize);
      return size >= bucket.min && size <= bucket.max;
    });
    return {
      id: bucket.id,
      label: bucket.label,
      n: group.length,
      birds: group.reduce((sum, row) => sum + whole(row.flockSize), 0),
    };
  });
  const ready = withFlock.filter((row) => {
    const weeks = whole(row.readyInWeeks);
    return weeks === 0 || weeks === 1;
  });
  const buyers = rows.filter((row) => row.want === "buy" && whole(row.quantityMin) != null);
  const byType = grouped(buyers, "buyerFor", BUYER_TYPES);
  const byForm = grouped(buyers, "birdForm", BIRD_FORMS);
  const scouts = rows.filter((row) => row.want === "scout");
  const visited = scouts.filter((row) => flag(row.willVisit) != null);
  const farms = scouts.filter((row) => whole(row.farmsKnown) != null);
  return {
    available: true,
    mode: "point-in-time",
    label: "What people told us on the call. Not limited to the date range. Not live listings.",
    sellers: {
      definitionId: "M-STATED-FLOCK",
      n: withFlock.length,
      flockBirds: withFlock.reduce((sum, row) => sum + whole(row.flockSize), 0),
      buckets,
      ready: {
        n: ready.length,
        birds: ready.reduce((sum, row) => sum + whole(row.flockSize), 0),
        definitionId: "M-STATED-READY",
      },
      canSlaughter: share(sellers, "canSlaughter", "M-STATED-SLAUGHTER"),
      canDeliver: share(sellers, "canDeliver", "M-STATED-DELIVER"),
    },
    buyers: {
      definitionId: "M-STATED-BUYER-WEEK",
      n: buyers.length,
      weeklyFloor: buyers.reduce((sum, row) => sum + whole(row.quantityMin), 0),
      byType: byType.known,
      missingType: byType.missing,
      byForm: byForm.known,
      missingForm: byForm.missing,
    },
    scouts: {
      definitionId: "M-STATED-VISIT",
      n: visited.length,
      willVisit: visited.filter((row) => flag(row.willVisit) === true).length,
      farms: {
        n: farms.length,
        sum: farms.reduce((sum, row) => sum + whole(row.farmsKnown), 0),
        definitionId: "M-STATED-FARMS",
      },
    },
    sentences: {
      slaughter: slaughterSentence(rows),
      balance: balanceSentence(rows),
    },
  };
}

/**
 * @param {object[]|{ available: false, reason?: string, rows?: object[] }|null|undefined} input
 * @param {{ role?: string, districts?: string[] }} [filters]
 */
export function statedBlock(input, filters = {}) {
  if (Array.isArray(input)) return compute(selected(input, filters));
  if (!input || input.available === false) {
    return {
      available: false,
      reason: input?.reason || "Call answers are not loaded.",
      mode: "point-in-time",
    };
  }
  return compute(selected(input.rows || [], filters));
}
