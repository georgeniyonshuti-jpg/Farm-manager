/**
 * Vet log creation helpers — weight sample, linked treatment, ERPNext sync.
 */

import crypto from "node:crypto";

export const VET_LOG_LIST_EXTRA_SELECT = `
  v.weigh_in_id::text AS "weighInId",
  v.sample_size AS "sampleSize",
  v.avg_weight_kg AS "avgWeightKg",
  v.cv_pct AS "cvPct",
  v.underweight_pct AS "underweightPct",
  v.total_feed_used_kg AS "totalFeedUsedKg",
  (v.avg_weight_kg IS NOT NULL) AS "hasWeightSample",
  t.id AS "treatmentId",
  t.medicine_name AS "medicineName"`;

export const VET_LOG_LIST_EXTRA_JOINS = `
  LEFT JOIN LATERAL (
    SELECT ft.id, ft.medicine_name
      FROM flock_treatments ft
     WHERE ft.vet_log_id = v.id
     ORDER BY ft.at DESC
     LIMIT 1
  ) t ON true`;

/**
 * @param {string} submissionStatus
 */
export function shouldSyncVetLogOnCreate(submissionStatus) {
  return submissionStatus === "approved";
}

/**
 * @param {string} action
 */
export function shouldSyncVetLogOnReview(action) {
  return action === "approve";
}

/** vet, vet_manager, manager, superuser — not laborer/dispatcher. */
export function canCreateVetLog(user) {
  if (!user) return false;
  const r = user.role;
  return r === "vet" || r === "vet_manager" || r === "manager" || r === "superuser";
}

/** vet_manager, manager, superuser — anyone at lead-vet tier or above. */
export function canReviewVetLog(user) {
  if (!user) return false;
  const r = user.role;
  return r === "vet_manager" || r === "manager" || r === "superuser";
}

/** Only junior vets (vet + junior_vet department) need manager review before ERPNext sync. */
export function needsVetLogApproval(user) {
  if (!user) return true;
  if (canReviewVetLog(user)) return false;
  if (
    user.role === "vet" &&
    Array.isArray(user.departmentKeys) &&
    user.departmentKeys.includes("junior_vet")
  ) {
    return true;
  }
  if (user.role === "vet") return false;
  return false;
}

/**
 * @param {import('pg').PoolClient} client
 * @param {string} vetLogId
 */
export async function fetchVetLogRelatedEntityIds(client, vetLogId) {
  const r = await client.query(
    `SELECT v.weigh_in_id::text AS "weighInId",
            (SELECT array_agg(ft.id ORDER BY ft.at)
               FROM flock_treatments ft
              WHERE ft.vet_log_id = v.id) AS "treatmentIds"
       FROM farm_vet_logs v
      WHERE v.id = $1::uuid`,
    [vetLogId]
  );
  const row = r.rows[0];
  if (!row) return { weighInId: null, treatmentIds: [] };
  const treatmentIds = Array.isArray(row.treatmentIds)
    ? row.treatmentIds.filter(Boolean).map(String)
    : [];
  return {
    weighInId: row.weighInId ? String(row.weighInId) : null,
    treatmentIds,
  };
}

/**
 * @param {(entityType: string, entityId: string) => void} clevaSync
 * @param {import('pg').PoolClient | { query: Function }} client
 * @param {string} vetLogId
 */
export async function syncApprovedVetLogEntities(clevaSync, client, vetLogId) {
  clevaSync("farm_vet_log", vetLogId);
  const { weighInId, treatmentIds } = await fetchVetLogRelatedEntityIds(client, vetLogId);
  if (weighInId) clevaSync("farm_weigh_in", weighInId);
  for (const tid of treatmentIds) clevaSync("farm_treatment", tid);
}

/**
 * @param {object} opts
 * @param {import('pg').PoolClient} opts.client
 * @param {string} opts.vetLogId
 * @param {string} opts.flockId
 * @param {string} opts.authorUserId
 * @param {string} opts.logDate
 * @param {object|null} opts.weightSample
 * @param {number} opts.ageDays
 * @param {number} opts.defaultFeedKg
 */
export async function attachWeightSampleToVetLog({
  client,
  vetLogId,
  flockId,
  authorUserId,
  logDate,
  weightSample,
  ageDays,
  defaultFeedKg,
}) {
  if (!weightSample) return null;

  const sampleSize = Math.max(1, Math.floor(Number(weightSample.sampleSize)));
  const avgWeightKg = Number(weightSample.avgWeightKg);
  const totalFeedUsedKg = Number.isFinite(Number(weightSample.totalFeedUsedKg))
    ? Number(weightSample.totalFeedUsedKg)
    : defaultFeedKg;
  const targetWeightKg =
    weightSample.targetWeightKg == null || weightSample.targetWeightKg === ""
      ? null
      : Number(weightSample.targetWeightKg);
  const cvPct =
    weightSample.cvPct == null || weightSample.cvPct === "" ? null : Number(weightSample.cvPct);
  const underweightPct =
    weightSample.underweightPct == null || weightSample.underweightPct === ""
      ? null
      : Number(weightSample.underweightPct);

  const weighIns = await client.query(
    `INSERT INTO weigh_ins
       (flock_id, weigh_date, age_days, sample_size, avg_weight_kg, total_feed_used_kg,
        target_weight_kg, cv_pct, underweight_pct, notes, recorded_by, vet_log_id, source, updated_at)
     VALUES ($1, $2::date, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12::uuid, 'vet_log', now())
     RETURNING id::text AS id`,
    [
      flockId,
      logDate,
      ageDays,
      sampleSize,
      avgWeightKg,
      totalFeedUsedKg,
      targetWeightKg,
      cvPct,
      underweightPct,
      `Vet log weight sample (${vetLogId.slice(0, 8)})`,
      authorUserId,
      vetLogId,
    ]
  );
  const weighInId = weighIns.rows[0]?.id;
  if (!weighInId) throw new Error("Failed to create weigh-in for vet log");

  await client.query(
    `UPDATE farm_vet_logs
        SET weigh_in_id = $1::uuid,
            sample_size = $2,
            avg_weight_kg = $3,
            cv_pct = $4,
            underweight_pct = $5,
            total_feed_used_kg = $6,
            updated_at = now()
      WHERE id = $7::uuid`,
    [weighInId, sampleSize, avgWeightKg, cvPct, underweightPct, totalFeedUsedKg, vetLogId]
  );

  return weighInId;
}

/**
 * @param {object} opts
 * @param {import('pg').PoolClient} opts.client
 * @param {string} opts.vetLogId
 * @param {string} opts.flockId
 * @param {string} opts.authorUserId
 * @param {object} opts.medicine
 * @param {object} opts.systemConfig
 * @param {string[]} opts.treatmentReasonCodes
 */
export async function attachMedicineToVetLog({
  client,
  vetLogId,
  flockId,
  authorUserId,
  medicine,
  systemConfig,
  treatmentReasonCodes,
}) {
  if (!medicine) return null;

  let medicineName = String(medicine.medicineName ?? "").trim();
  let withdrawalDays = 0;

  if (medicine.medicineId) {
    const medR = await client.query(
      `SELECT name, withdrawal_days FROM medicine_inventory WHERE id = $1::uuid`,
      [medicine.medicineId]
    );
    if (medR.rows[0]) {
      if (!medicineName) medicineName = String(medR.rows[0].name ?? "").trim();
      withdrawalDays = Math.max(0, Number(medR.rows[0].withdrawal_days) || 0);
    }
  }

  const diseaseOrReason = String(medicine.diseaseOrReason ?? "vet_visit").trim() || "vet_visit";
  const dose = Number(medicine.dose);
  const doseUnit = String(medicine.doseUnit ?? "").trim();
  const route = String(medicine.route ?? "").trim();
  const notes = String(medicine.notes ?? "").slice(0, 4000);

  if (!medicineName || !Number.isFinite(dose) || dose <= 0 || !doseUnit || !route) {
    throw new Error("medicineName, dose, doseUnit, and route are required when logging medicine");
  }

  if (
    !systemConfig.validateAgainstCategory(
      "treatment_dose_unit",
      doseUnit,
      systemConfig.getStaticFallbackCodes("treatment_dose_unit")
    )
  ) {
    throw new Error("Invalid doseUnit for treatment");
  }
  if (
    !systemConfig.validateAgainstCategory(
      "treatment_route",
      route,
      systemConfig.getStaticFallbackCodes("treatment_route")
    )
  ) {
    throw new Error("Invalid route for treatment");
  }

  const treatmentId = `trt_${crypto.randomBytes(6).toString("hex")}`;
  await client.query(
    `INSERT INTO flock_treatments
       (id, flock_id, at, disease_or_reason, medicine_name, reason_code, dose, dose_unit, route,
        duration_days, withdrawal_days, notes, administered_by_user_id, vet_log_id)
     VALUES ($1, $2, now(), $3, $4, 'vet_visit', $5, $6, $7, 1, $8, $9, $10, $11::uuid)`,
    [
      treatmentId,
      flockId,
      diseaseOrReason,
      medicineName,
      dose,
      doseUnit,
      route,
      withdrawalDays,
      notes,
      authorUserId,
      vetLogId,
    ]
  );

  return treatmentId;
}
