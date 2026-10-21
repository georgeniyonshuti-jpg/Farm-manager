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
  listingPhase,
  rankEligibleUntilConfirm,
} from "../services/pipeline/sellingWeek.js";
import { buyerPlaceGroup } from "../services/pipeline/rwandaLocations.js";

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
            AND ($1::boolean = true OR l.assigned_scout_user_id = $2::uuid)
          ORDER BY l.ready_from ASC NULLS LAST, l.created_at ASC
          LIMIT 200`,
        [all, req.authUser.id]
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
    if (req.authUser.role === "superuser" || req.authUser.role === "sales_coordinator") {
      return res.status(403).json({ error: "A scout records the visit." });
    }
    const lotId = req.params.id;
    const assigned = await dbQuery(
      `SELECT assigned_scout_user_id::text AS "assignedScoutUserId"
         FROM pipeline_lots WHERE id = $1::uuid`,
      [lotId]
    );
    const assignedScoutUserId = assigned.rows[0]?.assignedScoutUserId || null;
    if (!assigned.rows[0]) return res.status(404).json({ error: "Lot not found." });
    if (!assignedScoutUserId || assignedScoutUserId !== req.authUser.id) {
      return res.status(403).json({ error: "This flock is not assigned to you." });
    }
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
      if (applied.confirm) {
        const { emitCrmMilestone } = await import("../services/pipeline/crmBridge.js");
        void emitCrmMilestone({
          eventType: "flock.first_captured",
          entities: [
            { type: "farm_profile", id: farmProfileId },
            { type: "pipeline_lot", id: lotId },
          ],
        });
      }
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

  router.get("/flock-book", async (req, res) => {
    if (!requireDb(res)) return;
    if (!canAccessPipelineDesk(req.authUser)) return res.status(403).json({ error: "Not allowed." });
    try {
      const r = await dbQuery(
        `SELECT l.id::text AS id,
                l.farm_label AS "farmLabel",
                l.district,
                l.sector,
                l.bird_count AS "birdCount",
                l.status,
                COALESCE(l.verification_status, 'verified') AS "verificationStatus",
                l.listed_by::text AS "listedBy",
                COALESCE(NULLIF(reg.full_name, ''), reg.email) AS "registeredByName",
                l.assigned_scout_user_id::text AS "assignedScoutUserId",
                COALESCE(NULLIF(sc.full_name, ''), sc.email) AS "assignedScoutName",
                l.scout_confirmed_at AS "scoutConfirmedAt",
                l.ready_from AS "readyFrom",
                l.ready_to AS "readyTo",
                l.ask_price_per_kg AS "askPricePerKg"
           FROM pipeline_lots l
           LEFT JOIN users reg ON reg.id = l.listed_by
           LEFT JOIN users sc ON sc.id = l.assigned_scout_user_id
          WHERE l.status IN ('draft', 'open', 'partial')
          ORDER BY l.created_at DESC
          LIMIT 200`
      );
      const scouts = await dbQuery(
        `SELECT u.id::text AS id, COALESCE(NULLIF(u.full_name, ''), u.email) AS name
           FROM users u
          WHERE u.role IN ('vet', 'vet_manager')
            AND u.is_active = true
            AND EXISTS (
              SELECT 1 FROM scout_applications sa
               WHERE sa.user_id = u.id AND sa.status = 'approved'
            )
          ORDER BY 2`
      );
      const flocks = r.rows.filter((row) => listingPhase(row) !== "live");
      res.json({ flocks, scouts: scouts.rows });
    } catch (e) {
      res.status(503).json({ error: e instanceof Error ? e.message : "Could not load flocks." });
    }
  });

  router.get("/flock-book/:id", async (req, res) => {
    if (!requireDb(res)) return;
    if (!canAccessPipelineDesk(req.authUser)) return res.status(403).json({ error: "Not allowed." });
    try {
      const r = await dbQuery(
        `SELECT l.id::text AS id,
                l.farm_label AS "farmLabel",
                l.district,
                l.sector,
                l.bird_count AS "birdCount",
                l.status,
                COALESCE(l.verification_status, 'verified') AS "verificationStatus",
                l.listed_by::text AS "listedBy",
                COALESCE(NULLIF(reg.full_name, ''), reg.email) AS "registeredByName",
                l.assigned_scout_user_id::text AS "assignedScoutUserId",
                COALESCE(NULLIF(sc.full_name, ''), sc.email) AS "assignedScoutName",
                l.scout_confirmed_at AS "scoutConfirmedAt",
                l.ready_from AS "readyFrom",
                l.ready_to AS "readyTo",
                l.ask_price_per_kg AS "askPricePerKg"
           FROM pipeline_lots l
           LEFT JOIN users reg ON reg.id = l.listed_by
           LEFT JOIN users sc ON sc.id = l.assigned_scout_user_id
          WHERE l.id = $1::uuid`,
        [req.params.id]
      );
      const flock = r.rows[0];
      if (!flock) return res.status(404).json({ error: "Flock not found." });
      const scouts = await dbQuery(
        `SELECT u.id::text AS id, COALESCE(NULLIF(u.full_name, ''), u.email) AS name
           FROM users u
          WHERE u.role IN ('vet', 'vet_manager')
            AND u.is_active = true
            AND EXISTS (
              SELECT 1 FROM scout_applications sa
               WHERE sa.user_id = u.id AND sa.status = 'approved'
            )
          ORDER BY 2`
      );
      const buyers = await dbQuery(
        `SELECT id::text AS id, name, buyer_type AS "buyerType", district, sector,
                weekly_birds_min AS "weeklyBirdsMin", weekly_birds_max AS "weeklyBirdsMax"
           FROM pipeline_buyers
          WHERE active = true
          ORDER BY name
          LIMIT 500`
      );
      const grouped = { sameSector: [], sameDistrict: [], sameProvince: [] };
      for (const buyer of buyers.rows) {
        const group = buyerPlaceGroup(flock, buyer);
        if (group === "sector") grouped.sameSector.push(buyer);
        else if (group === "district") grouped.sameDistrict.push(buyer);
        else if (group === "province") grouped.sameProvince.push(buyer);
      }
      res.json({ flock, scouts: scouts.rows, buyers: grouped });
    } catch (e) {
      res.status(503).json({ error: e instanceof Error ? e.message : "Could not load this flock." });
    }
  });

  router.post("/flock-book/:id/remove", async (req, res) => {
    if (!requireDb(res)) return;
    if (!canAccessPipelineDesk(req.authUser)) return res.status(403).json({ error: "Not allowed." });
    try {
      const lot = await dbQuery(`SELECT status FROM pipeline_lots WHERE id = $1::uuid`, [req.params.id]);
      if (!lot.rows[0]) return res.status(404).json({ error: "Flock not found." });
      if (lot.rows[0].status === "cancelled") return res.json({ ok: true, status: "cancelled" });
      const matched = await dbQuery(
        `SELECT COUNT(*)::int AS n FROM pipeline_matches
          WHERE lot_id = $1::uuid AND status IN ('committed', 'delivered')`,
        [req.params.id]
      );
      if (Number(matched.rows[0]?.n || 0) > 0) {
        return res.status(400).json({ error: "This flock has bookings, so it stays." });
      }
      await dbQuery(
        `UPDATE pipeline_lots SET status = 'cancelled', updated_at = now() WHERE id = $1::uuid`,
        [req.params.id]
      );
      audit(req.authUser, "pipeline.lot.remove", "pipeline_lot", req.params.id, { status: "cancelled" });
      res.json({ ok: true, status: "cancelled" });
    } catch (e) {
      res.status(503).json({ error: e instanceof Error ? e.message : "Could not remove this flock." });
    }
  });

  router.post("/lots/:id/assign-scout", async (req, res) => {
    if (!requireDb(res)) return;
    if (!canAccessPipelineDesk(req.authUser)) return res.status(403).json({ error: "Not allowed." });
    const lotId = req.params.id;
    const scoutUserId = str(req.body?.scoutUserId, 64);
    if (!scoutUserId) return res.status(400).json({ error: "Choose a scout." });
    try {
      const scout = await dbQuery(
        `SELECT u.id
           FROM users u
           JOIN scout_applications sa ON sa.user_id = u.id AND sa.status = 'approved'
          WHERE u.id = $1::uuid AND u.role IN ('vet', 'vet_manager') AND u.is_active = true`,
        [scoutUserId]
      );
      if (!scout.rows[0]) return res.status(400).json({ error: "That scout is not ready." });
      const updated = await dbQuery(
        `UPDATE pipeline_lots
            SET assigned_scout_user_id = $2::uuid, updated_at = now()
          WHERE id = $1::uuid AND status IN ('draft', 'open', 'partial')
          RETURNING id::text AS id, assigned_scout_user_id::text AS "assignedScoutUserId"`,
        [lotId, scoutUserId]
      );
      if (!updated.rows[0]) return res.status(404).json({ error: "Flock not found." });
      res.json({ flock: updated.rows[0] });
    } catch (e) {
      res.status(503).json({ error: e instanceof Error ? e.message : "Could not assign the scout." });
    }
  });

  router.get("/market/scout/my-flocks", async (req, res) => {
    if (!requireDb(res)) return;
    if (!canScoutPipeline(req.authUser)) return res.status(403).json({ error: "Not allowed." });
    const role = req.authUser.role;
    let ready = true;
    try {
      if (role === "vet" || role === "vet_manager") {
        const app = await dbQuery(
          `SELECT status FROM scout_applications WHERE user_id = $1::uuid`,
          [req.authUser.id]
        );
        ready = app.rows[0]?.status === "approved";
      }
      const r = await dbQuery(
        `SELECT l.id::text AS id,
                l.farm_label AS "farmLabel",
                l.district,
                l.bird_count AS "birdCount",
                COALESCE(l.verification_status, 'verified') AS "verificationStatus",
                l.assigned_scout_user_id::text AS "assignedScoutUserId",
                l.listed_by::text AS "listedBy",
                l.scout_confirmed_at AS "scoutConfirmedAt",
                (l.assigned_scout_user_id = $1::uuid) AS "assignedToMe",
                (l.listed_by = $1::uuid OR l.created_by = $1::uuid) AS "registeredByMe"
           FROM pipeline_lots l
          WHERE l.status <> 'cancelled'
            AND (
              l.assigned_scout_user_id = $1::uuid
              OR l.listed_by = $1::uuid
              OR l.created_by = $1::uuid
            )
          ORDER BY l.created_at DESC
          LIMIT 200`,
        [req.authUser.id]
      );
      res.json({ ready, flocks: r.rows });
    } catch (e) {
      res.status(503).json({ error: e instanceof Error ? e.message : "Could not load your flocks." });
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
