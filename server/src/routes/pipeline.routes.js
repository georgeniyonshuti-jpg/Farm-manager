/**
 * Poultry supply pipeline desk APIs — buyers, lots, demands, matches.
 */

import express from "express";
import {
  LOT_SELECT,
  canAccessPipelineDesk,
  canBrowseMarket,
  canOptInManagedFlock,
  canScoutPipeline,
  deriveDemandStatusAfterMatch,
  deriveLotStatusAfterMatch,
  forwardWeekBuckets,
  loadFlockLotSnapshot,
  mapLotRow,
  remainingBirds,
  computeScoutCommission,
  DEFAULT_SCOUT_COMMISSION_RATE_PCT,
} from "../services/pipeline/pipeline.js";
import {
  buildCommissionAccruedEmail,
  emailForUserId,
  notifyMany,
} from "../services/pipeline/marketNotify.js";
import { isPlatformSuperuser } from "../services/tenant/companyIsolation.js";
import { registerPipelineMarketRoutes } from "./pipelineMarketExtras.js";
import { registerPipelineStorefrontRoutes } from "./pipelineStorefrontExtras.js";
import { registerPipelineFulfillmentRoutes } from "./pipelineFulfillmentExtras.js";
import { registerPipelineWeighRoutes } from "./pipelineWeighExtras.js";
import { registerPipelineSettlementRoutes } from "./pipelineSettlementExtras.js";
import {
  decorateListing,
  loadClevaRunRecentConfirm,
  resolveSellingWeek,
} from "../services/pipeline/sellingWeek.js";
import {
  applyOpsSettle,
  isMissingFulfillmentColumn,
} from "../services/pipeline/fulfillment.js";

const router = express.Router();

let _dbQuery = null;
let _hasDb = null;
let _appendAudit = null;

export function initPipelineRouter(dbQueryFn, hasDbFn, appendAuditFn) {
  _dbQuery = dbQueryFn;
  _hasDb = hasDbFn;
  _appendAudit = appendAuditFn ?? null;
}

function dbQuery(...args) {
  if (!_dbQuery) throw new Error("pipeline: dbQuery not initialized.");
  return _dbQuery(...args);
}

function hasDb() {
  return typeof _hasDb === "function" ? _hasDb() : false;
}

function audit(user, action, resource, resourceId, metadata) {
  if (typeof _appendAudit !== "function" || !user) return;
  try {
    _appendAudit(user.id, user.role, action, resource, resourceId, metadata ?? {});
  } catch {
    /* ignore audit failures */
  }
}

function requireDb(res) {
  if (!hasDb()) {
    res.status(503).json({ error: "Database unavailable." });
    return false;
  }
  return true;
}

function requireDesk(req, res) {
  if (!canAccessPipelineDesk(req.authUser)) {
    res.status(403).json({ error: "Pipeline desk access required (sales coordinator or superuser)." });
    return false;
  }
  return true;
}

function str(v, max = 500) {
  const s = String(v ?? "").trim();
  return s ? s.slice(0, max) : null;
}

function numOrNull(v) {
  if (v == null || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function bool(v, fallback = false) {
  if (v === true || v === "true" || v === 1 || v === "1") return true;
  if (v === false || v === "false" || v === 0 || v === "0") return false;
  return fallback;
}

async function matchedBirdsForLot(lotId) {
  const r = await dbQuery(
    `SELECT COALESCE(SUM(birds), 0)::int AS matched
       FROM pipeline_matches
      WHERE lot_id = $1::uuid
        AND status IN ('committed', 'delivered')`,
    [lotId]
  );
  return Number(r.rows[0]?.matched ?? 0);
}

async function filledBirdsForDemand(demandId) {
  if (!demandId) return 0;
  const r = await dbQuery(
    `SELECT COALESCE(SUM(birds), 0)::int AS filled
       FROM pipeline_matches
      WHERE demand_id = $1::uuid
        AND status IN ('committed', 'delivered')`,
    [demandId]
  );
  return Number(r.rows[0]?.filled ?? 0);
}

async function refreshLotStatus(lotId) {
  const lotR = await dbQuery(
    `SELECT id::text AS id, bird_count AS "birdCount", status FROM pipeline_lots WHERE id = $1::uuid`,
    [lotId]
  );
  const lot = lotR.rows[0];
  if (!lot) return null;
  const matched = await matchedBirdsForLot(lotId);
  const next = deriveLotStatusAfterMatch(lot.birdCount, matched, lot.status);
  if (next !== lot.status) {
    await dbQuery(`UPDATE pipeline_lots SET status = $2, updated_at = now() WHERE id = $1::uuid`, [
      lotId,
      next,
    ]);
  }
  return next;
}

async function refreshDemandStatus(demandId) {
  if (!demandId) return null;
  const dR = await dbQuery(
    `SELECT id::text AS id, birds_needed AS "birdsNeeded", status FROM pipeline_demands WHERE id = $1::uuid`,
    [demandId]
  );
  const d = dR.rows[0];
  if (!d) return null;
  const filled = await filledBirdsForDemand(demandId);
  const next = deriveDemandStatusAfterMatch(d.birdsNeeded, filled, d.status);
  if (next !== d.status) {
    await dbQuery(`UPDATE pipeline_demands SET status = $2, updated_at = now() WHERE id = $1::uuid`, [
      demandId,
      next,
    ]);
  }
  return next;
}

const BUYER_SELECT = `
  id::text AS id, name, buyer_type AS "buyerType", district, whatsapp, phone,
  weekly_birds_min AS "weeklyBirdsMin", weekly_birds_max AS "weeklyBirdsMax",
  weight_kg_min AS "weightKgMin", weight_kg_max AS "weightKgMax",
  prefers_slaughtered AS "prefersSlaughtered", collect_or_delivery AS "collectOrDelivery",
  notice_days AS "noticeDays", notes, active, created_at AS "createdAt"
`;

// ——— Buyers ———

router.get("/buyers", async (req, res) => {
  if (!requireDb(res) || !requireDesk(req, res)) return;
  const activeOnly = String(req.query.active ?? "1") !== "0";
  try {
    const r = await dbQuery(
      `SELECT ${BUYER_SELECT}
         FROM pipeline_buyers
        WHERE ($1::boolean = false OR active = true)
        ORDER BY name ASC
        LIMIT 500`,
      [activeOnly]
    );
    res.json({ buyers: r.rows });
  } catch (e) {
    res.status(503).json({ error: e instanceof Error ? e.message : "Could not list buyers." });
  }
});

router.post("/buyers", async (req, res) => {
  if (!requireDb(res) || !requireDesk(req, res)) return;
  const body = req.body ?? {};
  const name = str(body.name, 200);
  if (!name) return res.status(400).json({ error: "name is required." });
  const buyerType = str(body.buyerType ?? body.type, 40) || "other";
  try {
    const r = await dbQuery(
      `INSERT INTO pipeline_buyers
         (name, buyer_type, district, whatsapp, phone, weekly_birds_min, weekly_birds_max,
          weight_kg_min, weight_kg_max, prefers_slaughtered, collect_or_delivery, notice_days, notes, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14::uuid)
       RETURNING ${BUYER_SELECT}`,
      [
        name,
        buyerType,
        str(body.district, 120),
        str(body.whatsapp, 40),
        str(body.phone, 40),
        numOrNull(body.weeklyBirdsMin),
        numOrNull(body.weeklyBirdsMax),
        numOrNull(body.weightKgMin),
        numOrNull(body.weightKgMax),
        bool(body.prefersSlaughtered, true),
        str(body.collectOrDelivery, 20) || "either",
        numOrNull(body.noticeDays) ?? 2,
        str(body.notes, 2000),
        req.authUser.id,
      ]
    );
    audit(req.authUser, "pipeline.buyer.create", "pipeline_buyer", r.rows[0].id, { name });
    res.status(201).json({ buyer: r.rows[0] });
  } catch (e) {
    res.status(503).json({ error: e instanceof Error ? e.message : "Could not create buyer." });
  }
});

router.patch("/buyers/:id", async (req, res) => {
  if (!requireDb(res) || !requireDesk(req, res)) return;
  const id = req.params.id;
  const body = req.body ?? {};
  try {
    const r = await dbQuery(
      `UPDATE pipeline_buyers SET
          name = COALESCE($2, name),
          buyer_type = COALESCE($3, buyer_type),
          district = COALESCE($4, district),
          whatsapp = COALESCE($5, whatsapp),
          phone = COALESCE($6, phone),
          weekly_birds_min = COALESCE($7, weekly_birds_min),
          weekly_birds_max = COALESCE($8, weekly_birds_max),
          weight_kg_min = COALESCE($9, weight_kg_min),
          weight_kg_max = COALESCE($10, weight_kg_max),
          prefers_slaughtered = COALESCE($11, prefers_slaughtered),
          collect_or_delivery = COALESCE($12, collect_or_delivery),
          notice_days = COALESCE($13, notice_days),
          notes = COALESCE($14, notes),
          active = COALESCE($15, active),
          updated_at = now()
        WHERE id = $1::uuid
        RETURNING ${BUYER_SELECT}`,
      [
        id,
        body.name != null ? str(body.name, 200) : null,
        body.buyerType != null || body.type != null ? str(body.buyerType ?? body.type, 40) : null,
        body.district !== undefined ? str(body.district, 120) : null,
        body.whatsapp !== undefined ? str(body.whatsapp, 40) : null,
        body.phone !== undefined ? str(body.phone, 40) : null,
        body.weeklyBirdsMin !== undefined ? numOrNull(body.weeklyBirdsMin) : null,
        body.weeklyBirdsMax !== undefined ? numOrNull(body.weeklyBirdsMax) : null,
        body.weightKgMin !== undefined ? numOrNull(body.weightKgMin) : null,
        body.weightKgMax !== undefined ? numOrNull(body.weightKgMax) : null,
        body.prefersSlaughtered !== undefined ? bool(body.prefersSlaughtered) : null,
        body.collectOrDelivery != null ? str(body.collectOrDelivery, 20) : null,
        body.noticeDays !== undefined ? numOrNull(body.noticeDays) : null,
        body.notes !== undefined ? str(body.notes, 2000) : null,
        body.active !== undefined ? bool(body.active, true) : null,
      ]
    );
    if (!r.rows[0]) return res.status(404).json({ error: "Buyer not found." });
    audit(req.authUser, "pipeline.buyer.update", "pipeline_buyer", id, {});
    res.json({ buyer: r.rows[0] });
  } catch (e) {
    res.status(503).json({ error: e instanceof Error ? e.message : "Could not update buyer." });
  }
});

// ——— Lots ———

router.get("/lots", async (req, res) => {
  if (!requireDb(res) || !requireDesk(req, res)) return;
  const status = str(req.query.status, 40);
  const district = str(req.query.district, 120);
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
        WHERE ($1::text IS NULL OR l.status = $1)
          AND ($2::text IS NULL OR l.district ILIKE $2)
          AND l.status <> 'cancelled'
        ORDER BY l.ready_from ASC NULLS LAST, l.created_at DESC
        LIMIT 500`,
      [status, district ? `%${district}%` : null]
    );
    const lots = r.rows.map((row) => {
      const mapped = mapLotRow(row);
      const matched = Number(row.matchedBirds ?? 0);
      mapped.matchedBirds = matched;
      mapped.remainingBirds = remainingBirds(mapped.birdCount, matched);
      return decorateListing(mapped);
    });
    res.json({ lots });
  } catch (e) {
    res.status(503).json({ error: e instanceof Error ? e.message : "Could not list lots." });
  }
});

router.get("/lots/by-flock/:flockId", async (req, res) => {
  if (!requireDb(res)) return;
  if (!canScoutPipeline(req.authUser) && !canOptInManagedFlock(req.authUser)) {
    return res.status(403).json({ error: "Not allowed." });
  }
  const flockId = req.params.flockId;
  try {
    const snap = await loadFlockLotSnapshot(dbQuery, flockId);
    if (!snap) return res.status(404).json({ error: "Flock not found." });
    if (
      !isPlatformSuperuser(req.authUser) &&
      req.authUser.role !== "sales_coordinator" &&
      String(snap.companyId) !== String(req.authUser.companyId)
    ) {
      return res.status(403).json({ error: "Flock not in your company." });
    }
    const r = await dbQuery(
      `SELECT ${LOT_SELECT}
         FROM pipeline_lots l
        WHERE l.flock_id = $1::uuid
          AND l.status IN ('draft', 'open', 'partial')
        ORDER BY l.created_at DESC
        LIMIT 1`,
      [flockId]
    );
    res.json({
      snapshot: snap,
      lot: r.rows[0] ? mapLotRow(r.rows[0]) : null,
    });
  } catch (e) {
    res.status(503).json({ error: e instanceof Error ? e.message : "Could not load flock lot." });
  }
});

router.post("/lots/opt-in", async (req, res) => {
  if (!requireDb(res)) return;
  if (!canOptInManagedFlock(req.authUser)) {
    return res.status(403).json({ error: "Manager or above required to opt a flock into the pipeline." });
  }
  const body = req.body ?? {};
  const flockId = str(body.flockId, 64);
  if (!flockId) return res.status(400).json({ error: "flockId is required." });

  try {
    const snap = await loadFlockLotSnapshot(dbQuery, flockId);
    if (!snap) return res.status(404).json({ error: "Flock not found." });
    if (
      !isPlatformSuperuser(req.authUser) &&
      req.authUser.role !== "sales_coordinator" &&
      String(snap.companyId) !== String(req.authUser.companyId)
    ) {
      return res.status(403).json({ error: "Flock not in your company." });
    }

    const week = resolveSellingWeek({
      placementDate: snap.placementDate,
      readyFrom: str(body.readyFrom, 10) || snap.readyFrom,
      readyTo: str(body.readyTo, 10) || snap.readyTo,
    });
    const readyFrom = week.readyFrom;
    const readyTo = week.readyTo;
    if (!readyFrom || !readyTo) {
      return res.status(400).json({ error: "Chicks-in date is required to suggest a selling week." });
    }

    const birdCount = numOrNull(body.birdCount) ?? snap.birdCount;
    const saleable = numOrNull(body.saleableBirds) ?? birdCount;
    const avgWeight = numOrNull(body.avgWeightKg) ?? snap.avgWeightKg;
    const expectedWeight = numOrNull(body.expectedWeightKg) ?? snap.expectedWeightKg;
    const ask = numOrNull(body.askPricePerKg);
    const district = str(body.district, 120);
    const contactPhone = str(body.contactPhone, 40);
    const notes = str(body.notes, 2000);

    const existing = await dbQuery(
      `SELECT id::text AS id FROM pipeline_lots
        WHERE flock_id = $1::uuid AND status IN ('draft', 'open', 'partial')
        LIMIT 1`,
      [flockId]
    );

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
      flockId,
      companyVerified,
    });

    let row;
    if (existing.rows[0]) {
      await dbQuery(
        `UPDATE pipeline_lots SET
            bird_count = $2,
            saleable_birds = $3,
            breed_code = $4,
            avg_weight_kg = $5,
            expected_weight_kg = $6,
            ready_from = $7::date,
            ready_to = $8::date,
            placement_date = COALESCE($16::date, placement_date),
            ask_price_per_kg = COALESCE($9, ask_price_per_kg),
            farmer_can_slaughter = COALESCE($10, farmer_can_slaughter),
            delivery_available = COALESCE($11, delivery_available),
            min_order_birds = COALESCE($18, min_order_birds),
            district = COALESCE($12, district),
            contact_phone = COALESCE($13, contact_phone),
            farm_label = COALESCE($14, farm_label),
            notes = COALESCE($15, notes),
            status = CASE WHEN status = 'draft' THEN 'open' ELSE status END,
            opted_in_at = COALESCE(opted_in_at, now()),
            rank_eligible = CASE WHEN scout_confirmed_at IS NULL THEN false ELSE rank_eligible END,
            scout_confirmed_at = COALESCE(scout_confirmed_at, $17::timestamptz),
            updated_at = now()
          WHERE id = $1::uuid`,
        [
          existing.rows[0].id,
          birdCount,
          saleable,
          snap.breedCode,
          avgWeight,
          expectedWeight,
          readyFrom,
          readyTo,
          ask,
          body.farmerCanSlaughter !== undefined ? bool(body.farmerCanSlaughter) : null,
          body.deliveryAvailable !== undefined ? bool(body.deliveryAvailable) : null,
          district || null,
          contactPhone || null,
          snap.farmLabel,
          notes || null,
          week.placementDate || null,
          recent.scoutConfirmedAt,
          body.minOrderBirds !== undefined ? numOrNull(body.minOrderBirds) : null,
        ]
      );
      const refetch = await dbQuery(
        `SELECT ${LOT_SELECT} FROM pipeline_lots l WHERE l.id = $1::uuid`,
        [existing.rows[0].id]
      );
      row = refetch.rows[0];
    } else {
      const ins = await dbQuery(
        `INSERT INTO pipeline_lots
           (source, company_id, flock_id, farm_label, contact_phone, district,
            bird_count, saleable_birds, breed_code, avg_weight_kg, expected_weight_kg,
            ready_from, ready_to, placement_date, ask_price_per_kg, farmer_can_slaughter, delivery_available,
            min_order_birds,
            status, verification_status, listed_by, opted_in_at, notes, created_by,
            rank_eligible, scout_confirmed_at)
         VALUES
           ('managed_flock', $1::uuid, $2::uuid, $3, $4, $5,
            $6, $7, $8, $9, $10,
            $11::date, $12::date, $13::date, $14, $15, $16,
            $20,
            'open', 'pending_review', $18::uuid, now(), $17, $18::uuid,
            false, $19::timestamptz)
         RETURNING id::text AS id`,
        [
          snap.companyId,
          flockId,
          snap.farmLabel,
          contactPhone,
          district,
          birdCount,
          saleable,
          snap.breedCode,
          avgWeight,
          expectedWeight,
          readyFrom,
          readyTo,
          week.placementDate || snap.placementDate,
          ask,
          bool(body.farmerCanSlaughter, false),
          bool(body.deliveryAvailable, false),
          notes,
          req.authUser.id,
          recent.confirm ? new Date() : null,
          numOrNull(body.minOrderBirds),
        ]
      );
      const refetch = await dbQuery(
        `SELECT ${LOT_SELECT} FROM pipeline_lots l WHERE l.id = $1::uuid`,
        [ins.rows[0].id]
      );
      row = refetch.rows[0];
    }

    audit(req.authUser, "pipeline.lot.opt_in", "pipeline_lot", row.id, { flockId });
    res.status(201).json({ lot: mapLotRow(row) });
  } catch (e) {
    res.status(503).json({ error: e instanceof Error ? e.message : "Could not opt in flock." });
  }
});

router.post("/lots/refresh/:lotId", async (req, res) => {
  if (!requireDb(res)) return;
  if (!canOptInManagedFlock(req.authUser) && !canAccessPipelineDesk(req.authUser)) {
    return res.status(403).json({ error: "Not allowed." });
  }
  const lotId = req.params.lotId;
  try {
    const lotR = await dbQuery(
      `SELECT ${LOT_SELECT} FROM pipeline_lots l WHERE l.id = $1::uuid`,
      [lotId]
    );
    const lot = lotR.rows[0];
    if (!lot) return res.status(404).json({ error: "Lot not found." });
    if (lot.source !== "managed_flock" || !lot.flockId) {
      return res.status(400).json({ error: "Only managed flock lots can be refreshed from flock data." });
    }
    const snap = await loadFlockLotSnapshot(dbQuery, lot.flockId);
    if (!snap) return res.status(404).json({ error: "Flock not found." });

    await dbQuery(
      `UPDATE pipeline_lots SET
          bird_count = $2,
          breed_code = $3,
          avg_weight_kg = COALESCE($4, avg_weight_kg),
          expected_weight_kg = COALESCE($5, expected_weight_kg),
          ready_from = COALESCE($6::date, ready_from),
          ready_to = COALESCE($7::date, ready_to),
          farm_label = COALESCE($8, farm_label),
          company_id = COALESCE($9::uuid, company_id),
          updated_at = now()
        WHERE id = $1::uuid`,
      [
        lotId,
        snap.birdCount,
        snap.breedCode,
        snap.avgWeightKg,
        snap.expectedWeightKg,
        snap.readyFrom,
        snap.readyTo,
        snap.farmLabel,
        snap.companyId,
      ]
    );
    await refreshLotStatus(lotId);
    const refetch = await dbQuery(
      `SELECT ${LOT_SELECT} FROM pipeline_lots l WHERE l.id = $1::uuid`,
      [lotId]
    );
    audit(req.authUser, "pipeline.lot.refresh", "pipeline_lot", lotId, {});
    res.json({ lot: mapLotRow(refetch.rows[0]) });
  } catch (e) {
    res.status(503).json({ error: e instanceof Error ? e.message : "Could not refresh lot." });
  }
});

router.post("/lots/scout", async (req, res) => {
  if (!requireDb(res)) return;
  if (!canScoutPipeline(req.authUser)) {
    return res.status(403).json({ error: "Vet or pipeline role required to scout inventory." });
  }
  const body = req.body ?? {};
  const flockId = str(body.flockId, 64);
  const birdCount = numOrNull(body.birdCount);
  const readyFrom = str(body.readyFrom, 10);
  const readyTo = str(body.readyTo, 10);
  const district = str(body.district, 120);
  if (!birdCount || birdCount <= 0) return res.status(400).json({ error: "birdCount is required." });
  if (!readyFrom || !readyTo) return res.status(400).json({ error: "readyFrom and readyTo are required." });
  if (!district) return res.status(400).json({ error: "district is required for scout lots." });

  try {
    // Managed flock scout → opt-in/update path
    if (flockId) {
      req.body = { ...body, flockId };
      // Reuse opt-in with scout attribution
      const snap = await loadFlockLotSnapshot(dbQuery, flockId);
      if (!snap) return res.status(404).json({ error: "Flock not found." });
      if (
        !isPlatformSuperuser(req.authUser) &&
        req.authUser.role !== "sales_coordinator" &&
        String(snap.companyId) !== String(req.authUser.companyId)
      ) {
        return res.status(403).json({ error: "Flock not in your company." });
      }
      // Delegate by calling opt-in logic inline
      const saleable = numOrNull(body.saleableBirds) ?? birdCount;
      const existing = await dbQuery(
        `SELECT id::text AS id FROM pipeline_lots
          WHERE flock_id = $1::uuid AND status IN ('draft', 'open', 'partial') LIMIT 1`,
        [flockId]
      );
      let lotId;
      if (existing.rows[0]) {
        lotId = existing.rows[0].id;
        await dbQuery(
          `UPDATE pipeline_lots SET
              bird_count = $2, saleable_birds = $3, avg_weight_kg = COALESCE($4, avg_weight_kg),
              expected_weight_kg = COALESCE($5, expected_weight_kg),
              ready_from = $6::date, ready_to = $7::date,
              ask_price_per_kg = COALESCE($8, ask_price_per_kg),
              farmer_can_slaughter = $9, delivery_available = $10,
              district = $11, contact_phone = COALESCE($12, contact_phone),
              farm_label = COALESCE($13, farm_label), notes = COALESCE($14, notes),
              scouted_by = $15::uuid, status = CASE WHEN status = 'draft' THEN 'open' ELSE status END,
              opted_in_at = COALESCE(opted_in_at, now()), updated_at = now()
            WHERE id = $1::uuid`,
          [
            lotId,
            birdCount,
            saleable,
            numOrNull(body.avgWeightKg) ?? snap.avgWeightKg,
            numOrNull(body.expectedWeightKg) ?? snap.expectedWeightKg,
            readyFrom,
            readyTo,
            numOrNull(body.askPricePerKg),
            bool(body.farmerCanSlaughter, false),
            bool(body.deliveryAvailable, false),
            district,
            str(body.contactPhone, 40),
            snap.farmLabel,
            str(body.notes, 2000),
            req.authUser.id,
          ]
        );
      } else {
        const ins = await dbQuery(
          `INSERT INTO pipeline_lots
             (source, company_id, flock_id, farm_label, contact_phone, district,
              bird_count, saleable_birds, breed_code, avg_weight_kg, expected_weight_kg,
              ready_from, ready_to, ask_price_per_kg, farmer_can_slaughter, delivery_available,
              status, verification_status, scouted_by, listed_by, opted_in_at, notes, created_by)
           VALUES
             ('managed_flock', $1::uuid, $2::uuid, $3, $4, $5,
              $6, $7, $8, $9, $10, $11::date, $12::date, $13, $14, $15,
              'open', 'pending_review', $16::uuid, $16::uuid, now(), $17, $16::uuid)
           RETURNING id::text AS id`,
          [
            snap.companyId,
            flockId,
            snap.farmLabel,
            str(body.contactPhone, 40),
            district,
            birdCount,
            saleable,
            snap.breedCode,
            numOrNull(body.avgWeightKg) ?? snap.avgWeightKg,
            numOrNull(body.expectedWeightKg) ?? snap.expectedWeightKg,
            readyFrom,
            readyTo,
            numOrNull(body.askPricePerKg),
            bool(body.farmerCanSlaughter, false),
            bool(body.deliveryAvailable, false),
            req.authUser.id,
            str(body.notes, 2000),
          ]
        );
        lotId = ins.rows[0].id;
      }
      const refetch = await dbQuery(
        `SELECT ${LOT_SELECT} FROM pipeline_lots l WHERE l.id = $1::uuid`,
        [lotId]
      );
      audit(req.authUser, "pipeline.lot.scout_managed", "pipeline_lot", lotId, { flockId });
      return res.status(201).json({ lot: mapLotRow(refetch.rows[0]) });
    }

    const farmLabel = str(body.farmLabel, 200);
    if (!farmLabel) return res.status(400).json({ error: "farmLabel is required for off-platform scout lots." });

    const ins = await dbQuery(
      `INSERT INTO pipeline_lots
         (source, farm_label, contact_phone, district,
          bird_count, saleable_birds, breed_code, avg_weight_kg, expected_weight_kg,
          ready_from, ready_to, ask_price_per_kg, farmer_can_slaughter, delivery_available,
          status, verification_status, scouted_by, listed_by, opted_in_at, notes, created_by,
          farm_profile_id, visibility_tier, product_type, public_title)
       VALUES
         ('scout', $1, $2, $3,
          $4, $5, $6, $7, $8,
          $9::date, $10::date, $11, $12, $13,
          'open', 'pending_review', $14::uuid, $14::uuid, now(), $15, $14::uuid,
          $16::uuid, $17, $18, $19)
       RETURNING id::text AS id`,
      [
        farmLabel,
        str(body.contactPhone, 40),
        district,
        birdCount,
        numOrNull(body.saleableBirds) ?? birdCount,
        str(body.breedCode, 80),
        numOrNull(body.avgWeightKg),
        numOrNull(body.expectedWeightKg),
        readyFrom,
        readyTo,
        numOrNull(body.askPricePerKg),
        bool(body.farmerCanSlaughter, false),
        bool(body.deliveryAvailable, false),
        req.authUser.id,
        str(body.notes, 2000),
        str(body.farmProfileId, 64),
        str(body.visibilityTier, 40) || "brokered_public",
        str(body.productType, 40) || "broiler_birds",
        str(body.publicTitle, 160),
      ]
    );
    const refetch = await dbQuery(
      `SELECT ${LOT_SELECT} FROM pipeline_lots l WHERE l.id = $1::uuid`,
      [ins.rows[0].id]
    );
    audit(req.authUser, "pipeline.lot.scout", "pipeline_lot", ins.rows[0].id, { district });
    res.status(201).json({ lot: mapLotRow(refetch.rows[0]) });
  } catch (e) {
    res.status(503).json({ error: e instanceof Error ? e.message : "Could not create scout lot." });
  }
});

router.patch("/lots/:id", async (req, res) => {
  if (!requireDb(res) || !requireDesk(req, res)) return;
  const id = req.params.id;
  const body = req.body ?? {};
  try {
    await dbQuery(
      `UPDATE pipeline_lots SET
          district = COALESCE($2, district),
          contact_phone = COALESCE($3, contact_phone),
          farm_label = COALESCE($4, farm_label),
          bird_count = COALESCE($5, bird_count),
          saleable_birds = COALESCE($6, saleable_birds),
          avg_weight_kg = COALESCE($7, avg_weight_kg),
          expected_weight_kg = COALESCE($8, expected_weight_kg),
          ready_from = COALESCE($9::date, ready_from),
          ready_to = COALESCE($10::date, ready_to),
          ask_price_per_kg = COALESCE($11, ask_price_per_kg),
          farmer_can_slaughter = COALESCE($12, farmer_can_slaughter),
          delivery_available = COALESCE($13, delivery_available),
          status = COALESCE($14, status),
          notes = COALESCE($15, notes),
          updated_at = now()
        WHERE id = $1::uuid`,
      [
        id,
        body.district !== undefined ? str(body.district, 120) : null,
        body.contactPhone !== undefined ? str(body.contactPhone, 40) : null,
        body.farmLabel !== undefined ? str(body.farmLabel, 200) : null,
        body.birdCount !== undefined ? numOrNull(body.birdCount) : null,
        body.saleableBirds !== undefined ? numOrNull(body.saleableBirds) : null,
        body.avgWeightKg !== undefined ? numOrNull(body.avgWeightKg) : null,
        body.expectedWeightKg !== undefined ? numOrNull(body.expectedWeightKg) : null,
        body.readyFrom !== undefined ? str(body.readyFrom, 10) : null,
        body.readyTo !== undefined ? str(body.readyTo, 10) : null,
        body.askPricePerKg !== undefined ? numOrNull(body.askPricePerKg) : null,
        body.farmerCanSlaughter !== undefined ? bool(body.farmerCanSlaughter) : null,
        body.deliveryAvailable !== undefined ? bool(body.deliveryAvailable) : null,
        body.status != null ? str(body.status, 40) : null,
        body.notes !== undefined ? str(body.notes, 2000) : null,
      ]
    );
    const refetch = await dbQuery(
      `SELECT ${LOT_SELECT} FROM pipeline_lots l WHERE l.id = $1::uuid`,
      [id]
    );
    if (!refetch.rows[0]) return res.status(404).json({ error: "Lot not found." });
    audit(req.authUser, "pipeline.lot.update", "pipeline_lot", id, { status: body.status });
    res.json({ lot: mapLotRow(refetch.rows[0]) });
  } catch (e) {
    res.status(503).json({ error: e instanceof Error ? e.message : "Could not update lot." });
  }
});

// ——— Demands ———

router.get("/demands", async (req, res) => {
  if (!requireDb(res) || !requireDesk(req, res)) return;
  const status = str(req.query.status, 40);
  try {
    const r = await dbQuery(
      `SELECT d.id::text AS id, d.buyer_id::text AS "buyerId", b.name AS "buyerName",
              d.birds_needed AS "birdsNeeded", d.weight_kg_min AS "weightKgMin",
              d.weight_kg_max AS "weightKgMax", d.needed_from AS "neededFrom",
              d.needed_to AS "neededTo", d.district_preference AS "districtPreference",
              d.slaughtered_required AS "slaughteredRequired",
              d.delivery_required AS "deliveryRequired", d.status, d.channel,
              d.raw_notes AS "rawNotes", d.created_at AS "createdAt",
              COALESCE(f.filled, 0)::int AS "filledBirds"
         FROM pipeline_demands d
         JOIN pipeline_buyers b ON b.id = d.buyer_id
         LEFT JOIN LATERAL (
           SELECT SUM(birds)::int AS filled FROM pipeline_matches pm
            WHERE pm.demand_id = d.id AND pm.status IN ('committed', 'delivered')
         ) f ON true
        WHERE ($1::text IS NULL OR d.status = $1)
          AND d.status <> 'cancelled'
        ORDER BY d.needed_from ASC NULLS LAST, d.created_at DESC
        LIMIT 500`,
      [status]
    );
    res.json({ demands: r.rows });
  } catch (e) {
    res.status(503).json({ error: e instanceof Error ? e.message : "Could not list demands." });
  }
});

router.post("/demands", async (req, res) => {
  if (!requireDb(res) || !requireDesk(req, res)) return;
  const body = req.body ?? {};
  const buyerId = str(body.buyerId, 64);
  const birdsNeeded = numOrNull(body.birdsNeeded);
  if (!buyerId) return res.status(400).json({ error: "buyerId is required." });
  if (!birdsNeeded || birdsNeeded <= 0) return res.status(400).json({ error: "birdsNeeded is required." });
  try {
    const r = await dbQuery(
      `INSERT INTO pipeline_demands
         (buyer_id, birds_needed, weight_kg_min, weight_kg_max, needed_from, needed_to,
          district_preference, slaughtered_required, delivery_required, status, channel, raw_notes, created_by)
       VALUES ($1::uuid, $2, $3, $4, $5::date, $6::date, $7, $8, $9, 'open', $10, $11, $12::uuid)
       RETURNING id::text AS id, buyer_id::text AS "buyerId", birds_needed AS "birdsNeeded",
                 weight_kg_min AS "weightKgMin", weight_kg_max AS "weightKgMax",
                 needed_from AS "neededFrom", needed_to AS "neededTo",
                 district_preference AS "districtPreference",
                 slaughtered_required AS "slaughteredRequired",
                 delivery_required AS "deliveryRequired", status, channel,
                 raw_notes AS "rawNotes", created_at AS "createdAt"`,
      [
        buyerId,
        birdsNeeded,
        numOrNull(body.weightKgMin),
        numOrNull(body.weightKgMax),
        str(body.neededFrom, 10),
        str(body.neededTo, 10),
        str(body.districtPreference, 120),
        bool(body.slaughteredRequired, true),
        bool(body.deliveryRequired, false),
        str(body.channel, 20) || "whatsapp",
        str(body.rawNotes, 4000),
        req.authUser.id,
      ]
    );
    audit(req.authUser, "pipeline.demand.create", "pipeline_demand", r.rows[0].id, { buyerId });
    res.status(201).json({ demand: r.rows[0] });
  } catch (e) {
    res.status(503).json({ error: e instanceof Error ? e.message : "Could not create demand." });
  }
});

// ——— Matches ———

router.get("/matches", async (req, res) => {
  if (!requireDb(res) || !requireDesk(req, res)) return;
  const status = str(req.query.status, 40);
  try {
    const r = await dbQuery(
      `SELECT m.id::text AS id, m.lot_id::text AS "lotId", m.demand_id::text AS "demandId",
              m.buyer_id::text AS "buyerId", b.name AS "buyerName",
              m.birds, m.agreed_price_per_kg AS "agreedPricePerKg",
              m.ready_date AS "readyDate", m.status,
              m.transport_notes AS "transportNotes", m.slaughter_notes AS "slaughterNotes",
              m.learning_notes AS "learningNotes",
              m.sales_order_id::text AS "salesOrderId",
              m.commission_vet_user_id::text AS "commissionVetUserId",
              m.matched_by::text AS "matchedBy", m.created_at AS "createdAt",
              l.district AS "lotDistrict", l.farm_label AS "lotFarmLabel",
              l.source AS "lotSource", l.flock_id::text AS "flockId"
         FROM pipeline_matches m
         JOIN pipeline_buyers b ON b.id = m.buyer_id
         JOIN pipeline_lots l ON l.id = m.lot_id
        WHERE ($1::text IS NULL OR m.status = $1)
        ORDER BY m.created_at DESC
        LIMIT 500`,
      [status]
    );
    res.json({ matches: r.rows });
  } catch (e) {
    res.status(503).json({ error: e instanceof Error ? e.message : "Could not list matches." });
  }
});

router.post("/matches", async (req, res) => {
  if (!requireDb(res) || !requireDesk(req, res)) return;
  const body = req.body ?? {};
  const lotId = str(body.lotId, 64);
  const buyerId = str(body.buyerId, 64);
  const birds = numOrNull(body.birds);
  if (!lotId || !buyerId) return res.status(400).json({ error: "lotId and buyerId are required." });
  if (!birds || birds <= 0) return res.status(400).json({ error: "birds must be > 0." });

  try {
    await dbQuery("BEGIN");
    const lotR = await dbQuery(
      `SELECT id::text AS id, bird_count AS "birdCount", status, ask_price_per_kg AS "askPricePerKg",
              scouted_by::text AS "scoutedBy"
         FROM pipeline_lots WHERE id = $1::uuid
         FOR UPDATE`,
      [lotId]
    );
    const lot = lotR.rows[0];
    if (!lot) {
      await dbQuery("ROLLBACK");
      return res.status(404).json({ error: "Lot not found." });
    }
    if (!["open", "partial", "draft"].includes(lot.status)) {
      await dbQuery("ROLLBACK");
      return res.status(400).json({ error: `Lot status ${lot.status} cannot be matched.` });
    }
    const matched = await matchedBirdsForLot(lotId);
    const left = remainingBirds(lot.birdCount, matched);
    if (birds > left) {
      await dbQuery("ROLLBACK");
      return res.status(400).json({ error: `Only ${left} birds remaining on this lot.` });
    }

    const demandId = str(body.demandId, 64);
    if (demandId) {
      const dR = await dbQuery(
        `SELECT id::text AS id, birds_needed AS "birdsNeeded", status FROM pipeline_demands WHERE id = $1::uuid FOR UPDATE`,
        [demandId]
      );
      const d = dR.rows[0];
      if (!d) {
        await dbQuery("ROLLBACK");
        return res.status(404).json({ error: "Demand not found." });
      }
      const filled = await filledBirdsForDemand(demandId);
      const dLeft = Math.max(0, Number(d.birdsNeeded) - filled);
      if (birds > dLeft) {
        await dbQuery("ROLLBACK");
        return res.status(400).json({ error: `Demand only needs ${dLeft} more birds.` });
      }
    }

    const r = await dbQuery(
      `INSERT INTO pipeline_matches
         (lot_id, demand_id, buyer_id, birds, agreed_price_per_kg, ready_date, status,
          transport_notes, slaughter_notes, learning_notes, commission_vet_user_id, matched_by)
       VALUES ($1::uuid, $2::uuid, $3::uuid, $4, $5, $6::date, 'committed', $7, $8, $9, $10::uuid, $11::uuid)
       RETURNING id::text AS id, lot_id::text AS "lotId", demand_id::text AS "demandId",
                 buyer_id::text AS "buyerId", birds, agreed_price_per_kg AS "agreedPricePerKg",
                 ready_date AS "readyDate", status, created_at AS "createdAt"`,
      [
        lotId,
        demandId,
        buyerId,
        birds,
        numOrNull(body.agreedPricePerKg) ?? lot.askPricePerKg,
        str(body.readyDate, 10),
        str(body.transportNotes, 2000),
        str(body.slaughterNotes, 2000),
        str(body.learningNotes, 2000),
        str(body.commissionVetUserId, 64) || lot.scoutedBy,
        req.authUser.id,
      ]
    );

    await refreshLotStatus(lotId);
    await refreshDemandStatus(demandId);
    await dbQuery("COMMIT");
    audit(req.authUser, "pipeline.match.create", "pipeline_match", r.rows[0].id, {
      lotId,
      buyerId,
      birds,
    });
    res.status(201).json({ match: r.rows[0] });
  } catch (e) {
    try {
      await dbQuery("ROLLBACK");
    } catch {
      /* ignore */
    }
    res.status(503).json({ error: e instanceof Error ? e.message : "Could not create match." });
  }
});

router.patch("/matches/:id", async (req, res) => {
  if (!requireDb(res) || !requireDesk(req, res)) return;
  const id = req.params.id;
  const body = req.body ?? {};
  const nextStatus = str(body.status, 40);
  try {
    const cur = await dbQuery(
      `SELECT m.id::text AS id, m.lot_id::text AS "lotId", m.demand_id::text AS "demandId",
              m.buyer_id::text AS "buyerId", m.birds, m.agreed_price_per_kg AS "agreedPricePerKg",
              m.status, m.sales_order_id::text AS "salesOrderId",
              m.commission_vet_user_id::text AS "commissionVetUserId",
              l.source AS "lotSource", l.flock_id::text AS "flockId",
              b.name AS "buyerName", b.phone AS "buyerPhone", b.whatsapp AS "buyerWhatsapp"
         FROM pipeline_matches m
         JOIN pipeline_lots l ON l.id = m.lot_id
         JOIN pipeline_buyers b ON b.id = m.buyer_id
        WHERE m.id = $1::uuid`,
      [id]
    );
    const match = cur.rows[0];
    if (!match) return res.status(404).json({ error: "Match not found." });

    let salesOrderId = match.salesOrderId;

    // Deliver + managed flock → create poultry_sales_orders bridge
    if (nextStatus === "delivered" && match.status !== "delivered" && !salesOrderId) {
      if (match.lotSource === "managed_flock" && match.flockId) {
        const price = numOrNull(body.agreedPricePerKg) ?? match.agreedPricePerKg ?? 0;
        const totalWeight =
          numOrNull(body.totalWeightKg) ??
          (numOrNull(body.avgWeightKg) != null
            ? numOrNull(body.avgWeightKg) * match.birds
            : null);
        if (totalWeight == null || totalWeight <= 0) {
          return res.status(400).json({
            error: "totalWeightKg (or avgWeightKg) required to close managed match to a sales order.",
          });
        }
        const orderDate = str(body.orderDate, 10) || new Date().toISOString().slice(0, 10);
        const sale = await dbQuery(
          `INSERT INTO poultry_sales_orders
             (flock_id, recorded_by, order_date, number_of_birds, total_weight_kg, price_per_kg,
              buyer_name, buyer_contact, submission_status, accounting_status)
           VALUES ($1::uuid, $2::uuid, $3::date, $4, $5::numeric, $6::numeric, $7, $8, 'approved', 'not_applicable')
           RETURNING id::text AS id`,
          [
            match.flockId,
            req.authUser.id,
            orderDate,
            match.birds,
            totalWeight,
            price,
            match.buyerName,
            match.buyerWhatsapp || match.buyerPhone,
          ]
        );
        salesOrderId = sale.rows[0].id;
      }
    }

    await dbQuery(
      `UPDATE pipeline_matches SET
          status = COALESCE($2, status),
          transport_notes = COALESCE($3, transport_notes),
          slaughter_notes = COALESCE($4, slaughter_notes),
          learning_notes = COALESCE($5, learning_notes),
          agreed_price_per_kg = COALESCE($6, agreed_price_per_kg),
          sales_order_id = COALESCE($7::uuid, sales_order_id),
          updated_at = now()
        WHERE id = $1::uuid`,
      [
        id,
        nextStatus,
        body.transportNotes !== undefined ? str(body.transportNotes, 2000) : null,
        body.slaughterNotes !== undefined ? str(body.slaughterNotes, 2000) : null,
        body.learningNotes !== undefined ? str(body.learningNotes, 2000) : null,
        body.agreedPricePerKg !== undefined ? numOrNull(body.agreedPricePerKg) : null,
        salesOrderId,
      ]
    );

    if (nextStatus === "delivered" && match.status !== "delivered") {
      const settled = applyOpsSettle(
        { ...match, exceptionKind: match.exceptionKind || "none" },
        {
          actualBirds: body.actualBirds ?? match.birds,
          actualWeightKg: body.avgWeightKg ?? body.actualWeightKg,
          actualPricePerKg: body.agreedPricePerKg ?? body.actualPricePerKg,
        },
        req.authUser.id,
        new Date().toISOString()
      );
      if (!settled.error) {
        try {
          await dbQuery(
            `UPDATE pipeline_matches SET
                buyer_confirmed_at = COALESCE(buyer_confirmed_at, $2::timestamptz),
                farmer_confirmed_at = COALESCE(farmer_confirmed_at, $2::timestamptz),
                buyer_confirmed_by = COALESCE(buyer_confirmed_by, $3::uuid),
                farmer_confirmed_by = COALESCE(farmer_confirmed_by, $3::uuid),
                actual_birds = COALESCE($4::int, actual_birds),
                actual_weight_kg = COALESCE($5::numeric, actual_weight_kg),
                actual_price_per_kg = COALESCE($6::numeric, actual_price_per_kg),
                exception_resolved_at = COALESCE(exception_resolved_at, $2::timestamptz),
                updated_at = now()
              WHERE id = $1::uuid`,
            [
              id,
              settled.patch.buyerConfirmedAt,
              req.authUser.id,
              settled.patch.actualBirds,
              settled.patch.actualWeightKg,
              settled.patch.actualPricePerKg,
            ]
          );
        } catch (fulfillErr) {
          if (!isMissingFulfillmentColumn(fulfillErr)) throw fulfillErr;
        }
      }
    }

    // Accrue scout commission on first deliver (ops desk settle)
    if (nextStatus === "delivered" && match.status !== "delivered") {
      const lotExtra = await dbQuery(
        `SELECT avg_weight_kg AS "avgWeightKg", expected_weight_kg AS "expectedWeightKg",
                ask_price_per_kg AS "askPricePerKg", scouted_by::text AS "scoutedBy"
           FROM pipeline_lots WHERE id = $1::uuid`,
        [match.lotId]
      );
      const lot = lotExtra.rows[0];
      const scoutId = match.commissionVetUserId || lot?.scoutedBy;
      if (scoutId) {
        let ratePct = DEFAULT_SCOUT_COMMISSION_RATE_PCT;
        try {
          const rateR = await dbQuery(
            `SELECT setting_value FROM app_settings WHERE setting_key = 'pipeline_scout_commission_rate_pct' LIMIT 1`
          );
          const n = Number(rateR.rows[0]?.setting_value);
          if (Number.isFinite(n) && n > 0) ratePct = n;
        } catch {
          /* default */
        }
        const commission = computeScoutCommission({
          birds: match.birds,
          avgWeightKg: numOrNull(body.avgWeightKg) ?? lot?.avgWeightKg,
          expectedWeightKg: lot?.expectedWeightKg,
          agreedPricePerKg: numOrNull(body.agreedPricePerKg) ?? match.agreedPricePerKg,
          askPricePerKg: lot?.askPricePerKg,
          ratePct,
        });
        if (commission.ok) {
          await dbQuery(
            `UPDATE pipeline_matches SET
                commission_vet_user_id = COALESCE(commission_vet_user_id, $2::uuid),
                commission_rate_pct = $3,
                commission_amount_rwf = $4,
                commission_status = 'accrued',
                updated_at = now()
              WHERE id = $1::uuid AND commission_status = 'none'`,
            [id, scoutId, commission.ratePct, commission.amountRwf]
          );
          void emailForUserId(dbQuery, scoutId)
            .then((scout) => {
              if (!scout?.email) return;
              return notifyMany([scout], () =>
                buildCommissionAccruedEmail({
                  name: scout.fullName,
                  amountRwf: commission.amountRwf,
                })
              );
            })
            .catch(() => {});
        }
      }
    }

    await refreshLotStatus(match.lotId);
    await refreshDemandStatus(match.demandId);

    const refetch = await dbQuery(
      `SELECT m.id::text AS id, m.lot_id::text AS "lotId", m.demand_id::text AS "demandId",
              m.buyer_id::text AS "buyerId", m.birds, m.agreed_price_per_kg AS "agreedPricePerKg",
              m.ready_date AS "readyDate", m.status,
              m.transport_notes AS "transportNotes", m.slaughter_notes AS "slaughterNotes",
              m.learning_notes AS "learningNotes", m.sales_order_id::text AS "salesOrderId",
              m.created_at AS "createdAt"
         FROM pipeline_matches m WHERE m.id = $1::uuid`,
      [id]
    );
    audit(req.authUser, "pipeline.match.update", "pipeline_match", id, {
      status: nextStatus,
      salesOrderId,
    });
    res.json({ match: refetch.rows[0] });
  } catch (e) {
    res.status(503).json({ error: e instanceof Error ? e.message : "Could not update match." });
  }
});

// ——— Forward summary ———

router.get("/forward-summary", async (req, res) => {
  if (!requireDb(res)) return;
  if (!canAccessPipelineDesk(req.authUser) && !canBrowseMarket(req.authUser)) {
    return res.status(403).json({ error: "Not allowed." });
  }
  try {
    const buckets = forwardWeekBuckets();
    const r = await dbQuery(
      `SELECT l.district,
              l.ready_from AS "readyFrom",
              l.ready_to AS "readyTo",
              l.bird_count AS "birdCount",
              COALESCE(m.matched, 0)::int AS "matchedBirds",
              l.saleable_birds AS "saleableBirds"
         FROM pipeline_lots l
         LEFT JOIN LATERAL (
           SELECT SUM(birds)::int AS matched FROM pipeline_matches pm
            WHERE pm.lot_id = l.id AND pm.status IN ('committed', 'delivered')
         ) m ON true
        WHERE l.status IN ('open', 'partial', 'draft')`
    );

    const weeks = buckets.map((b) => {
      const byDistrict = {};
      let birds = 0;
      for (const row of r.rows) {
        const from = String(row.readyFrom).slice(0, 10);
        const to = String(row.readyTo).slice(0, 10);
        // Overlap with bucket
        if (to < b.from || from > b.to) continue;
        const rem = remainingBirds(row.birdCount, row.matchedBirds);
        const use = row.saleableBirds != null ? Math.min(rem, Number(row.saleableBirds)) : rem;
        if (use <= 0) continue;
        const d = row.district || "Unknown";
        byDistrict[d] = (byDistrict[d] || 0) + use;
        birds += use;
      }
      return { ...b, birds, byDistrict };
    });

    const demandR = await dbQuery(
      `SELECT COALESCE(SUM(d.birds_needed - COALESCE(f.filled, 0)), 0)::int AS open_birds
         FROM pipeline_demands d
         LEFT JOIN LATERAL (
           SELECT SUM(birds)::int AS filled FROM pipeline_matches pm
            WHERE pm.demand_id = d.id AND pm.status IN ('committed', 'delivered')
         ) f ON true
        WHERE d.status IN ('open', 'partial')`
    );

    res.json({
      weeks,
      openDemandBirds: Number(demandR.rows[0]?.open_birds ?? 0),
    });
  } catch (e) {
    res.status(503).json({ error: e instanceof Error ? e.message : "Could not load forward summary." });
  }
});

async function getCommissionRatePct() {
  try {
    const r = await dbQuery(
      `SELECT setting_value FROM app_settings WHERE setting_key = 'pipeline_scout_commission_rate_pct' LIMIT 1`
    );
    const n = Number(r.rows[0]?.setting_value);
    return Number.isFinite(n) && n > 0 ? n : DEFAULT_SCOUT_COMMISSION_RATE_PCT;
  } catch {
    return DEFAULT_SCOUT_COMMISSION_RATE_PCT;
  }
}

const marketRouteCtx = {
  dbQuery,
  hasDb,
  audit,
  getCommissionRatePct,
  helpers: {
    requireDb,
    requireDesk,
    str,
    numOrNull,
    bool,
    matchedBirdsForLot,
    refreshLotStatus,
  },
};
registerPipelineMarketRoutes(router, marketRouteCtx);
registerPipelineStorefrontRoutes(router, marketRouteCtx);
registerPipelineFulfillmentRoutes(router, marketRouteCtx);
registerPipelineWeighRoutes(router, marketRouteCtx);
registerPipelineSettlementRoutes(router, marketRouteCtx);

export default router;
