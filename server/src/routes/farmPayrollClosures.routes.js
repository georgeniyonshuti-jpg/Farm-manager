/**
 * Payroll period closures — DB-only (no external accounting outbox).
 */

import express from "express";

const router = express.Router();

let _dbQuery = null;
let _hasDb = null;

export function initFarmPayrollClosuresRouter(dbQueryFn, hasDbFn) {
  _dbQuery = dbQueryFn;
  _hasDb = hasDbFn;
}

function dbQuery(...args) {
  if (!_dbQuery) throw new Error("farmPayrollClosures: dbQuery not initialized.");
  return _dbQuery(...args);
}

function hasDb() {
  return typeof _hasDb === "function" ? _hasDb() : false;
}

function isManagerOrAbove(user) {
  return user?.role === "manager" || user?.role === "company_admin" || user?.role === "superuser";
}

router.post("/payroll-closures", async (req, res) => {
  if (!hasDb()) return res.status(503).json({ error: "Database unavailable." });
  if (!isManagerOrAbove(req.authUser)) {
    return res.status(403).json({ error: "Manager or above required." });
  }
  const body = req.body ?? {};
  const periodStart = String(body.periodStart ?? "").slice(0, 10);
  const periodEnd = String(body.periodEnd ?? "").slice(0, 10);
  const notes = body.notes ? String(body.notes).slice(0, 500) : null;
  if (!periodStart || !periodEnd) {
    return res.status(400).json({ error: "periodStart and periodEnd are required." });
  }

  try {
    const totals = await dbQuery(
      `SELECT
         COUNT(DISTINCT user_id)::int AS worker_count,
         COALESCE(SUM(CASE WHEN rwf_delta > 0 THEN rwf_delta ELSE 0 END), 0) AS total_credits,
         COALESCE(SUM(CASE WHEN rwf_delta < 0 THEN ABS(rwf_delta) ELSE 0 END), 0) AS total_deductions,
         COALESCE(SUM(rwf_delta), 0) AS net_payroll
         FROM payroll_impact
        WHERE period_start >= $1::date
          AND period_end <= $2::date
          AND approved_at IS NOT NULL`,
      [periodStart, periodEnd]
    );
    const t = totals.rows[0];
    const netPayrollRwf = Number(t.net_payroll);
    if (netPayrollRwf === 0) {
      return res.status(400).json({ error: "No approved payroll rows in this period." });
    }

    const ins = await dbQuery(
      `INSERT INTO payroll_period_closures
         (period_start, period_end, total_credits_rwf, total_deductions_rwf, net_payroll_rwf,
          worker_count, approved_by, notes, accounting_status)
       VALUES ($1::date, $2::date, $3::numeric, $4::numeric, $5::numeric, $6, $7, $8, 'not_applicable')
       ON CONFLICT (period_start, period_end) DO UPDATE
         SET total_credits_rwf = EXCLUDED.total_credits_rwf,
             total_deductions_rwf = EXCLUDED.total_deductions_rwf,
             net_payroll_rwf = EXCLUDED.net_payroll_rwf,
             worker_count = EXCLUDED.worker_count,
             approved_by = EXCLUDED.approved_by,
             notes = EXCLUDED.notes,
             accounting_status = 'not_applicable',
             approved_at = now()
       RETURNING id::text AS id`,
      [
        periodStart,
        periodEnd,
        t.total_credits,
        t.total_deductions,
        netPayrollRwf,
        t.worker_count,
        req.authUser.id,
        notes,
      ]
    );
    const closureId = ins.rows[0].id;
    res.status(201).json({
      ok: true,
      closureId,
      periodStart,
      periodEnd,
      netPayrollRwf,
      workerCount: t.worker_count,
    });
  } catch (e) {
    res.status(503).json({ error: e instanceof Error ? e.message : "Payroll closure failed." });
  }
});

router.get("/payroll-closures", async (req, res) => {
  if (!hasDb()) return res.status(503).json({ error: "Database unavailable." });
  if (!isManagerOrAbove(req.authUser)) {
    return res.status(403).json({ error: "Manager or above required." });
  }
  try {
    const r = await dbQuery(
      `SELECT id::text AS id, period_start AS "periodStart", period_end AS "periodEnd",
              total_credits_rwf AS "totalCreditsRwf", total_deductions_rwf AS "totalDeductionsRwf",
              net_payroll_rwf AS "netPayrollRwf", worker_count AS "workerCount",
              accounting_status AS "accountingStatus", notes, approved_at AS "approvedAt"
         FROM payroll_period_closures
        ORDER BY period_start DESC LIMIT 60`
    );
    res.json({ closures: r.rows });
  } catch (e) {
    res.status(503).json({ error: e instanceof Error ? e.message : "Query failed." });
  }
});

export default router;
