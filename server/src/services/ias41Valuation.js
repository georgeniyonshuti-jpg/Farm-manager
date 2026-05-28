/**
 * IAS 41 Biological Asset Valuation Service
 *
 * Implements IAS 41 "Agriculture" fair value less costs to sell for live poultry flocks.
 *
 * Valuation flow:
 *  1. Manager inputs market price per kg and estimated costs to sell.
 *  2. Service reads latest weigh-in data (avg_weight_kg, live_count) for the flock.
 *  3. Computes fair value = (market_price - costs_to_sell) × total_live_weight_kg.
 *  4. Compares to previous snapshot to derive fair value change (gain/loss).
 *  5. Creates a flock_valuation_snapshots record (status=draft).
 *  6. Manager approves snapshot → enqueues IAS 41 journal entry to Odoo outbox.
 *
 * The gain/loss flows through P&L as per IAS 41.11.
 */

import { enqueueOdooSync } from "./odoo/odooSyncWorker.js";
import { mapValuationSnapshotToJournalEntry } from "./odoo/odooFarmMappers.js";

let _dbQuery = null;
let _hasDb = null;

export function initIas41Service(dbQueryFn, hasDbFn) {
  _dbQuery = dbQueryFn;
  _hasDb = hasDbFn;
}

function dbQuery(...args) {
  if (!_dbQuery) throw new Error("ias41Valuation: dbQuery not initialized.");
  return _dbQuery(...args);
}

function hasDb() {
  return typeof _hasDb === "function" ? _hasDb() : false;
}

/**
 * Build a valuation snapshot for a flock.
 * Reads latest weigh-in, live count, computes fair value.
 * Saves as draft (status='draft') for manager review before Odoo push.
 *
 * @param {{ flockId: string, snapshotDate: string, marketPricePerKgRwf: number, costsToSellPerKgRwf?: number, createdBy: string }} opts
 */
export async function buildValuationSnapshot({ flockId, snapshotDate, marketPricePerKgRwf, costsToSellPerKgRwf = 0, createdBy }) {
  if (!hasDb()) throw new Error("Database unavailable.");

  // 1. Get flock live count + latest weigh-in
  const flockRow = await dbQuery(
    `SELECT f.id::text AS id, f.code,
            COALESCE(f.initial_count, 0) - COALESCE(
              (SELECT COUNT(*) * 0 + SUM(me.count) FROM flock_mortality_events me WHERE me.flock_id::text = f.id::text AND me.submission_status = 'approved' AND me.affects_live_count = true), 0
            ) AS estimated_live_count
       FROM poultry_flocks f
      WHERE f.id::text = $1`,
    [flockId]
  );
  if (flockRow.rows.length === 0) throw new Error(`Flock not found: ${flockId}`);
  const flock = flockRow.rows[0];

  const weighInRow = await dbQuery(
    `SELECT avg_weight_kg, total_feed_used_kg, fcr, age_days, sample_size
       FROM weigh_ins
      WHERE flock_id = $1
      ORDER BY weigh_date DESC LIMIT 1`,
    [flockId]
  );
  const latestWeighIn = weighInRow.rows[0] ?? null;

  const avgWeightKg = latestWeighIn ? Number(latestWeighIn.avg_weight_kg) : 1.5;
  const liveCount = Math.max(0, Number(flock.estimated_live_count) || 0);
  const totalLiveWeightKg = avgWeightKg * liveCount;

  const fairValuePerKg = Math.max(0, Number(marketPricePerKgRwf) - Number(costsToSellPerKgRwf));
  const totalFairValueRwf = totalLiveWeightKg * fairValuePerKg;

  // 2. Get previous snapshot total for change calc
  const prevRow = await dbQuery(
    `SELECT total_fair_value_rwf AS "totalFairValueRwf"
       FROM flock_valuation_snapshots
      WHERE flock_id = $1
        AND snapshot_date < $2::date
        AND status IN ('approved','posted')
      ORDER BY snapshot_date DESC LIMIT 1`,
    [flockId, snapshotDate]
  );
  const prevCarryingValue = prevRow.rows[0] ? Number(prevRow.rows[0].totalFairValueRwf) : null;
  const fairValueChange = prevCarryingValue != null ? totalFairValueRwf - prevCarryingValue : null;

  // 3. Build assumptions payload
  const assumptions = {
    marketPricePerKgRwf: Number(marketPricePerKgRwf),
    costsToSellPerKgRwf: Number(costsToSellPerKgRwf),
    fairValuePerKgRwf: fairValuePerKg,
    liveCount,
    avgWeightKg,
    totalLiveWeightKg,
    fcr: latestWeighIn?.fcr ?? null,
    ageDays: latestWeighIn?.age_days ?? null,
    source: "manager_input",
    standard: "IAS 41",
    basis: "fair_value_less_costs_to_sell",
  };

  // 4. Upsert snapshot (ON CONFLICT for same flock+date)
  const ins = await dbQuery(
    `INSERT INTO flock_valuation_snapshots
       (flock_id, snapshot_date, age_days, live_count, avg_weight_kg, total_live_weight_kg,
        market_price_per_kg_rwf, costs_to_sell_per_kg_rwf, total_fair_value_rwf,
        previous_carrying_value_rwf, fair_value_change_rwf, fcr_at_snapshot,
        assumptions, status, created_by)
     VALUES ($1, $2::date, $3, $4, $5::numeric, $6::numeric, $7::numeric, $8::numeric, $9::numeric, $10::numeric, $11::numeric, $12::numeric, $13::jsonb, 'draft', $14)
     ON CONFLICT (flock_id, snapshot_date) DO UPDATE
       SET market_price_per_kg_rwf = EXCLUDED.market_price_per_kg_rwf,
           costs_to_sell_per_kg_rwf = EXCLUDED.costs_to_sell_per_kg_rwf,
           total_fair_value_rwf = EXCLUDED.total_fair_value_rwf,
           fair_value_change_rwf = EXCLUDED.fair_value_change_rwf,
           assumptions = EXCLUDED.assumptions,
           status = 'draft',
           created_by = EXCLUDED.created_by
     RETURNING id::text AS id`,
    [
      flockId,
      snapshotDate,
      latestWeighIn?.age_days ?? null,
      liveCount,
      avgWeightKg,
      totalLiveWeightKg,
      marketPricePerKgRwf,
      costsToSellPerKgRwf,
      totalFairValueRwf,
      prevCarryingValue,
      fairValueChange,
      latestWeighIn?.fcr ?? null,
      JSON.stringify(assumptions),
      createdBy,
    ]
  );

  const snapshotId = ins.rows[0]?.id;
  return {
    id: snapshotId,
    flockId,
    flockCode: flock.code,
    snapshotDate,
    liveCount,
    avgWeightKg,
    totalLiveWeightKg,
    marketPricePerKgRwf: Number(marketPricePerKgRwf),
    costsToSellPerKgRwf: Number(costsToSellPerKgRwf),
    fairValuePerKgRwf: fairValuePerKg,
    totalFairValueRwf,
    previousCarryingValueRwf: prevCarryingValue,
    fairValueChangeRwf: fairValueChange,
    fcrAtSnapshot: latestWeighIn?.fcr ?? null,
    status: "draft",
    assumptions,
  };
}

/**
 * Approve a valuation snapshot.
 * Sets status=approved and enqueues IAS 41 adjustment journal entry to Odoo outbox.
 *
 * @param {{ snapshotId: string, approvedBy: string, approvedByRole: string }} opts
 */
export async function approveValuationSnapshot({ snapshotId, approvedBy, approvedByRole }) {
  if (!hasDb()) throw new Error("Database unavailable.");

  const r = await dbQuery(
    `UPDATE flock_valuation_snapshots
        SET status = 'approved', approved_by = $2, approved_at = now()
      WHERE id::text = $1 AND status = 'draft'
      RETURNING id::text AS id, flock_id AS "flockId", snapshot_date AS "snapshotDate",
                total_fair_value_rwf AS "totalFairValueRwf",
                fair_value_change_rwf AS "fairValueChangeRwf"`,
    [snapshotId, approvedBy]
  );
  if ((r.rowCount ?? 0) === 0) throw new Error("Snapshot not found or already approved.");
  const snapshot = r.rows[0];

  // Fetch flock code for labels
  let flockCode = null;
  try {
    const fRow = await dbQuery(`SELECT code FROM poultry_flocks WHERE id::text = $1`, [snapshot.flockId]);
    flockCode = fRow.rows[0]?.code ?? null;
  } catch {}

  const journalPayload = mapValuationSnapshotToJournalEntry({ ...snapshot, flockCode });

  if (journalPayload) {
    await enqueueOdooSync({
      sourceTable: "flock_valuation_snapshots",
      sourceId: snapshotId,
      eventType: "fcr_fair_value_adjustment",
      payload: journalPayload,
      triggeredByUserId: approvedBy,
      triggeredByRole: approvedByRole,
    });
  }

  return snapshot;
}

/**
 * List valuation snapshots for a flock or all flocks.
 * @param {{ flockId?: string, status?: string }} filters
 */
export async function listValuationSnapshots({ flockId, status } = {}) {
  if (!hasDb()) throw new Error("Database unavailable.");
  const r = await dbQuery(
    `SELECT vs.id::text AS id, vs.flock_id AS "flockId", f.code AS "flockCode",
            vs.snapshot_date AS "snapshotDate", vs.live_count AS "liveCount",
            vs.avg_weight_kg AS "avgWeightKg", vs.total_live_weight_kg AS "totalLiveWeightKg",
            vs.market_price_per_kg_rwf AS "marketPricePerKgRwf",
            vs.costs_to_sell_per_kg_rwf AS "costsToSellPerKgRwf",
            vs.fair_value_per_kg_rwf AS "fairValuePerKgRwf",
            vs.total_fair_value_rwf AS "totalFairValueRwf",
            vs.fair_value_change_rwf AS "fairValueChangeRwf",
            vs.fcr_at_snapshot AS "fcrAtSnapshot",
            vs.status, vs.approved_by AS "approvedBy", vs.approved_at AS "approvedAt",
            vs.created_at AS "createdAt"
       FROM flock_valuation_snapshots vs
       LEFT JOIN poultry_flocks f ON f.id::text = vs.flock_id
      WHERE ($1::text IS NULL OR vs.flock_id = $1::text)
        AND ($2::text IS NULL OR vs.status = $2::text)
      ORDER BY vs.snapshot_date DESC, vs.created_at DESC LIMIT 200`,
    [flockId ?? null, status ?? null]
  );
  return r.rows;
}
