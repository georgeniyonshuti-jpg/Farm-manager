import {
  LOT_SELECT,
  loadFlockLotSnapshot,
  mapLotRow,
  planManagedLotSync,
  shouldAutoDraftLot,
} from "./pipeline.js";
import { loadClevaRunRecentConfirm } from "./sellingWeek.js";

const OPEN_LOT = `l.status IN ('draft', 'open', 'partial')`;

function isUniqueViolation(err) {
  return err?.code === "23505" || /duplicate key/i.test(String(err?.message || ""));
}

export async function refreshOpenManagedLots(dbQuery) {
  const r = await dbQuery(
    `SELECT DISTINCT l.flock_id::text AS "flockId"
       FROM pipeline_lots l
      WHERE l.source = 'managed_flock'
        AND ${OPEN_LOT}
        AND l.flock_id IS NOT NULL
      LIMIT 200`
  );
  const refreshed = [];
  for (const row of r.rows) {
    const syn = await syncManagedLotFromFlock(dbQuery, row.flockId);
    if (syn?.lotId) refreshed.push(syn);
  }
  return refreshed;
}

export async function autoDraftReadyLots(dbQuery, now = new Date()) {
  const refreshed = await refreshOpenManagedLots(dbQuery);
  const flocksR = await dbQuery(
    `SELECT f.id::text AS id
       FROM poultry_flocks f
      WHERE f.status = 'active'
        AND f.placement_date IS NOT NULL
        AND NOT EXISTS (
          SELECT 1 FROM pipeline_lots l
           WHERE l.flock_id = f.id
             AND ${OPEN_LOT}
        )
      ORDER BY f.placement_date ASC
      LIMIT 200`
  );
  const drafted = [];
  for (const row of flocksR.rows) {
    const snap = await loadFlockLotSnapshot(dbQuery, row.id);
    if (
      !shouldAutoDraftLot({
        readyFrom: snap?.readyFrom,
        readyTo: snap?.readyTo,
        liveEstimate: snap?.liveEstimate,
        hasOpenLot: false,
        now,
      })
    ) {
      continue;
    }
    try {
      let companyVerified = "pending";
      try {
        const c = await dbQuery(
          `SELECT COALESCE(verification_status, 'verified') AS "verificationStatus"
             FROM companies WHERE id = $1::uuid`,
          [snap.companyId]
        );
        companyVerified = c.rows[0]?.verificationStatus || "pending";
      } catch {
        companyVerified = "pending";
      }
      const recent = await loadClevaRunRecentConfirm(dbQuery, {
        source: "managed_flock",
        flockId: snap.flockId,
        companyVerified,
      });
      const ins = await dbQuery(
        `INSERT INTO pipeline_lots
           (source, company_id, flock_id, farm_label, district,
            bird_count, saleable_birds, breed_code, avg_weight_kg, expected_weight_kg,
            ready_from, ready_to, placement_date, rank_eligible,
            scout_confirmed_at, status, verification_status, notes)
         VALUES
           ('managed_flock', $1::uuid, $2::uuid, $3, NULL,
            $4, $4, $5, $6, $7,
            $8::date, $9::date, $10::date, false,
            $11::timestamptz, 'open', 'pending_review', $12)
         RETURNING id::text AS id`,
        [
          snap.companyId,
          snap.flockId,
          snap.farmLabel,
          Math.max(1, Number(snap.liveEstimate) || Number(snap.birdCount) || 1),
          snap.breedCode,
          snap.avgWeightKg,
          snap.expectedWeightKg,
          snap.readyFrom,
          snap.readyTo,
          snap.placementDate,
          recent.confirm ? now : null,
          "Auto-drafted from flock chicks-in date",
        ]
      );
      drafted.push(ins.rows[0]?.id);
    } catch (err) {
      if (!isUniqueViolation(err)) throw err;
    }
  }
  return { drafted: drafted.filter(Boolean), refreshed, scanned: flocksR.rows.length };
}

export async function syncManagedLotFromFlock(dbQuery, flockId) {
  if (!flockId) return null;
  const snap = await loadFlockLotSnapshot(dbQuery, flockId);
  if (!snap) return null;
  const lotR = await dbQuery(
    `SELECT ${LOT_SELECT}
       FROM pipeline_lots l
      WHERE l.flock_id = $1::uuid
        AND ${OPEN_LOT}
      ORDER BY l.created_at DESC
      LIMIT 1`,
    [flockId]
  );
  const lot = lotR.rows[0] ? mapLotRow(lotR.rows[0]) : null;
  if (!lot) return { flockId, lot: null };
  const matchedR = await dbQuery(
    `SELECT COALESCE(SUM(birds), 0)::int AS matched
       FROM pipeline_matches
      WHERE lot_id = $1::uuid
        AND status IN ('committed', 'delivered')`,
    [lot.id]
  );
  const plan = planManagedLotSync({
    liveEstimate: snap.liveEstimate,
    matchedBirds: Number(matchedR.rows[0]?.matched ?? 0),
    currentStatus: lot.status,
  });
  if (plan.skip) return { flockId, lotId: lot.id, skipped: true };
  await dbQuery(
    `UPDATE pipeline_lots SET
        bird_count = COALESCE($2, bird_count),
        saleable_birds = $3,
        avg_weight_kg = COALESCE($4, avg_weight_kg),
        expected_weight_kg = COALESCE($5, expected_weight_kg),
        status = $6,
        notes = CASE
          WHEN $6 IN ('cancelled', 'matched') AND $3 = 0
            THEN COALESCE(notes || E'\n', '') || 'Closed after farm recorded sold or slaughtered'
          ELSE notes
        END,
        updated_at = now()
      WHERE id = $1::uuid`,
    [lot.id, plan.birdCount, plan.saleableBirds, snap.avgWeightKg, snap.expectedWeightKg, plan.status]
  );
  return { flockId, lotId: lot.id, status: plan.status, saleableBirds: plan.saleableBirds };
}
