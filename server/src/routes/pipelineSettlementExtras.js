/**
 * Buyer pays Cleva, then Cleva pays the farm. Ops confirms both sides.
 */

import { canAccessPipelineDesk, isBuyerRole, canListFarmerLots } from "../services/pipeline/pipeline.js";
import {
  buildMoneySplit,
  farmerMoneySplitView,
  publicBuyerMoneySplit,
} from "../services/pipeline/marketQuote.js";
import { isBuyerPaid } from "../services/pipeline/fulfillment.js";

function payPhone(env = process.env) {
  return String(env.MARKET_CLEVA_MOMO || "").trim() || null;
}

async function loadPayTo(dbQuery) {
  try {
    const r = await dbQuery(
      `SELECT setting_value FROM app_settings WHERE setting_key = 'market_cleva_momo' LIMIT 1`
    );
    const v = String(r.rows[0]?.setting_value || "").trim();
    return v || payPhone();
  } catch {
    return payPhone();
  }
}

function splitFromMatch(match) {
  const offer = match?.quoteJson || match?.quote_json;
  const parsed = typeof offer === "string" ? JSON.parse(offer) : offer;
  return buildMoneySplit(parsed || null, {
    visitFeeRwf: 0,
  });
}

export function registerPipelineSettlementRoutes(router, ctx) {
  const { dbQuery, audit, helpers } = ctx;
  const { requireDb, requireDesk, str } = helpers;

  async function loadMatchForUser(req, matchId) {
    const r = await dbQuery(
      `SELECT m.id::text AS id, m.buyer_id::text AS "buyerId", m.lot_id::text AS "lotId",
              m.birds, m.status,
              m.buyer_payment_status AS "buyerPaymentStatus",
              m.buyer_paid_rwf AS "buyerPaidRwf",
              m.buyer_payment_ref AS "buyerPaymentRef",
              m.farmer_payout_status AS "farmerPayoutStatus",
              m.farmer_paid_rwf AS "farmerPaidRwf",
              m.quote_json AS "quoteJson",
              l.company_id::text AS "lotCompanyId",
              b.user_id::text AS "buyerUserId"
         FROM pipeline_matches m
         JOIN pipeline_lots l ON l.id = m.lot_id
         JOIN pipeline_buyers b ON b.id = m.buyer_id
        WHERE m.id = $1::uuid`,
      [matchId]
    );
    return r.rows[0] || null;
  }

  function canSee(req, match) {
    if (!match) return false;
    if (canAccessPipelineDesk(req.authUser)) return true;
    if (isBuyerRole(req.authUser) && match.buyerUserId === req.authUser.id) return true;
    if (canListFarmerLots(req.authUser) && match.lotCompanyId === req.authUser.companyId) return true;
    return false;
  }

  router.get("/market/bookings/:id/payment", async (req, res) => {
    if (!requireDb(res)) return;
    try {
      const match = await loadMatchForUser(req, req.params.id);
      if (!match || !canSee(req, match)) return res.status(404).json({ error: "Order not found." });
      const money = splitFromMatch(match);
      const ops = canAccessPipelineDesk(req.authUser);
      const farmer = canListFarmerLots(req.authUser) && !isBuyerRole(req.authUser);
      res.json({
        matchId: match.id,
        buyerPaymentStatus: match.buyerPaymentStatus,
        farmerPayoutStatus: match.farmerPayoutStatus,
        amountRwf: match.buyerPaidRwf ?? money?.youPayRwf ?? null,
        reference: match.buyerPaymentRef,
        payToPhone: await loadPayTo(dbQuery),
        split: ops || isBuyerRole(req.authUser) ? publicBuyerMoneySplit(money) : null,
        farmerSplit: ops || farmer ? farmerMoneySplitView(money) : null,
      });
    } catch (e) {
      res.status(503).json({ error: e instanceof Error ? e.message : "Could not load payment." });
    }
  });

  router.post("/market/bookings/:id/pay", async (req, res) => {
    if (!requireDb(res)) return;
    const body = req.body ?? {};
    try {
      const match = await loadMatchForUser(req, req.params.id);
      if (!match || !canSee(req, match)) return res.status(404).json({ error: "Order not found." });
      if (!isBuyerRole(req.authUser) && !canAccessPipelineDesk(req.authUser)) {
        return res.status(403).json({ error: "Buyer account required to pay." });
      }
      if (isBuyerPaid(match)) {
        return res.json({ ok: true, status: "paid", already: true });
      }
      const phone = str(body.payerPhone || body.phone, 40);
      const money = splitFromMatch(match);
      const amount = money?.youPayRwf ?? Number(match.buyerPaidRwf) ?? 0;
      await dbQuery(
        `UPDATE pipeline_matches
            SET buyer_payment_status = 'pending',
                buyer_paid_rwf = COALESCE(buyer_paid_rwf, $2),
                updated_at = now()
          WHERE id = $1::uuid`,
        [match.id, amount]
      );
      await dbQuery(
        `INSERT INTO market_settlements (match_id, side, status, amount_rwf, method, payer_phone, reference, created_by, note)
         VALUES ($1::uuid, 'buyer_in', 'pending', $2, 'momo', $3, $4, $5::uuid, $6)`,
        [match.id, amount, phone || null, match.buyerPaymentRef, req.authUser.id, str(body.note, 400)]
      );
      audit(req.authUser, "pipeline.market.pay_sent", "pipeline_match", match.id, { amount });
      res.json({
        ok: true,
        status: "pending",
        amountRwf: amount,
        reference: match.buyerPaymentRef,
        payToPhone: await loadPayTo(dbQuery),
      });
    } catch (e) {
      res.status(503).json({ error: e instanceof Error ? e.message : "Could not record payment." });
    }
  });

  router.post("/market/bookings/:id/confirm-payment", async (req, res) => {
    if (!requireDb(res) || !requireDesk(req, res)) return;
    try {
      const match = await loadMatchForUser(req, req.params.id);
      if (!match) return res.status(404).json({ error: "Order not found." });
      const money = splitFromMatch(match);
      const amount = money?.youPayRwf ?? Number(match.buyerPaidRwf) ?? 0;
      const farmPay = money?.farmerNetRwf ?? 0;
      await dbQuery(
        `UPDATE pipeline_matches
            SET buyer_payment_status = 'paid',
                buyer_paid_at = now(),
                buyer_paid_rwf = $2,
                farmer_payout_status = CASE WHEN farmer_payout_status = 'paid' THEN 'paid' ELSE 'due' END,
                updated_at = now()
          WHERE id = $1::uuid`,
        [match.id, amount]
      );
      await dbQuery(
        `UPDATE market_settlements
            SET status = 'paid', confirmed_at = now(), confirmed_by = $2::uuid
          WHERE match_id = $1::uuid AND side = 'buyer_in' AND status = 'pending'`,
        [match.id, req.authUser.id]
      );
      audit(req.authUser, "pipeline.market.pay_confirmed", "pipeline_match", match.id, { amount, farmPay });
      res.json({ ok: true, status: "paid", farmerPayoutStatus: "due", amountRwf: amount, farmerNetRwf: farmPay });
    } catch (e) {
      res.status(503).json({ error: e instanceof Error ? e.message : "Could not confirm payment." });
    }
  });

  router.post("/market/bookings/:id/pay-farm", async (req, res) => {
    if (!requireDb(res) || !requireDesk(req, res)) return;
    const body = req.body ?? {};
    try {
      const match = await loadMatchForUser(req, req.params.id);
      if (!match) return res.status(404).json({ error: "Order not found." });
      if (!isBuyerPaid(match)) {
        return res.status(400).json({ error: "Collect buyer payment before paying the farm." });
      }
      const money = splitFromMatch(match);
      const amount = money?.farmerNetRwf ?? Number(match.farmerPaidRwf) ?? 0;
      const ref = str(body.reference, 80) || match.buyerPaymentRef;
      await dbQuery(
        `UPDATE pipeline_matches
            SET farmer_payout_status = 'paid',
                farmer_paid_at = now(),
                farmer_paid_rwf = $2,
                farmer_payout_ref = $3,
                updated_at = now()
          WHERE id = $1::uuid`,
        [match.id, amount, ref]
      );
      await dbQuery(
        `INSERT INTO market_settlements (match_id, side, status, amount_rwf, method, reference, created_by, confirmed_at, confirmed_by, note)
         VALUES ($1::uuid, 'farmer_out', 'paid', $2, $3, $4, $5::uuid, now(), $5::uuid, $6)`,
        [match.id, amount, str(body.method, 20) || "momo", ref, req.authUser.id, str(body.note, 400)]
      );
      audit(req.authUser, "pipeline.market.farm_paid", "pipeline_match", match.id, { amount });
      res.json({ ok: true, status: "paid", amountRwf: amount });
    } catch (e) {
      res.status(503).json({ error: e instanceof Error ? e.message : "Could not pay farm." });
    }
  });

  router.get("/market/settlements", async (req, res) => {
    if (!requireDb(res) || !requireDesk(req, res)) return;
    const queue = str(req.query.queue, 20) || "open";
    try {
      const r = await dbQuery(
        `SELECT m.id::text AS id, m.birds, m.status,
                m.buyer_payment_status AS "buyerPaymentStatus",
                m.buyer_paid_rwf AS "buyerPaidRwf",
                m.buyer_payment_ref AS "buyerPaymentRef",
                m.farmer_payout_status AS "farmerPayoutStatus",
                m.farmer_paid_rwf AS "farmerPaidRwf",
                m.created_at AS "createdAt",
                b.name AS "buyerName",
                l.district AS "lotDistrict",
                l.public_ref AS "publicRef"
           FROM pipeline_matches m
           JOIN pipeline_buyers b ON b.id = m.buyer_id
           JOIN pipeline_lots l ON l.id = m.lot_id
          WHERE ($1 = 'all'
             OR ($1 = 'open' AND (m.buyer_payment_status <> 'paid' OR m.farmer_payout_status IN ('unpaid', 'due')))
             OR ($1 = 'in' AND m.buyer_payment_status <> 'paid')
             OR ($1 = 'out' AND m.buyer_payment_status = 'paid' AND m.farmer_payout_status <> 'paid'))
          ORDER BY m.created_at DESC
          LIMIT 200`,
        [queue]
      );
      res.json({ settlements: r.rows });
    } catch (e) {
      res.status(503).json({ error: e instanceof Error ? e.message : "Could not list settlements." });
    }
  });
}
