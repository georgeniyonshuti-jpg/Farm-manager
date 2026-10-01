/**
 * Scout weigh queue — confirm booked flocks before they can rank on the shop.
 */

import {
  LOT_SELECT,
  canAccessPipelineDesk,
  canScoutPipeline,
  mapLotRow,
  remainingBirds,
} from "../services/pipeline/pipeline.js";
import { listingRankDecision, loadPublishedCard, merchantTierOf } from "../services/pipeline/marketQuote.js";
import {
  applyWeighOutcome,
  decorateListing,
  DEFAULT_VISIT_FEE_RWF,
  isVisitDue,
  rankEligibleUntilConfirm,
} from "../services/pipeline/sellingWeek.js";

export function registerPipelineWeighRoutes(router, ctx) {
  const { dbQuery, hasDb, audit, helpers } = ctx;
  const { requireDb, str, numOrNull } = helpers;

  async function getVisitFeeRwf() {
    try {
      const r = await dbQuery(
        `SELECT setting_value FROM app_settings WHERE setting_key = 'pipeline_scout_visit_fee_rwf' LIMIT 1`
      );
      const n = Number(r.rows[0]?.setting_value);
      return Number.isFinite(n) && n > 0 ? n : DEFAULT_VISIT_FEE_RWF;
    } catch {
      return DEFAULT_VISIT_FEE_RWF;
    }
  }

  router.get("/market/scout/weigh-queue", async (req, res) => {
    if (!requireDb(res)) return;
    if (!canScoutPipeline(req.authUser) && !canAccessPipelineDesk(req.authUser)) {
      return res.status(403).json({ error: "Not allowed." });
    }
    const all = req.query.all === "1" && canAccessPipelineDesk(req.authUser);
    try {
      const r = await dbQuery(
        `SELECT ${LOT_SELECT},
                COALESCE(m.matched, 0)::int AS "matchedBirds"
           FROM pipeline_lots l
           LEFT JOIN LATERAL (
             SELECT SUM(birds)::int AS matched
               FROM pipeline_matches pm
              WHERE pm.lot_id = l.id AND pm.status IN ('committed', 'delivered')
           ) m ON true
          WHERE l.scout_confirmed_at IS NULL
            AND l.status IN ('draft', 'open', 'partial')
            AND ($1::boolean = true OR l.ready_from <= (CURRENT_DATE + 7))
          ORDER BY l.ready_from ASC NULLS LAST, l.created_at ASC
          LIMIT 200`,
        [all]
      );
      const visitFeeRwf = await getVisitFeeRwf();
      const lots = r.rows.map((row) => {
        const mapped = mapLotRow(row);
        mapped.matchedBirds = Number(row.matchedBirds ?? 0);
        mapped.remainingBirds = remainingBirds(mapped.birdCount, mapped.matchedBirds);
        return decorateListing(mapped);
      });
      const dueThisWeek = lots.filter((l) => isVisitDue(l.readyFrom)).length;
      res.json({ lots, dueThisWeek, visitFeeRwf });
    } catch (e) {
      res.status(503).json({ error: e instanceof Error ? e.message : "Could not load weigh queue." });
    }
  });

  router.post("/market/lots/:id/weigh", async (req, res) => {
    if (!requireDb(res)) return;
    if (!canScoutPipeline(req.authUser)) {
      return res.status(403).json({ error: "Scout account required." });
    }
    const lotId = req.params.id;
    const body = req.body ?? {};
    const outcome = str(body.outcome, 20);
    const applied = applyWeighOutcome({
      outcome,
      readyFrom: str(body.readyFrom, 10),
      readyTo: str(body.readyTo, 10),
      birds: numOrNull(body.birds) ?? numOrNull(body.birdCount),
      avgKg: numOrNull(body.avgWeightKg) ?? numOrNull(body.avgKg),
    });
    if (!applied.ok) return res.status(400).json({ error: applied.error });

    try {
      const lotR = await dbQuery(
        `SELECT ${LOT_SELECT} FROM pipeline_lots l WHERE l.id = $1::uuid`,
        [lotId]
      );
      const lot = lotR.rows[0] ? mapLotRow(lotR.rows[0]) : null;
      if (!lot) return res.status(404).json({ error: "Lot not found." });
      if (["cancelled", "matched"].includes(lot.status)) {
        return res.status(400).json({ error: `Cannot weigh a ${lot.status} lot.` });
      }

      const readyFrom = applied.readyFrom || lot.readyFrom;
      const readyTo = applied.readyTo || lot.readyTo;
      if (!readyFrom || !readyTo) {
        return res.status(400).json({ error: "Selling week is missing on this lot." });
      }

      const visitFeeRwf = applied.accrueFee ? await getVisitFeeRwf() : 0;
      let farmProfileId = lot.farmProfileId;
      if (!farmProfileId && lot.listedBy) {
        const owned = await dbQuery(
          `SELECT id::text AS id FROM farm_profiles WHERE owner_user_id = $1::uuid LIMIT 1`,
          [lot.listedBy]
        );
        farmProfileId = owned.rows[0]?.id || null;
      }
      if (!farmProfileId && lot.companyId) {
        const pr = await dbQuery(
          `SELECT id::text AS id FROM farm_profiles
            WHERE company_id = $1::uuid AND owner_user_id IS NULL LIMIT 1`,
          [lot.companyId]
        );
        farmProfileId = pr.rows[0]?.id || null;
      }

      const visit = await dbQuery(
        `INSERT INTO farm_visits
           (farm_profile_id, scout_user_id, notes, status, lot_id,
            birds, avg_weight_kg, outcome, fee_rwf, fee_status)
         VALUES ($1::uuid, $2::uuid, $3, 'submitted', $4::uuid,
                 $5, $6, $7, $8, $9)
         RETURNING id::text AS id, fee_rwf AS "feeRwf", fee_status AS "feeStatus", outcome`,
        [
          farmProfileId,
          req.authUser.id,
          str(body.notes, 2000),
          lotId,
          applied.birdCount,
          applied.avgWeightKg,
          outcome,
          applied.accrueFee ? visitFeeRwf : null,
          applied.accrueFee ? "accrued" : "none",
        ]
      );

      let companyVerified = lot.verificationStatus;
      try {
        const c = await dbQuery(
          `SELECT COALESCE(verification_status, 'verified') AS "verificationStatus"
             FROM companies WHERE id = $1::uuid`,
          [lot.companyId]
        );
        companyVerified = c.rows[0]?.verificationStatus || companyVerified;
      } catch {
        /* keep */
      }
      const card = await loadPublishedCard(dbQuery).catch(() => null);
      const rail = listingRankDecision(card, {
        ask: lot.askPricePerKg,
        avgKg: applied.avgWeightKg ?? lot.avgWeightKg,
        birds: applied.birdCount ?? lot.birdCount,
        merchantTier: merchantTierOf(lot, { verificationStatus: companyVerified }),
      });
      const nextRank = rankEligibleUntilConfirm({
        confirmed: applied.confirm,
        railEligible: rail.rankEligible,
      });

      await dbQuery(
        `UPDATE pipeline_lots SET
            bird_count = COALESCE($2, bird_count),
            saleable_birds = COALESCE($2, saleable_birds),
            avg_weight_kg = COALESCE($3, avg_weight_kg),
            ready_from = $4::date,
            ready_to = $5::date,
            scout_confirmed_at = CASE WHEN $6::boolean THEN now() ELSE NULL END,
            scout_confirmed_by = CASE WHEN $6::boolean THEN $7::uuid ELSE scout_confirmed_by END,
            scouted_by = COALESCE(scouted_by, $7::uuid),
            rank_eligible = $8,
            updated_at = now()
          WHERE id = $1::uuid`,
        [
          lotId,
          applied.birdCount,
          applied.avgWeightKg,
          readyFrom,
          readyTo,
          applied.confirm,
          req.authUser.id,
          nextRank,
        ]
      );

      const refetch = await dbQuery(
        `SELECT ${LOT_SELECT} FROM pipeline_lots l WHERE l.id = $1::uuid`,
        [lotId]
      );
      audit(req.authUser, "pipeline.lot.weigh", "pipeline_lot", lotId, { outcome, visitId: visit.rows[0]?.id });
      res.status(201).json({
        lot: decorateListing(mapLotRow(refetch.rows[0])),
        visit: visit.rows[0],
        visitFeeRwf: applied.accrueFee ? visitFeeRwf : 0,
      });
    } catch (e) {
      res.status(503).json({ error: e instanceof Error ? e.message : "Could not record weigh." });
    }
  });
}

export async function listVisitCommissionRows(dbQuery, { scoutId = null, status = null } = {}) {
  const r = await dbQuery(
    `SELECT v.id::text AS id,
            'visit' AS kind,
            v.birds,
            v.fee_rwf AS "commissionAmountRwf",
            NULL::numeric AS "commissionRatePct",
            v.fee_status AS "commissionStatus",
            CASE WHEN v.fee_status = 'paid' THEN v.updated_at ELSE NULL END AS "commissionPaidAt",
            v.scout_user_id::text AS "commissionVetUserId",
            u.full_name AS "scoutName",
            NULL::text AS "buyerName",
            l.farm_label AS "lotFarmLabel",
            l.district AS "lotDistrict",
            v.visited_at AS "createdAt",
            v.outcome
       FROM farm_visits v
       JOIN pipeline_lots l ON l.id = v.lot_id
       LEFT JOIN users u ON u.id = v.scout_user_id
      WHERE v.fee_status IN ('accrued', 'paid', 'void')
        AND ($1::uuid IS NULL OR v.scout_user_id = $1::uuid)
        AND ($2::text IS NULL OR v.fee_status = $2)
      ORDER BY v.visited_at DESC
      LIMIT 300`,
    [scoutId, status]
  );
  return r.rows;
}
