/**
 * Fulfillment handshake: plan logistics, dual confirm, ops exceptions.
 */

import {
  canAccessPipelineDesk,
  canListFarmerLots,
  computeScoutCommission,
  DEFAULT_SCOUT_COMMISSION_RATE_PCT,
  isBuyerRole,
} from "../services/pipeline/pipeline.js";
import { farmerOwnsLot, isMarketOnlySeller, loadProfileForFarmer } from "../services/pipeline/farmProfiles.js";
import {
  FULFILLMENT_SELECT,
  applyOpenException,
  applyOpsSettle,
  applyPlanLogistics,
  applyResolveException,
  applySideConfirm,
  commissionInputs,
  fulfillmentMigrationMessage,
  isMissingFulfillmentColumn,
  mapFulfillmentJob,
} from "../services/pipeline/fulfillment.js";
import {
  buildCommissionAccruedEmail,
  buildFulfillmentConfirmedEmail,
  buildFulfillmentExceptionEmail,
  buildFulfillmentPlannedEmail,
  buildFulfillmentSettledEmail,
  emailForBuyerId,
  emailForUserId,
  emailsForDeskRoles,
  emailsForLotOwners,
  notifyMany,
} from "../services/pipeline/marketNotify.js";

const FROM_SQL = `
  FROM pipeline_matches m
  JOIN pipeline_lots l ON l.id = m.lot_id
  JOIN pipeline_buyers b ON b.id = m.buyer_id
  LEFT JOIN farm_profiles fp ON fp.id = l.farm_profile_id
`;

function nowIso() {
  return new Date().toISOString();
}

function viewerFor(user, job, profile = null) {
  if (canAccessPipelineDesk(user)) return "ops";
  if (isBuyerRole(user) && job.buyerUserId && String(job.buyerUserId) === String(user.id)) {
    return "buyer";
  }
  if (canListFarmerLots(user) && farmerOwnsLot(user, {
    companyId: job.lotCompanyId,
    listedBy: job.listedBy,
    farmProfileId: job.farmProfileId,
  }, profile)) {
    return "farmer";
  }
  return null;
}

function patchToUpdate(patch) {
  return {
    collect_or_delivery: patch.collectOrDelivery,
    slaughter_mode: patch.slaughterMode,
    delivery_actor: patch.deliveryActor,
    fulfill_window_start: patch.fulfillWindowStart,
    fulfill_window_end: patch.fulfillWindowEnd,
    logistics_notes: patch.logisticsNotes,
    logistics_planned_at: patch.logisticsPlannedAt,
    logistics_planned_by: patch.logisticsPlannedBy,
    actual_birds: patch.actualBirds,
    actual_weight_kg: patch.actualWeightKg,
    actual_price_per_kg: patch.actualPricePerKg,
    buyer_confirmed_at: patch.buyerConfirmedAt,
    buyer_confirmed_by: patch.buyerConfirmedBy,
    farmer_confirmed_at: patch.farmerConfirmedAt,
    farmer_confirmed_by: patch.farmerConfirmedBy,
    exception_kind: patch.exceptionKind,
    exception_notes: patch.exceptionNotes,
    exception_opened_at: patch.exceptionOpenedAt,
    exception_opened_by: patch.exceptionOpenedBy,
    exception_resolved_at: patch.exceptionResolvedAt,
    exception_resolved_by: patch.exceptionResolvedBy,
    status: patch.status,
    learning_notes: patch.learningNotes,
    sales_order_id: patch.salesOrderId,
  };
}

/**
 * @param {Function} dbQuery
 * @param {object} ctx
 */
export function createFulfillmentStore(dbQuery, ctx) {
  const { str, numOrNull, refreshLotStatus } = ctx.helpers;
  const getCommissionRatePct =
    ctx.getCommissionRatePct || (async () => DEFAULT_SCOUT_COMMISSION_RATE_PCT);

  async function loadJob(id) {
    const r = await dbQuery(
      `SELECT ${FULFILLMENT_SELECT} ${FROM_SQL} WHERE m.id = $1::uuid`,
      [id]
    );
    return r.rows[0] ?? null;
  }

  async function writePatch(id, patch) {
    const cols = patchToUpdate(patch);
    const sets = [];
    const vals = [id];
    for (const [col, value] of Object.entries(cols)) {
      if (value === undefined) continue;
      vals.push(value);
      const i = vals.length;
      if (col.endsWith("_by") || col === "sales_order_id") {
        sets.push(`${col} = $${i}::uuid`);
      } else if (col.endsWith("_at") || col.startsWith("fulfill_window")) {
        sets.push(`${col} = $${i}::timestamptz`);
      } else if (col === "actual_birds") {
        sets.push(`${col} = $${i}::int`);
      } else if (col === "actual_weight_kg" || col === "actual_price_per_kg") {
        sets.push(`${col} = $${i}::numeric`);
      } else {
        sets.push(`${col} = $${i}`);
      }
    }
    if (sets.length === 0) return;
    sets.push("updated_at = now()");
    await dbQuery(`UPDATE pipeline_matches SET ${sets.join(", ")} WHERE id = $1::uuid`, vals);
  }

  async function accrueIfSettled(job, patch, userId) {
    if (!patch || patch.status !== "delivered") return { accrued: false, amountRwf: 0 };
    if (job.commissionStatus && job.commissionStatus !== "none") {
      return { accrued: false, amountRwf: Number(job.commissionAmountRwf || 0) };
    }
    const scoutId = job.commissionVetUserId || job.scoutedBy;
    if (!scoutId) return { accrued: false, amountRwf: 0 };
    const ratePct = await getCommissionRatePct();
    const inputs = commissionInputs({ ...job, ...patch }, patch);
    const commission = computeScoutCommission({ ...inputs, ratePct });
    if (!commission.ok) return { accrued: false, amountRwf: 0 };
    await dbQuery(
      `UPDATE pipeline_matches SET
          commission_vet_user_id = COALESCE(commission_vet_user_id, $2::uuid),
          commission_rate_pct = $3,
          commission_amount_rwf = $4,
          commission_status = 'accrued',
          updated_at = now()
        WHERE id = $1::uuid AND commission_status = 'none'`,
      [job.id, scoutId, commission.ratePct, commission.amountRwf]
    );
    void emailForUserId(dbQuery, scoutId)
      .then((scout) => {
        if (!scout?.email) return;
        return notifyMany([scout], () =>
          buildCommissionAccruedEmail({ name: scout.fullName, amountRwf: commission.amountRwf })
        );
      })
      .catch(() => {});
    return { accrued: true, amountRwf: commission.amountRwf };
  }

  async function maybeSalesOrder(job, patch, user, body) {
    if (patch.status !== "delivered") return null;
    if (job.lotSource !== "managed_flock" || !job.flockId) return null;
    if (!canAccessPipelineDesk(user)) return null;
    const price = numOrNull(body?.actualPricePerKg) ?? patch.actualPricePerKg ?? job.agreedPricePerKg ?? 0;
    const avg = numOrNull(body?.actualWeightKg) ?? patch.actualWeightKg ?? job.avgWeightKg;
    const birds = numOrNull(body?.actualBirds) ?? patch.actualBirds ?? job.birds;
    const totalWeight = numOrNull(body?.totalWeightKg) ?? (avg != null && birds != null ? avg * birds : null);
    if (totalWeight == null || totalWeight <= 0) return null;
    const sale = await dbQuery(
      `INSERT INTO poultry_sales_orders
         (flock_id, recorded_by, order_date, number_of_birds, total_weight_kg, price_per_kg,
          buyer_name, buyer_contact, submission_status, accounting_status)
       VALUES ($1::uuid, $2::uuid, $3::date, $4, $5::numeric, $6::numeric, $7, $8, 'approved', 'not_applicable')
       RETURNING id::text AS id`,
      [
        job.flockId,
        user.id,
        new Date().toISOString().slice(0, 10),
        birds,
        totalWeight,
        price,
        job.buyerName,
        job.buyerWhatsapp || job.buyerPhone,
      ]
    );
    return sale.rows[0].id;
  }

  async function notifyParties(job, mailBuilder, includeDesk = false) {
    const owners = await emailsForLotOwners(dbQuery, {
      listedBy: job.listedBy,
      companyId: job.lotCompanyId,
    });
    const buyer = await emailForBuyerId(dbQuery, job.buyerId);
    const list = [...owners];
    if (buyer?.email) list.push(buyer);
    if (includeDesk) {
      const desk = await emailsForDeskRoles(dbQuery);
      list.push(...desk);
    }
    void notifyMany(list, mailBuilder).catch(() => {});
  }

  async function present(id, viewer) {
    const row = await loadJob(id);
    if (!row) return null;
    return mapFulfillmentJob(row, viewer);
  }

  return {
    loadJob,
    writePatch,
    accrueIfSettled,
    maybeSalesOrder,
    notifyParties,
    present,
    async listJobs({ scope, companyId, buyerId, listedBy, farmProfileId, queue }) {
      const clauses = [];
      const params = [];
      if (scope === "buyer") {
        params.push(buyerId);
        clauses.push(`m.buyer_id = $${params.length}::uuid`);
      } else if (scope === "farmer") {
        if (listedBy) {
          params.push(listedBy);
          const i = params.length;
          if (farmProfileId) {
            params.push(farmProfileId);
            clauses.push(
              `(l.listed_by = $${i}::uuid OR l.farm_profile_id = $${params.length}::uuid)`
            );
          } else {
            clauses.push(`l.listed_by = $${i}::uuid`);
          }
        } else {
          params.push(companyId);
          clauses.push(`l.company_id = $${params.length}::uuid`);
        }
      }
      if (queue === "open") {
        clauses.push(
          `(m.status = 'committed' OR (m.exception_kind <> 'none' AND m.exception_resolved_at IS NULL) OR m.status = 'failed')`
        );
      }
      const where = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";
      const r = await dbQuery(
        `SELECT ${FULFILLMENT_SELECT}
           ${FROM_SQL}
          ${where}
          ORDER BY
            CASE WHEN m.exception_kind <> 'none' AND m.exception_resolved_at IS NULL THEN 0 ELSE 1 END,
            CASE WHEN m.status = 'committed' THEN 0 ELSE 1 END,
            m.updated_at DESC
          LIMIT 200`,
        params
      );
      return r.rows;
    },
    str,
    numOrNull,
    refreshLotStatus,
  };
}

function handleMissing(res, e) {
  if (isMissingFulfillmentColumn(e)) {
    res.status(503).json({ error: fulfillmentMigrationMessage(), code: "needs_fulfillment_migration" });
    return true;
  }
  return false;
}

/**
 * @param {import('express').Router} router
 * @param {{ dbQuery: Function, hasDb: Function, audit: Function, helpers: Record<string, Function>, getCommissionRatePct?: Function }} ctx
 */
export function registerPipelineFulfillmentRoutes(router, ctx) {
  const { dbQuery, audit, helpers } = ctx;
  const { requireDb, str } = helpers;
  const store = createFulfillmentStore(dbQuery, ctx);

  async function requireJob(req, res) {
    const job = await store.loadJob(req.params.id);
    if (!job) {
      res.status(404).json({ error: "Match not found." });
      return { job: null, viewer: null };
    }
    const profile = isMarketOnlySeller(req.authUser)
      ? await loadProfileForFarmer(dbQuery, req.authUser)
      : null;
    const viewer = viewerFor(req.authUser, job, profile);
    if (!viewer) {
      res.status(403).json({ error: "Not allowed." });
      return { job: null, viewer: null };
    }
    return { job, viewer };
  }

  router.get("/market/jobs", async (req, res) => {
    if (!requireDb(res)) return;
    try {
      let scope = "ops";
      let companyId = null;
      let buyerId = null;
      let listedBy = null;
      let farmProfileId = null;
      if (canAccessPipelineDesk(req.authUser)) {
        scope = "ops";
      } else if (isBuyerRole(req.authUser)) {
        const buyer = await dbQuery(
          `SELECT id::text AS id FROM pipeline_buyers WHERE user_id = $1::uuid LIMIT 1`,
          [req.authUser.id]
        );
        if (!buyer.rows[0]) return res.json({ jobs: [] });
        scope = "buyer";
        buyerId = buyer.rows[0].id;
      } else if (canListFarmerLots(req.authUser)) {
        scope = "farmer";
        if (isMarketOnlySeller(req.authUser)) {
          listedBy = req.authUser.id;
          const profile = await loadProfileForFarmer(dbQuery, req.authUser);
          farmProfileId = profile?.id || null;
        } else {
          companyId = req.authUser.companyId;
        }
      } else {
        return res.status(403).json({ error: "Not allowed." });
      }
      const queue = canAccessPipelineDesk(req.authUser) ? str(req.query.queue, 20) || "open" : "";
      const rows = await store.listJobs({ scope, companyId, buyerId, listedBy, farmProfileId, queue });
      const viewer = scope === "ops" ? "ops" : scope;
      res.json({
        jobs: rows.map((row) => mapFulfillmentJob(row, viewer)),
      });
    } catch (e) {
      if (handleMissing(res, e)) return;
      res.status(503).json({ error: e instanceof Error ? e.message : "Could not list jobs." });
    }
  });

  router.get("/market/jobs/:id", async (req, res) => {
    if (!requireDb(res)) return;
    try {
      const { job, viewer } = await requireJob(req, res);
      if (!job) return;
      res.json({ job: mapFulfillmentJob(job, viewer) });
    } catch (e) {
      if (handleMissing(res, e)) return;
      res.status(503).json({ error: e instanceof Error ? e.message : "Could not load job." });
    }
  });

  router.patch("/matches/:id/logistics", async (req, res) => {
    if (!requireDb(res)) return;
    try {
      const { job, viewer } = await requireJob(req, res);
      if (!job) return;
      const body = req.body ?? {};
      const result = applyPlanLogistics(
        job,
        {
          collectOrDelivery: body.collectOrDelivery,
          slaughterMode: body.slaughterMode,
          deliveryActor: body.deliveryActor,
          allowCleva: viewer === "ops",
          needClevaDelivery: body.needClevaDelivery === true && (viewer === "buyer" || viewer === "ops"),
          fulfillWindowStart: body.fulfillWindowStart,
          fulfillWindowEnd: body.fulfillWindowEnd,
          logisticsNotes: body.logisticsNotes != null ? str(body.logisticsNotes, 2000) : undefined,
        },
        req.authUser.id,
        nowIso()
      );
      if (result.error) return res.status(400).json({ error: result.error });
      await store.writePatch(job.id, result.patch);
      audit(req.authUser, "pipeline.fulfill.plan", "pipeline_match", job.id, {
        collectOrDelivery: result.patch.collectOrDelivery,
        slaughterMode: result.patch.slaughterMode,
        deliveryActor: result.patch.deliveryActor,
      });
      const presented = await store.present(job.id, viewer);
      res.json({ job: presented });
      void store.notifyParties(job, (u) =>
        buildFulfillmentPlannedEmail({
          name: u.fullName,
          birds: job.birds,
          district: job.lotDistrict,
        })
      );
    } catch (e) {
      if (handleMissing(res, e)) return;
      res.status(503).json({ error: e instanceof Error ? e.message : "Could not plan logistics." });
    }
  });

  router.post("/matches/:id/confirm", async (req, res) => {
    if (!requireDb(res)) return;
    try {
      const { job, viewer } = await requireJob(req, res);
      if (!job) return;
      const body = req.body ?? {};
      const side = viewer === "ops" ? str(body.side, 12) : viewer;
      if (viewer === "ops" && (side === "settle" || !side)) {
        return runOpsSettle(req, res, job, viewer, body);
      }
      if (viewer === "ops" && side !== "buyer" && side !== "farmer") {
        return res.status(400).json({ error: "Ops must pass side=buyer, side=farmer, or settle." });
      }
      const result = applySideConfirm(
        job,
        side,
        {
          actualBirds: body.actualBirds,
          actualWeightKg: body.actualWeightKg,
          actualPricePerKg: body.actualPricePerKg,
        },
        req.authUser.id,
        nowIso()
      );
      if (result.error) return res.status(400).json({ error: result.error });
      if (result.settle) {
        const salesOrderId = await store.maybeSalesOrder(job, result.patch, req.authUser, body);
        if (salesOrderId) result.patch.salesOrderId = salesOrderId;
      }
      if (body.learningNotes) result.patch.learningNotes = str(body.learningNotes, 2000);
      await store.writePatch(job.id, result.patch);
      const commission = await store.accrueIfSettled(job, result.patch, req.authUser.id);
      if (result.patch.status === "delivered" || result.patch.status === "failed") {
        await store.refreshLotStatus(job.lotId);
      }
      audit(req.authUser, "pipeline.fulfill.confirm", "pipeline_match", job.id, {
        side,
        settle: Boolean(result.settle),
        conflict: result.conflict || null,
      });
      res.json({
        job: await store.present(job.id, viewer),
        settle: Boolean(result.settle),
        conflict: result.conflict || null,
        commissionAccrued: commission.accrued,
      });
      if (result.conflict) {
        void store.notifyParties(
          job,
          (u) =>
            buildFulfillmentExceptionEmail({
              name: u.fullName,
              kind: result.conflict.kind,
              birds: job.birds,
              district: job.lotDistrict,
            }),
          true
        );
      } else if (result.settle) {
        void store.notifyParties(job, (u) =>
          buildFulfillmentSettledEmail({
            name: u.fullName,
            birds: result.patch.actualBirds || job.birds,
            district: job.lotDistrict,
          })
        );
      } else {
        void store.notifyParties(job, (u) =>
          buildFulfillmentConfirmedEmail({
            name: u.fullName,
            side,
            birds: job.birds,
            district: job.lotDistrict,
          })
        );
      }
    } catch (e) {
      if (handleMissing(res, e)) return;
      res.status(503).json({ error: e instanceof Error ? e.message : "Could not confirm." });
    }
  });

  async function runOpsSettle(req, res, job, viewer, body) {
    const result = applyOpsSettle(
      job,
      {
        actualBirds: body.actualBirds,
        actualWeightKg: body.actualWeightKg,
        actualPricePerKg: body.actualPricePerKg,
      },
      req.authUser.id,
      nowIso()
    );
    if (result.error) return res.status(400).json({ error: result.error });
    const salesOrderId = await store.maybeSalesOrder(job, result.patch, req.authUser, body);
    if (salesOrderId) result.patch.salesOrderId = salesOrderId;
    if (body.learningNotes) result.patch.learningNotes = helpers.str(body.learningNotes, 2000);
    await store.writePatch(job.id, result.patch);
    const commission = await store.accrueIfSettled(job, result.patch, req.authUser.id);
    await store.refreshLotStatus(job.lotId);
    audit(req.authUser, "pipeline.fulfill.settle", "pipeline_match", job.id, {
      commissionAccrued: commission.accrued,
    });
    res.json({
      job: await store.present(job.id, viewer),
      settle: true,
      commissionAccrued: commission.accrued,
    });
    void store.notifyParties(job, (u) =>
      buildFulfillmentSettledEmail({
        name: u.fullName,
        birds: result.patch.actualBirds || job.birds,
        district: job.lotDistrict,
      })
    );
  }

  router.post("/matches/:id/exception", async (req, res) => {
    if (!requireDb(res)) return;
    try {
      const { job, viewer } = await requireJob(req, res);
      if (!job) return;
      const body = req.body ?? {};
      const result = applyOpenException(
        job,
        body.kind,
        str(body.notes, 2000),
        req.authUser.id,
        nowIso()
      );
      if (result.error) return res.status(400).json({ error: result.error });
      await store.writePatch(job.id, result.patch);
      if (result.failed) await store.refreshLotStatus(job.lotId);
      audit(req.authUser, "pipeline.fulfill.exception", "pipeline_match", job.id, {
        kind: result.patch.exceptionKind,
      });
      res.json({ job: await store.present(job.id, viewer) });
      void store.notifyParties(
        job,
        (u) =>
          buildFulfillmentExceptionEmail({
            name: u.fullName,
            kind: result.patch.exceptionKind,
            birds: job.birds,
            district: job.lotDistrict,
          }),
        true
      );
    } catch (e) {
      if (handleMissing(res, e)) return;
      res.status(503).json({ error: e instanceof Error ? e.message : "Could not open exception." });
    }
  });

  router.post("/matches/:id/resolve-exception", async (req, res) => {
    if (!requireDb(res)) return;
    if (!canAccessPipelineDesk(req.authUser)) {
      return res.status(403).json({ error: "Ops only." });
    }
    try {
      const { job, viewer } = await requireJob(req, res);
      if (!job) return;
      const body = req.body ?? {};
      const result = applyResolveException(
        job,
        body.action,
        {
          actualBirds: body.actualBirds,
          actualWeightKg: body.actualWeightKg,
          actualPricePerKg: body.actualPricePerKg,
        },
        str(body.notes, 2000),
        req.authUser.id,
        nowIso()
      );
      if (result.error) return res.status(400).json({ error: result.error });
      if (result.settle) {
        const salesOrderId = await store.maybeSalesOrder(job, result.patch, req.authUser, body);
        if (salesOrderId) result.patch.salesOrderId = salesOrderId;
      }
      await store.writePatch(job.id, result.patch);
      const commission = result.settle
        ? await store.accrueIfSettled(job, result.patch, req.authUser.id)
        : { accrued: false };
      if (result.patch.status === "delivered" || result.patch.status === "failed") {
        await store.refreshLotStatus(job.lotId);
      }
      audit(req.authUser, "pipeline.fulfill.resolve", "pipeline_match", job.id, {
        action: body.action,
      });
      res.json({
        job: await store.present(job.id, viewer),
        settle: Boolean(result.settle),
        commissionAccrued: Boolean(commission.accrued),
      });
      if (result.settle) {
        void store.notifyParties(job, (u) =>
          buildFulfillmentSettledEmail({
            name: u.fullName,
            birds: result.patch.actualBirds || job.birds,
            district: job.lotDistrict,
          })
        );
      }
    } catch (e) {
      if (handleMissing(res, e)) return;
      res.status(503).json({ error: e instanceof Error ? e.message : "Could not resolve exception." });
    }
  });

  router.post("/matches/:id/settle", async (req, res) => {
    if (!requireDb(res)) return;
    if (!canAccessPipelineDesk(req.authUser)) {
      return res.status(403).json({ error: "Ops only." });
    }
    try {
      const { job, viewer } = await requireJob(req, res);
      if (!job) return;
      return runOpsSettle(req, res, job, viewer, req.body ?? {});
    } catch (e) {
      if (handleMissing(res, e)) return;
      res.status(503).json({ error: e instanceof Error ? e.message : "Could not settle." });
    }
  });
}

/**
 * Legacy confirm-delivered: buyer/farmer confirm their side; ops force-settles.
 */
export async function runLegacyConfirmDelivered(req, res, ctx) {
  const { dbQuery, helpers } = ctx;
  const { requireDb } = helpers;
  if (!requireDb(res)) return;
  const store = createFulfillmentStore(dbQuery, ctx);
  try {
    const job = await store.loadJob(req.params.id);
    if (!job) return res.status(404).json({ error: "Match not found." });
    const viewer = viewerFor(req.authUser, job);
    if (!viewer) return res.status(403).json({ error: "Not allowed to confirm delivery." });
    const body = req.body ?? {};
    if (job.status === "delivered") {
      return res.json({ match: { id: job.id, status: "delivered" }, job: mapFulfillmentJob(job, viewer) });
    }
    if (viewer === "ops") {
      const result = applyOpsSettle(
        job,
        {
          actualBirds: body.actualBirds ?? job.birds,
          actualWeightKg: body.avgWeightKg ?? body.actualWeightKg,
          actualPricePerKg: body.agreedPricePerKg ?? body.actualPricePerKg,
        },
        req.authUser.id,
        nowIso()
      );
      if (result.error) return res.status(400).json({ error: result.error });
      const salesOrderId = await store.maybeSalesOrder(job, result.patch, req.authUser, body);
      if (salesOrderId) result.patch.salesOrderId = salesOrderId;
      await store.writePatch(job.id, result.patch);
      const commission = await store.accrueIfSettled(job, result.patch, req.authUser.id);
      await store.refreshLotStatus(job.lotId);
      return res.json({
        match: { id: job.id, status: "delivered", commissionStatus: commission.accrued ? "accrued" : job.commissionStatus },
        job: await store.present(job.id, viewer),
        settle: true,
      });
    }
    const result = applySideConfirm(
      job,
      viewer,
      {
        actualBirds: body.actualBirds ?? job.birds,
        actualWeightKg: body.avgWeightKg ?? body.actualWeightKg,
        actualPricePerKg: body.agreedPricePerKg ?? body.actualPricePerKg,
      },
      req.authUser.id,
      nowIso()
    );
    if (result.error) return res.status(400).json({ error: result.error });
    await store.writePatch(job.id, result.patch);
    const commission = await store.accrueIfSettled(job, result.patch, req.authUser.id);
    if (result.patch.status === "delivered") await store.refreshLotStatus(job.lotId);
    res.json({
      match: {
        id: job.id,
        status: result.settle ? "delivered" : "committed",
        commissionStatus: commission.accrued ? "accrued" : job.commissionStatus,
      },
      job: await store.present(job.id, viewer),
      settle: Boolean(result.settle),
      conflict: result.conflict || null,
    });
  } catch (e) {
    if (handleMissing(res, e)) return;
    res.status(503).json({ error: e instanceof Error ? e.message : "Could not confirm delivery." });
  }
}
