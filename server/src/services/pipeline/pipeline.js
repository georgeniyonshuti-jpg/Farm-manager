/**
 * Poultry supply pipeline — ready-window math, flock→lot snapshot, match helpers.
 */

export const DEFAULT_SCOUT_COMMISSION_RATE_PCT = 2;

/**
 * @param {string | Date | null | undefined} placementDate
 * @param {number | null | undefined} dayMin
 * @param {number | null | undefined} dayMax
 * @returns {{ readyFrom: string, readyTo: string } | null}
 */
export function readyWindowFromPlacement(placementDate, dayMin, dayMax) {
  if (!placementDate) return null;
  const base = new Date(`${String(placementDate).slice(0, 10)}T12:00:00Z`);
  if (Number.isNaN(base.getTime())) return null;
  const min = Number.isFinite(Number(dayMin)) ? Number(dayMin) : 35;
  const max = Number.isFinite(Number(dayMax)) ? Number(dayMax) : Math.max(min, 42);
  const from = new Date(base);
  from.setUTCDate(from.getUTCDate() + Math.max(0, min));
  const to = new Date(base);
  to.setUTCDate(to.getUTCDate() + Math.max(min, max));
  return {
    readyFrom: from.toISOString().slice(0, 10),
    readyTo: to.toISOString().slice(0, 10),
  };
}

/**
 * Africa/Kigali week bounds starting Monday for this week, next, week after.
 * @param {Date} [now]
 */
export function forwardWeekBuckets(now = new Date()) {
  const kigali = new Date(now.toLocaleString("en-US", { timeZone: "Africa/Kigali" }));
  const day = kigali.getDay();
  const mondayOffset = day === 0 ? -6 : 1 - day;
  const monday = new Date(kigali);
  monday.setHours(0, 0, 0, 0);
  monday.setDate(monday.getDate() + mondayOffset);

  const buckets = [];
  for (let i = 0; i < 3; i += 1) {
    const start = new Date(monday);
    start.setDate(monday.getDate() + i * 7);
    const end = new Date(start);
    end.setDate(start.getDate() + 6);
    buckets.push({
      key: i === 0 ? "this_week" : i === 1 ? "next_week" : "week_after",
      label: i === 0 ? "This week" : i === 1 ? "Next week" : "Week after",
      from: start.toISOString().slice(0, 10),
      to: end.toISOString().slice(0, 10),
    });
  }
  return buckets;
}

export function remainingBirds(birdCount, matchedBirds) {
  return Math.max(0, Number(birdCount || 0) - Number(matchedBirds || 0));
}

/** Inclusive date ranges as YYYY-MM-DD. */
export function dateRangesOverlap(aFrom, aTo, bFrom, bTo) {
  if (!aFrom || !aTo || !bFrom || !bTo) return false;
  return String(aFrom) <= String(bTo) && String(bFrom) <= String(aTo);
}

export function readyWindowHitsThisOrNextWeek(readyFrom, readyTo, now = new Date()) {
  const buckets = forwardWeekBuckets(now);
  return (
    dateRangesOverlap(readyFrom, readyTo, buckets[0].from, buckets[0].to) ||
    dateRangesOverlap(readyFrom, readyTo, buckets[1].from, buckets[1].to)
  );
}

export function shouldAutoDraftLot(input) {
  if (input?.hasOpenLot) return false;
  if (!(Number(input?.liveEstimate) > 0)) return false;
  if (!input?.readyFrom || !input?.readyTo) return false;
  return true;
}

/** Keep bird_count > 0 (DB check). Close by status when nothing is left. */
export function planManagedLotSync({ liveEstimate, matchedBirds, currentStatus }) {
  if (currentStatus === "cancelled" || currentStatus === "expired") {
    return { skip: true };
  }
  const live = Math.max(0, Number(liveEstimate) || 0);
  const matched = Math.max(0, Number(matchedBirds) || 0);
  if (live <= 0) {
    return {
      skip: false,
      birdCount: null,
      saleableBirds: 0,
      status: matched > 0 ? "matched" : "cancelled",
    };
  }
  return {
    skip: false,
    birdCount: matched + live,
    saleableBirds: live,
    status: matched > 0 ? "partial" : currentStatus === "draft" ? "open" : currentStatus,
  };
}

export function deriveLotStatusAfterMatch(birdCount, matchedBirds, currentStatus) {
  if (currentStatus === "cancelled" || currentStatus === "expired") return currentStatus;
  const left = remainingBirds(birdCount, matchedBirds);
  if (left <= 0) return "matched";
  if (matchedBirds > 0) return "partial";
  return currentStatus === "draft" ? "draft" : "open";
}

export function deriveDemandStatusAfterMatch(birdsNeeded, filledBirds, currentStatus) {
  if (currentStatus === "cancelled") return currentStatus;
  const left = Math.max(0, Number(birdsNeeded || 0) - Number(filledBirds || 0));
  if (left <= 0) return "filled";
  if (filledBirds > 0) return "partial";
  return "open";
}

export function canAccessPipelineDesk(user) {
  const role = user?.role;
  return role === "superuser" || role === "sales_coordinator";
}

export function canScoutPipeline(user) {
  const role = user?.role;
  return (
    role === "superuser" ||
    role === "sales_coordinator" ||
    role === "vet" ||
    role === "vet_manager" ||
    role === "manager" ||
    role === "company_admin"
  );
}

export function canOptInManagedFlock(user) {
  const role = user?.role;
  return (
    role === "superuser" ||
    role === "sales_coordinator" ||
    role === "manager" ||
    role === "company_admin" ||
    role === "vet_manager"
  );
}

export function isBuyerRole(user) {
  return user?.role === "buyer";
}

export function canBrowseMarket(user) {
  if (!user) return false;
  if (canAccessPipelineDesk(user)) return true;
  return isBuyerRole(user);
}

export function canListFarmerLots(user) {
  const role = user?.role;
  return role === "company_admin" || role === "manager" || role === "superuser";
}

/**
 * Scout commission on delivered trade.
 * amount = birds * weightKg * pricePerKg * (ratePct / 100)
 */
export function computeScoutCommission(input) {
  const birds = Number(input.birds || 0);
  const weight =
    Number(input.avgWeightKg) > 0
      ? Number(input.avgWeightKg)
      : Number(input.expectedWeightKg) > 0
        ? Number(input.expectedWeightKg)
        : 0;
  const price =
    Number(input.agreedPricePerKg) > 0
      ? Number(input.agreedPricePerKg)
      : Number(input.askPricePerKg) > 0
        ? Number(input.askPricePerKg)
        : 0;
  const ratePct =
    Number(input.ratePct) > 0 ? Number(input.ratePct) : DEFAULT_SCOUT_COMMISSION_RATE_PCT;
  if (birds <= 0 || weight <= 0 || price <= 0) {
    return { ratePct, amountRwf: 0, ok: false };
  }
  const amountRwf = Math.round(birds * weight * price * (ratePct / 100) * 100) / 100;
  return { ratePct, amountRwf, ok: amountRwf > 0 };
}

export function estimateLotCommission(lot, ratePct = DEFAULT_SCOUT_COMMISSION_RATE_PCT) {
  const birds = Number(lot.remainingBirds ?? lot.saleableBirds ?? lot.birdCount ?? 0);
  return computeScoutCommission({
    birds,
    avgWeightKg: lot.avgWeightKg,
    expectedWeightKg: lot.expectedWeightKg,
    askPricePerKg: lot.askPricePerKg,
    ratePct,
  });
}

export async function loadFlockLotSnapshot(dbQuery, flockId) {
  const flockR = await dbQuery(
    `SELECT f.id::text AS id,
            f.company_id::text AS "companyId",
            f.breed_code AS "breedCode",
            f.placement_date AS "placementDate",
            f.initial_count AS "initialCount",
            f.verified_live_count AS "verifiedLiveCount",
            f.target_weight_kg AS "targetWeightKg",
            f.target_slaughter_day_min AS "targetSlaughterDayMin",
            f.target_slaughter_day_max AS "targetSlaughterDayMax",
            f.code AS code,
            COALESCE(bn.name, '') AS "barnName"
       FROM poultry_flocks f
       LEFT JOIN poultry_barn_names bn ON bn.id = f.barn_name_id
      WHERE f.id = $1::uuid`,
    [flockId]
  );
  const flock = flockR.rows[0];
  if (!flock) return null;

  const mortR = await dbQuery(
    `SELECT COALESCE(SUM(count), 0)::int AS mortality
       FROM flock_mortality_events
      WHERE flock_id = $1::uuid
        AND submission_status IS DISTINCT FROM 'rejected'
        AND COALESCE(affects_live_count, true) = true`,
    [flockId]
  ).catch(() => ({ rows: [{ mortality: 0 }] }));

  const slaughterR = await dbQuery(
    `SELECT COALESCE(SUM(birds_slaughtered), 0)::int AS slaughtered
       FROM flock_slaughter_events
      WHERE flock_id = $1::uuid`,
    [flockId]
  ).catch(() => ({ rows: [{ slaughtered: 0 }] }));

  const salesR = await dbQuery(
    `SELECT COALESCE(SUM(number_of_birds), 0)::int AS sold
       FROM poultry_sales_orders
      WHERE flock_id = $1::uuid
        AND submission_status IS DISTINCT FROM 'rejected'`,
    [flockId]
  ).catch(() => ({ rows: [{ sold: 0 }] }));

  const weighR = await dbQuery(
    `SELECT avg_weight_kg AS "avgWeightKg"
       FROM weigh_ins
      WHERE flock_id = $1::uuid
      ORDER BY weigh_date DESC
      LIMIT 1`,
    [flockId]
  ).catch(() => ({ rows: [] }));

  const mortality = Number(mortR.rows[0]?.mortality ?? 0);
  const slaughtered = Number(slaughterR.rows[0]?.slaughtered ?? 0);
  const sold = Number(salesR.rows[0]?.sold ?? 0);
  const initial = Number(flock.initialCount ?? 0);
  const verified = flock.verifiedLiveCount != null ? Number(flock.verifiedLiveCount) : null;
  const liveEstimate =
    verified != null && Number.isFinite(verified)
      ? Math.max(0, verified)
      : Math.max(0, initial - mortality - Math.max(slaughtered, sold));

  const window = readyWindowFromPlacement(
    flock.placementDate,
    flock.targetSlaughterDayMin,
    flock.targetSlaughterDayMax
  );

  return {
    flockId: flock.id,
    companyId: flock.companyId,
    breedCode: flock.breedCode,
    birdCount: Math.max(1, liveEstimate || initial || 1),
    avgWeightKg: weighR.rows[0]?.avgWeightKg != null ? Number(weighR.rows[0].avgWeightKg) : null,
    expectedWeightKg: flock.targetWeightKg != null ? Number(flock.targetWeightKg) : null,
    liveEstimate,
    readyFrom: window?.readyFrom ?? null,
    readyTo: window?.readyTo ?? null,
    placementDate: flock.placementDate ? String(flock.placementDate).slice(0, 10) : null,
    farmLabel: [flock.code, flock.barnName].filter(Boolean).join(" · ") || flock.code || null,
  };
}

export function mapLotRow(row) {
  if (!row) return null;
  return {
    id: row.id,
    source: row.source,
    companyId: row.companyId ?? row.company_id ?? null,
    flockId: row.flockId ?? row.flock_id ?? null,
    farmLabel: row.farmLabel ?? row.farm_label ?? null,
    contactPhone: row.contactPhone ?? row.contact_phone ?? null,
    district: row.district ?? null,
    birdCount: Number(row.birdCount ?? row.bird_count),
    saleableBirds:
      row.saleableBirds != null || row.saleable_birds != null
        ? Number(row.saleableBirds ?? row.saleable_birds)
        : null,
    breedCode: row.breedCode ?? row.breed_code ?? null,
    avgWeightKg:
      row.avgWeightKg != null || row.avg_weight_kg != null
        ? Number(row.avgWeightKg ?? row.avg_weight_kg)
        : null,
    expectedWeightKg:
      row.expectedWeightKg != null || row.expected_weight_kg != null
        ? Number(row.expectedWeightKg ?? row.expected_weight_kg)
        : null,
    readyFrom: row.readyFrom ?? row.ready_from,
    readyTo: row.readyTo ?? row.ready_to,
    askPricePerKg:
      row.askPricePerKg != null || row.ask_price_per_kg != null
        ? Number(row.askPricePerKg ?? row.ask_price_per_kg)
        : null,
    farmerCanSlaughter: Boolean(row.farmerCanSlaughter ?? row.farmer_can_slaughter),
    deliveryAvailable: Boolean(row.deliveryAvailable ?? row.delivery_available),
    minOrderBirds:
      row.minOrderBirds != null || row.min_order_birds != null
        ? Math.round(Number(row.minOrderBirds ?? row.min_order_birds))
        : null,
    status: row.status,
    verificationStatus: row.verificationStatus ?? row.verification_status ?? "verified",
    scoutedBy: row.scoutedBy ?? row.scouted_by ?? null,
    listedBy: row.listedBy ?? row.listed_by ?? null,
    optedInAt: row.optedInAt ?? row.opted_in_at ?? null,
    notes: row.notes ?? null,
    publicRef: row.publicRef ?? row.public_ref ?? null,
    productType: row.productType ?? row.product_type ?? "broiler_birds",
    visibilityTier: row.visibilityTier ?? row.visibility_tier ?? "brokered_public",
    rankEligible: row.rankEligible !== false && row.rank_eligible !== false,
    placementDate: row.placementDate ?? row.placement_date ?? null,
    scoutConfirmedAt: row.scoutConfirmedAt ?? row.scout_confirmed_at ?? null,
    scoutConfirmedBy: row.scoutConfirmedBy ?? row.scout_confirmed_by ?? null,
    farmProfileId: row.farmProfileId ?? row.farm_profile_id ?? null,
    publicTitle: row.publicTitle ?? row.public_title ?? null,
    publicStory: row.publicStory ?? row.public_story ?? null,
    processingNotes: row.processingNotes ?? row.processing_notes ?? null,
    matchedBirds: row.matchedBirds != null ? Number(row.matchedBirds) : undefined,
    remainingBirds: row.remainingBirds != null ? Number(row.remainingBirds) : undefined,
    createdAt: row.createdAt ?? row.created_at ?? null,
  };
}

export const LOT_SELECT = `
  l.id::text AS id,
  l.source,
  l.company_id::text AS "companyId",
  l.flock_id::text AS "flockId",
  l.farm_label AS "farmLabel",
  l.contact_phone AS "contactPhone",
  l.district,
  l.bird_count AS "birdCount",
  l.saleable_birds AS "saleableBirds",
  l.breed_code AS "breedCode",
  l.avg_weight_kg AS "avgWeightKg",
  l.expected_weight_kg AS "expectedWeightKg",
  l.ready_from AS "readyFrom",
  l.ready_to AS "readyTo",
  l.ask_price_per_kg AS "askPricePerKg",
  l.farmer_can_slaughter AS "farmerCanSlaughter",
  l.delivery_available AS "deliveryAvailable",
  l.min_order_birds AS "minOrderBirds",
  l.status,
  COALESCE(l.verification_status, 'verified') AS "verificationStatus",
  l.scouted_by::text AS "scoutedBy",
  l.listed_by::text AS "listedBy",
  l.opted_in_at AS "optedInAt",
  l.notes,
  l.public_ref AS "publicRef",
  COALESCE(l.product_type, 'broiler_birds') AS "productType",
  COALESCE(l.visibility_tier, 'brokered_public') AS "visibilityTier",
  COALESCE(l.rank_eligible, true) AS "rankEligible",
  l.placement_date AS "placementDate",
  l.scout_confirmed_at AS "scoutConfirmedAt",
  l.scout_confirmed_by::text AS "scoutConfirmedBy",
  l.farm_profile_id::text AS "farmProfileId",
  l.public_title AS "publicTitle",
  l.public_story AS "publicStory",
  l.processing_notes AS "processingNotes",
  l.created_at AS "createdAt"
`;
