/**
 * Marketplace extras: buyer book, verification queue, farmer listings, commissions.
 * Registers additional routes onto the pipeline Express router.
 */

import crypto from "node:crypto";

import {
  LOT_SELECT,
  canAccessPipelineDesk,
  canBrowseMarket,
  canListFarmerLots,
  canScoutPipeline,
  computeScoutCommission,
  DEFAULT_SCOUT_COMMISSION_RATE_PCT,
  estimateLotCommission,
  forwardWeekBuckets,
  isBuyerRole,
  mapLotRow,
  remainingBirds,
  deriveLotStatusAfterMatch,
} from "../services/pipeline/pipeline.js";
import { isSellLead, normalizeWhatsapp } from "../services/pipeline/publicMarket.js";
import {
  CARD_SELECT,
  buildMoneySplit,
  farmerMoneySplitView,
  publicBuyerMoneySplit,
  computeOffer,
  computeQuote,
  defaultWeekBounds,
  DEFAULT_BANDS,
  DEFAULT_QUANTITY_TIERS,
  DEFAULT_CLEVA_RUN_COMMISSION_PCT,
  farmGateFromQuoteJson,
  listingRankDecision,
  loadLatestCard,
  loadPublishedCard,
  merchantTierOf,
  resolveLockedBookPrices,
  shouldSkipListingReview,
  parseCardRow,
  publicBoard,
  publicBuyerOffer,
  publicFarmerQuote,
  sortOffers,
  suggestFarmGateFromAsks,
  takePctFor,
  validateBands,
  validateQuantityTiers,
} from "../services/pipeline/marketQuote.js";
import {
  buildBookingEmail,
  buildBuyerVerifiedEmail,
  buildCommissionPaidEmail,
  buildFarmVerifiedEmail,
  buildLotLiveEmail,
  emailForUserId,
  emailsForCompanyAdmins,
  emailsForLotOwners,
  notifyMany,
} from "../services/pipeline/marketNotify.js";
import { isPlatformSuperuser } from "../services/tenant/companyIsolation.js";
import { recordMarketEvent } from "../services/pipeline/marketEvents.js";
import {
  appendFarmerLotScope,
  farmerOwnsLot,
  isMarketOnlySeller,
  loadProfileForFarmer,
  normalizeProductType,
  normalizeVisibilityTier,
} from "../services/pipeline/farmProfiles.js";
import {
  FULFILLMENT_SELECT,
  FOODSERVICE_MIN_BIRDS,
  isMissingFulfillmentColumn,
  mapFulfillmentJob,
  normalizeCollectOrDelivery,
  normalizeSlaughterMode,
  resolveDeliveryActor,
} from "../services/pipeline/fulfillment.js";
import { runLegacyConfirmDelivered } from "./pipelineFulfillmentExtras.js";
import { listVisitCommissionRows } from "./pipelineWeighExtras.js";
import {
  canAppearOnPublicShop,
  decorateListing,
  DEFAULT_VISIT_FEE_RWF,
  isScoutConfirmed,
  rankEligibleUntilConfirm,
  resolveSellingWeek,
} from "../services/pipeline/sellingWeek.js";

/**
 * @param {import('express').Router} router
 * @param {{ dbQuery: Function, hasDb: Function, audit: Function, helpers: Record<string, Function> }} ctx
 */
export function registerPipelineMarketRoutes(router, ctx) {
  const { dbQuery, hasDb, audit, helpers } = ctx;
  const { requireDb, requireDesk, str, numOrNull, bool, matchedBirdsForLot, refreshLotStatus } =
    helpers;

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

  async function loadBuyerForUser(userId) {
    const r = await dbQuery(
      `SELECT id::text AS id, name, verification_status AS "verificationStatus",
              user_id::text AS "userId", active
         FROM pipeline_buyers WHERE user_id = $1::uuid LIMIT 1`,
      [userId]
    );
    return r.rows[0] ?? null;
  }

  async function loadCompanyVerification(companyId) {
    if (!companyId) return null;
    const r = await dbQuery(
      `SELECT id::text AS id, name, slug,
              COALESCE(verification_status, 'verified') AS "verificationStatus"
         FROM companies WHERE id = $1::uuid`,
      [companyId]
    );
    return r.rows[0] ?? null;
  }

  function requireVerifiedBuyer(buyer) {
    return Boolean(buyer && buyer.active !== false);
  }

  function parseCardBody(body) {
    const week = defaultWeekBounds();
    const bandsV = validateBands(body?.bands?.length ? body.bands : DEFAULT_BANDS);
    if (!bandsV.ok) return bandsV;
    const tiersV = validateQuantityTiers(body?.quantityTiers?.length ? body.quantityTiers : DEFAULT_QUANTITY_TIERS);
    if (!tiersV.ok) return tiersV;
    const validFrom = str(body.validFrom, 10) || week.validFrom;
    const validTo = str(body.validTo, 10) || week.validTo;
    if (validTo < validFrom) return { ok: false, error: "validTo must be on or after validFrom." };
    const clevaRun = Number(body.clevaRunCommissionPct);
    return {
      ok: true,
      validFrom,
      validTo,
      slaughterRwfPerBird: Math.max(0, Math.round(numOrNull(body.slaughterRwfPerBird) ?? 200)),
      deliveryRwfPerTrip: Math.max(0, Math.round(numOrNull(body.deliveryRwfPerTrip) ?? 0)),
      commissionPct: Math.max(0, Math.min(100, Number(body.commissionPct) || 0)),
      clevaRunCommissionPct: Number.isFinite(clevaRun)
        ? Math.max(0, Math.min(100, clevaRun))
        : DEFAULT_CLEVA_RUN_COMMISSION_PCT,
      bands: bandsV.bands,
      quantityTiers: tiersV.tiers,
      notes: str(body.notes, 2000),
    };
  }

  function offerForLot(card, lot, trip = {}) {
    const merchantTier = merchantTierOf(lot, {
      verificationStatus: lot.companyVerificationStatus || lot.verificationStatus,
    });
    const birds = Number(trip.birds || lot.remainingBirds || lot.birdCount || 0);
    const avgKg = Number(trip.avgKg || lot.avgWeightKg || lot.expectedWeightKg || 0);
    const slaughterPayer = trip.slaughterPayer === "farm" || trip.slaughterMode === "farm" ? "farm" : "butcher";
    const delivery = trip.delivery === true || trip.collectOrDelivery === "delivery";
    return computeOffer(card, {
      birds,
      avgKg,
      askRwfPerKg: lot.askPricePerKg,
      merchantTier,
      slaughterPayer,
      delivery,
      rankEligible: lot.rankEligible !== false,
      readyFrom: lot.readyFrom,
      birdsAvailable: lot.remainingBirds ?? lot.birdCount,
    });
  }

  function attachBuyerOffer(mapped, card, trip = {}, { stripAsk = false } = {}) {
    const offer = offerForLot(card, mapped, trip);
    const pub = publicBuyerOffer(offer);
    mapped.butcherPricePerKg = pub?.buyer.buyerRwfPerKg ?? null;
    mapped.buyerRwfPerKg = pub?.buyer.buyerRwfPerKg ?? null;
    mapped.youPayRwf = pub?.buyer.youPayRwf ?? null;
    mapped.merchantTier = pub?.merchantTier || merchantTierOf(mapped, mapped);
    mapped.quantityTier = pub?.quantityTier || null;
    mapped.rankEligible = Boolean(offer?.rankEligible);
    if (stripAsk) {
      delete mapped.askPricePerKg;
      delete mapped.contactPhone;
      delete mapped.farmLabel;
      delete mapped.notes;
    }
    return mapped;
  }

  function listingRailDecision(card, input) {
    return listingRankDecision(card, input);
  }

  router.get("/market/rates", async (req, res) => {
    if (!requireDb(res) || !requireDesk(req, res)) return;
    try {
      const cards = await loadLatestCard(dbQuery);
      const published = cards.find((c) => c.status === "published") || (await loadPublishedCard(dbQuery));
      const sample = computeQuote(published, { birds: 200, avgKg: 1.8, slaughterPayer: "butcher", delivery: false });
      let visitFeeRwf = DEFAULT_VISIT_FEE_RWF;
      try {
        const feeR = await dbQuery(
          `SELECT setting_value FROM app_settings WHERE setting_key = 'pipeline_scout_visit_fee_rwf' LIMIT 1`
        );
        const n = Number(feeR.rows[0]?.setting_value);
        if (Number.isFinite(n) && n > 0) visitFeeRwf = n;
      } catch {
        /* default */
      }
      let whatsapp = null;
      try {
        const waR = await dbQuery(
          `SELECT setting_value FROM app_settings WHERE setting_key = 'market_whatsapp_number' LIMIT 1`
        );
        whatsapp = normalizeWhatsapp(waR.rows[0]?.setting_value);
      } catch {
        /* unset */
      }
      let suggestion = null;
      try {
        const askR = await dbQuery(
          `SELECT l.ask_price_per_kg AS "askRwfPerKg",
                  COALESCE(l.avg_weight_kg, l.expected_weight_kg) AS "avgKg"
             FROM pipeline_lots l
            WHERE COALESCE(l.verification_status, 'verified') = 'verified'
              AND l.status IN ('open', 'partial', 'matched')
              AND l.ask_price_per_kg > 0
              AND l.created_at >= now() - interval '28 days'`
        );
        const draft = cards.find((c) => c.status === "draft");
        suggestion = suggestFarmGateFromAsks(askR.rows, (draft || published)?.bands || DEFAULT_BANDS);
      } catch {
        /* no suggestion */
      }
      res.json({
        cards,
        published: published || null,
        visitFeeRwf,
        whatsapp,
        suggestion,
        preview: sample
          ? { farmer: publicFarmerQuote(sample), butcher: sample.butcher, board: publicBoard(published) }
          : null,
        defaults: {
          ...defaultWeekBounds(),
          bands: DEFAULT_BANDS,
          quantityTiers: DEFAULT_QUANTITY_TIERS,
          slaughterRwfPerBird: 200,
          deliveryRwfPerTrip: 0,
          commissionPct: 5,
          clevaRunCommissionPct: DEFAULT_CLEVA_RUN_COMMISSION_PCT,
          visitFeeRwf: DEFAULT_VISIT_FEE_RWF,
        },
      });
    } catch (e) {
      res.status(503).json({ error: e instanceof Error ? e.message : "Could not load rates." });
    }
  });

  router.patch("/market/visit-fee", async (req, res) => {
    if (!requireDb(res) || !requireDesk(req, res)) return;
    const fee = numOrNull(req.body?.visitFeeRwf ?? req.body?.feeRwf);
    if (!(fee > 0)) return res.status(400).json({ error: "visitFeeRwf must be > 0." });
    try {
      await dbQuery(
        `INSERT INTO app_settings (setting_key, setting_value)
         VALUES ('pipeline_scout_visit_fee_rwf', $1)
         ON CONFLICT (setting_key) DO UPDATE SET setting_value = EXCLUDED.setting_value`,
        [String(Math.round(fee))]
      );
      audit(req.authUser, "pipeline.visit_fee.set", "app_settings", "pipeline_scout_visit_fee_rwf", { fee });
      res.json({ visitFeeRwf: Math.round(fee) });
    } catch (e) {
      res.status(503).json({ error: e instanceof Error ? e.message : "Could not save visit fee." });
    }
  });

  router.patch("/market/whatsapp", async (req, res) => {
    if (!requireDb(res) || !requireDesk(req, res)) return;
    const raw = String(req.body?.whatsapp ?? "").trim();
    const whatsapp = raw ? normalizeWhatsapp(raw) : "";
    if (whatsapp === null) return res.status(400).json({ error: "Use a full number, e.g. +250 788 123 456." });
    try {
      await dbQuery(
        `INSERT INTO app_settings (setting_key, setting_value)
         VALUES ('market_whatsapp_number', $1)
         ON CONFLICT (setting_key) DO UPDATE SET setting_value = EXCLUDED.setting_value`,
        [whatsapp]
      );
      audit(req.authUser, "market.whatsapp.set", "app_settings", "market_whatsapp_number", { set: Boolean(whatsapp) });
      res.json({ whatsapp: whatsapp || null });
    } catch (e) {
      res.status(503).json({ error: e instanceof Error ? e.message : "Could not save WhatsApp number." });
    }
  });

  router.post("/market/rates", async (req, res) => {
    if (!requireDb(res) || !requireDesk(req, res)) return;
    const parsed = parseCardBody(req.body || {});
    if (!parsed.ok) return res.status(400).json({ error: parsed.error });
    try {
      const ins = await dbQuery(
        `INSERT INTO market_rate_cards
           (valid_from, valid_to, status, slaughter_rwf_per_bird, delivery_rwf_per_trip,
            commission_pct, cleva_run_commission_pct, bands, quantity_tiers, notes, created_by)
         VALUES ($1::date, $2::date, 'draft', $3, $4, $5, $6, $7::jsonb, $8::jsonb, $9, $10::uuid)
         RETURNING ${CARD_SELECT}`,
        [
          parsed.validFrom,
          parsed.validTo,
          parsed.slaughterRwfPerBird,
          parsed.deliveryRwfPerTrip,
          parsed.commissionPct,
          parsed.clevaRunCommissionPct,
          JSON.stringify(parsed.bands),
          JSON.stringify(parsed.quantityTiers),
          parsed.notes,
          req.authUser.id,
        ]
      );
      audit(req.authUser, "market.rates.create", "market_rate_card", ins.rows[0].id, {});
      res.status(201).json({ card: parseCardRow(ins.rows[0]) });
    } catch (e) {
      res.status(503).json({ error: e instanceof Error ? e.message : "Could not save rates." });
    }
  });

  router.patch("/market/rates/:id", async (req, res) => {
    if (!requireDb(res) || !requireDesk(req, res)) return;
    const id = str(req.params.id, 64);
    if (!id) return res.status(400).json({ error: "id required" });
    const parsed = parseCardBody(req.body || {});
    if (!parsed.ok) return res.status(400).json({ error: parsed.error });
    try {
      const r = await dbQuery(
        `UPDATE market_rate_cards SET
            valid_from = $2::date,
            valid_to = $3::date,
            slaughter_rwf_per_bird = $4,
            delivery_rwf_per_trip = $5,
            commission_pct = $6,
            cleva_run_commission_pct = $7,
            bands = $8::jsonb,
            quantity_tiers = $9::jsonb,
            notes = $10,
            updated_at = now()
          WHERE id = $1::uuid AND status = 'draft'
          RETURNING ${CARD_SELECT}`,
        [
          id,
          parsed.validFrom,
          parsed.validTo,
          parsed.slaughterRwfPerBird,
          parsed.deliveryRwfPerTrip,
          parsed.commissionPct,
          parsed.clevaRunCommissionPct,
          JSON.stringify(parsed.bands),
          JSON.stringify(parsed.quantityTiers),
          parsed.notes,
        ]
      );
      if (!r.rows[0]) return res.status(404).json({ error: "Draft card not found." });
      audit(req.authUser, "market.rates.update", "market_rate_card", id, {});
      res.json({ card: parseCardRow(r.rows[0]) });
    } catch (e) {
      res.status(503).json({ error: e instanceof Error ? e.message : "Could not update rates." });
    }
  });

  router.post("/market/rates/:id/publish", async (req, res) => {
    if (!requireDb(res) || !requireDesk(req, res)) return;
    const id = str(req.params.id, 64);
    if (!id) return res.status(400).json({ error: "id required" });
    try {
      await dbQuery(
        `UPDATE market_rate_cards SET status = 'archived', updated_at = now()
          WHERE status = 'published' AND id <> $1::uuid`,
        [id]
      );
      const r = await dbQuery(
        `UPDATE market_rate_cards SET
            status = 'published',
            published_by = $2::uuid,
            published_at = now(),
            updated_at = now()
          WHERE id = $1::uuid
          RETURNING ${CARD_SELECT}`,
        [id, req.authUser.id]
      );
      if (!r.rows[0]) return res.status(404).json({ error: "Card not found." });
      audit(req.authUser, "market.rates.publish", "market_rate_card", id, {});
      res.json({ card: parseCardRow(r.rows[0]) });
    } catch (e) {
      res.status(503).json({ error: e instanceof Error ? e.message : "Could not publish rates." });
    }
  });

  // ——— Market browse / book ———

  router.get("/market/lots", async (req, res) => {
    if (!requireDb(res)) return;
    if (!canBrowseMarket(req.authUser)) {
      return res.status(403).json({ error: "Market access requires a verified buyer or ops role." });
    }
    if (isBuyerRole(req.authUser)) {
      const buyer = await loadBuyerForUser(req.authUser.id);
      if (!requireVerifiedBuyer(buyer)) {
        return res.status(403).json({ error: "Buyer account is not active.", code: "buyer_inactive" });
      }
    }
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
          WHERE l.status IN ('open', 'partial')
            AND COALESCE(l.verification_status, 'verified') = 'verified'
            AND ($1::text IS NULL OR l.district ILIKE $1)
          ORDER BY l.ready_from ASC NULLS LAST, l.created_at DESC
          LIMIT 500`,
        [district ? `%${district}%` : null]
      );
      const card = await loadPublishedCard(dbQuery).catch(() => null);
      const trip = {
        birds: numOrNull(req.query.birds) || 100,
        avgKg: numOrNull(req.query.avgKg) || numOrNull(req.query.avg_kg),
        slaughterPayer: str(req.query.slaughterPayer, 20) || "butcher",
        delivery: req.query.delivery === "1" || req.query.delivery === "true",
      };
      const stripAsk = isBuyerRole(req.authUser);
      const lots = r.rows.map((row) => {
        const mapped = mapLotRow(row);
        const matched = Number(row.matchedBirds ?? 0);
        mapped.matchedBirds = matched;
        mapped.remainingBirds = remainingBirds(mapped.birdCount, matched);
        mapped.companyVerificationStatus = "verified";
        return attachBuyerOffer(mapped, card, { ...trip, avgKg: trip.avgKg || mapped.avgWeightKg || mapped.expectedWeightKg }, { stripAsk });
      }).filter((l) => canAppearOnPublicShop(l));
      res.json({ lots });
    } catch (e) {
      res.status(503).json({ error: e instanceof Error ? e.message : "Could not list market lots." });
    }
  });

  router.get("/market/lots/:id", async (req, res) => {
    if (!requireDb(res)) return;
    if (!canBrowseMarket(req.authUser)) {
      return res.status(403).json({ error: "Not allowed." });
    }
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
          WHERE l.id = $1::uuid`,
        [req.params.id]
      );
      if (!r.rows[0]) return res.status(404).json({ error: "Lot not found." });
      const mapped = mapLotRow(r.rows[0]);
      mapped.matchedBirds = Number(r.rows[0].matchedBirds ?? 0);
      mapped.remainingBirds = remainingBirds(mapped.birdCount, mapped.matchedBirds);
      const card = await loadPublishedCard(dbQuery).catch(() => null);
      attachBuyerOffer(
        mapped,
        card,
        {
          birds: remainingBirds(mapped.birdCount, mapped.matchedBirds),
          avgKg: mapped.avgWeightKg || mapped.expectedWeightKg,
        },
        { stripAsk: isBuyerRole(req.authUser) }
      );
      if (!canAccessPipelineDesk(req.authUser) && !canAppearOnPublicShop(mapped)) {
        return res.status(404).json({ error: "Lot not on the market." });
      }
      res.json({ lot: mapped });
    } catch (e) {
      res.status(503).json({ error: e instanceof Error ? e.message : "Could not load lot." });
    }
  });

  router.post("/market/bookings", async (req, res) => {
    if (!requireDb(res)) return;
    if (!isBuyerRole(req.authUser) && !canAccessPipelineDesk(req.authUser)) {
      return res.status(403).json({ error: "Buyer account required to book." });
    }
    const body = req.body ?? {};
    let lotId = str(body.lotId, 64);
    const publicRef = str(body.publicRef, 40);
    const birds = numOrNull(body.birds);
    if (!lotId && publicRef) {
      try {
        const found = await dbQuery(
          `SELECT id::text AS id FROM pipeline_lots WHERE public_ref = $1 LIMIT 1`,
          [publicRef]
        );
        lotId = found.rows[0]?.id || "";
      } catch {
        lotId = "";
      }
    }
    if (!lotId) return res.status(400).json({ error: "lotId or publicRef is required." });
    if (!birds || birds <= 0) return res.status(400).json({ error: "birds must be > 0." });

    try {
      let buyerId = str(body.buyerId, 64);
      if (isBuyerRole(req.authUser)) {
        const buyer = await loadBuyerForUser(req.authUser.id);
        if (!requireVerifiedBuyer(buyer)) {
          return res.status(403).json({ error: "Buyer account is not active.", code: "buyer_inactive" });
        }
        buyerId = buyer.id;
      } else if (!buyerId) {
        return res.status(400).json({ error: "buyerId is required for ops bookings." });
      }

      await dbQuery("BEGIN");
      try {
        const lotR = await dbQuery(
          `SELECT l.id::text AS id, l.bird_count AS "birdCount", l.status,
                  COALESCE(l.verification_status, 'verified') AS "verificationStatus",
                  l.ask_price_per_kg AS "askPricePerKg",
                  l.avg_weight_kg AS "avgWeightKg",
                  l.expected_weight_kg AS "expectedWeightKg",
                  l.scouted_by::text AS "scoutedBy",
                  l.listed_by::text AS "listedBy",
                  l.company_id::text AS "companyId",
                  l.farm_profile_id::text AS "farmProfileId",
                  l.source, l.flock_id::text AS "flockId",
                  l.ready_from AS "readyFrom",
                  l.ready_to AS "readyTo",
                  l.scout_confirmed_at AS "scoutConfirmedAt",
                  COALESCE(l.rank_eligible, true) AS "rankEligible",
                  l.district, l.farm_label AS "farmLabel",
                  l.farmer_can_slaughter AS "farmerCanSlaughter",
                  l.delivery_available AS "deliveryAvailable",
                  l.min_order_birds AS "minOrderBirds",
                  COALESCE(c.verification_status, 'verified') AS "companyVerificationStatus"
             FROM pipeline_lots l
             LEFT JOIN companies c ON c.id = l.company_id
            WHERE l.id = $1::uuid
            FOR UPDATE OF l`,
          [lotId]
        );
        const lot = lotR.rows[0];
        if (!lot) {
          await dbQuery("ROLLBACK");
          return res.status(404).json({ error: "Lot not found." });
        }
        if (lot.verificationStatus !== "verified" || !["open", "partial"].includes(lot.status)) {
          await dbQuery("ROLLBACK");
          return res.status(400).json({ error: "Lot is not available on the market." });
        }
        const matched = await matchedBirdsForLot(lotId);
        const left = remainingBirds(lot.birdCount, matched);
        if (!isScoutConfirmed(lot) || !canAppearOnPublicShop({ ...lot, remainingBirds: left })) {
          await dbQuery("ROLLBACK");
          return res.status(400).json({ error: "Lot is not confirmed for this selling week." });
        }
        if (birds > left) {
          await dbQuery("ROLLBACK");
          return res.status(400).json({ error: `Only ${left} birds remaining on this lot.` });
        }
        const lotMin =
          lot.minOrderBirds != null && Number(lot.minOrderBirds) > 0
            ? Math.round(Number(lot.minOrderBirds))
            : null;
        const floor = Math.max(FOODSERVICE_MIN_BIRDS, lotMin || 0);
        if (birds < floor) {
          await dbQuery("ROLLBACK");
          return res.status(400).json({
            error: `Minimum order is ${floor} birds (foodservice).`,
            code: "min_order",
            minOrderBirds: floor,
          });
        }
        const collect = normalizeCollectOrDelivery(body.collectOrDelivery);
        if (collect === "delivery" && !lot.deliveryAvailable) {
          await dbQuery("ROLLBACK");
          return res.status(400).json({ error: "This lot does not offer farm delivery. Choose collect." });
        }
        const deliveryActor = resolveDeliveryActor(collect, body.deliveryActor, {
          allowCleva: canAccessPipelineDesk(req.authUser),
        });

        const card = await loadPublishedCard(dbQuery).catch(() => null);
        const trip = {
          birds,
          avgKg: lot.avgWeightKg || lot.expectedWeightKg,
          slaughterPayer: normalizeSlaughterMode(body.slaughterMode) === "farm" ? "farm" : "butcher",
          collectOrDelivery: collect,
          delivery: collect === "delivery",
        };
        const offer = offerForLot(card, { ...lot, remainingBirds: left }, trip);
        const locked = resolveLockedBookPrices(offer, {
          opsOverride: canAccessPipelineDesk(req.authUser) ? numOrNull(body.agreedPricePerKg) : null,
        });
        if (!locked.ok) {
          await dbQuery("ROLLBACK");
          return res.status(400).json({ error: locked.error });
        }
        const buyerKg = locked.buyerKg;
        const farmGateKg = locked.farmGateKg;
        let visitFeeRwf = 0;
        try {
          const vf = await dbQuery(
            `SELECT setting_value FROM app_settings WHERE setting_key = 'pipeline_scout_visit_fee_rwf' LIMIT 1`
          );
          visitFeeRwf = Math.max(0, Math.round(Number(vf.rows[0]?.setting_value) || DEFAULT_VISIT_FEE_RWF || 0));
        } catch {
          visitFeeRwf = 0;
        }
        const money = buildMoneySplit(offer, { visitFeeRwf });
        const payRef = `CLEVA-${crypto.randomUUID().slice(0, 8).toUpperCase()}`;

        let ins;
        try {
          ins = await dbQuery(
            `INSERT INTO pipeline_matches
               (lot_id, demand_id, buyer_id, birds, agreed_price_per_kg, ready_date, status,
                learning_notes, commission_vet_user_id, matched_by, commission_status,
                farm_gate_per_kg, buyer_price_per_kg, rate_card_id, quantity_tier, quote_json,
                buyer_payment_status, buyer_paid_rwf, buyer_payment_ref, farmer_payout_status)
             VALUES ($1::uuid, NULL, $2::uuid, $3, $4, $5::date, 'committed', $6, $7::uuid, $8::uuid, 'none',
                     $9, $10, $11::uuid, $12, $13::jsonb, 'unpaid', $14, $15, 'unpaid')
             RETURNING id::text AS id, lot_id::text AS "lotId", buyer_id::text AS "buyerId",
                       birds, agreed_price_per_kg AS "agreedPricePerKg", ready_date AS "readyDate",
                       status, created_at AS "createdAt",
                       buyer_price_per_kg AS "buyerPricePerKg", farm_gate_per_kg AS "farmGatePerKg"`,
            [
              lotId,
              buyerId,
              birds,
              buyerKg,
              str(body.readyDate, 10),
              str(body.notes, 2000),
              lot.scoutedBy,
              req.authUser.id,
              farmGateKg,
              buyerKg,
              offer.cardId || null,
              offer.quantityTier?.id || null,
              JSON.stringify(offer),
              money?.youPayRwf ?? null,
              payRef,
            ]
          );
        } catch (schemaErr) {
          if (!/farm_gate_per_kg|buyer_price_per_kg|rate_card_id|quantity_tier|quote_json|buyer_payment|does not exist/i.test(String(schemaErr?.message || ""))) {
            throw schemaErr;
          }
          ins = await dbQuery(
            `INSERT INTO pipeline_matches
               (lot_id, demand_id, buyer_id, birds, agreed_price_per_kg, ready_date, status,
                learning_notes, commission_vet_user_id, matched_by, commission_status)
             VALUES ($1::uuid, NULL, $2::uuid, $3, $4, $5::date, 'committed', $6, $7::uuid, $8::uuid, 'none')
             RETURNING id::text AS id, lot_id::text AS "lotId", buyer_id::text AS "buyerId",
                       birds, agreed_price_per_kg AS "agreedPricePerKg", ready_date AS "readyDate",
                       status, created_at AS "createdAt"`,
            [
              lotId,
              buyerId,
              birds,
              buyerKg,
              str(body.readyDate, 10),
              str(body.notes, 2000),
              lot.scoutedBy,
              req.authUser.id,
            ]
          );
        }

        const nextMatched = matched + birds;
        const nextStatus = deriveLotStatusAfterMatch(lot.birdCount, nextMatched, lot.status);
        await dbQuery(`UPDATE pipeline_lots SET status = $2, updated_at = now() WHERE id = $1::uuid`, [
          lotId,
          nextStatus,
        ]);
        try {
          await dbQuery(
            `INSERT INTO market_settlements (match_id, side, status, amount_rwf, method, reference, created_by)
             VALUES ($1::uuid, 'buyer_in', 'pending', $2, 'momo', $3, $4::uuid)`,
            [ins.rows[0].id, money?.youPayRwf ?? 0, payRef, req.authUser.id]
          );
        } catch {
          /* 073 not applied yet */
        }

        const slaughter = normalizeSlaughterMode(body.slaughterMode);
        if (collect || slaughter || body.fulfillWindowStart || body.logisticsNotes || deliveryActor) {
          try {
            await dbQuery(
              `UPDATE pipeline_matches SET
                  collect_or_delivery = COALESCE($2, collect_or_delivery),
                  slaughter_mode = COALESCE($3, slaughter_mode),
                  delivery_actor = COALESCE($4, delivery_actor),
                  fulfill_window_start = COALESCE($5::timestamptz, fulfill_window_start),
                  fulfill_window_end = COALESCE($6::timestamptz, fulfill_window_end),
                  logistics_notes = COALESCE($7, logistics_notes),
                  logistics_planned_at = now(),
                  logistics_planned_by = $8::uuid,
                  updated_at = now()
                WHERE id = $1::uuid`,
              [
                ins.rows[0].id,
                collect,
                slaughter,
                deliveryActor,
                str(body.fulfillWindowStart, 40),
                str(body.fulfillWindowEnd, 40),
                str(body.logisticsNotes, 2000),
                req.authUser.id,
              ]
            );
          } catch (logErr) {
            if (!isMissingFulfillmentColumn(logErr)) throw logErr;
            try {
              await dbQuery(
                `UPDATE pipeline_matches SET
                    collect_or_delivery = COALESCE($2, collect_or_delivery),
                    slaughter_mode = COALESCE($3, slaughter_mode),
                    fulfill_window_start = COALESCE($4::timestamptz, fulfill_window_start),
                    fulfill_window_end = COALESCE($5::timestamptz, fulfill_window_end),
                    logistics_notes = COALESCE($6, logistics_notes),
                    logistics_planned_at = now(),
                    logistics_planned_by = $7::uuid,
                    updated_at = now()
                  WHERE id = $1::uuid`,
                [
                  ins.rows[0].id,
                  collect,
                  slaughter,
                  str(body.fulfillWindowStart, 40),
                  str(body.fulfillWindowEnd, 40),
                  str(body.logisticsNotes, 2000),
                  req.authUser.id,
                ]
              );
            } catch (legacyErr) {
              if (!isMissingFulfillmentColumn(legacyErr)) throw legacyErr;
            }
          }
        }

        await dbQuery("COMMIT");

        audit(req.authUser, "pipeline.market.book", "pipeline_match", ins.rows[0].id, {
          lotId,
          buyerId,
          birds,
          deliveryActor,
        });
        void recordMarketEvent(dbQuery, {
          eventType: "reservation",
          lotId,
          farmProfileId: lot.farmProfileId,
        }).catch(() => {});
        let payTo = process.env.MARKET_CLEVA_MOMO || "";
        try {
          const momo = await dbQuery(
            `SELECT setting_value FROM app_settings WHERE setting_key = 'market_cleva_momo' LIMIT 1`
          );
          payTo = String(momo.rows[0]?.setting_value || payTo || "").trim();
        } catch {
          /* ignore */
        }
        res.status(201).json({
          match: {
            ...ins.rows[0],
            buyerPaymentStatus: "unpaid",
            buyerPaymentRef: payRef,
            deliveryActor,
            collectOrDelivery: collect,
          },
          payment: {
            status: "unpaid",
            amountRwf: money?.youPayRwf ?? null,
            reference: payRef,
            payToPhone: payTo || null,
            method: "momo",
            split: publicBuyerMoneySplit(money, { deliveryActor }),
            farmerSplit: canAccessPipelineDesk(req.authUser) ? farmerMoneySplitView(money) : undefined,
          },
        });

        void emailsForLotOwners(dbQuery, {
          listedBy: lot.listedBy,
          companyId: lot.companyId,
        })
          .then((owners) =>
            notifyMany(owners, (u) =>
              buildBookingEmail({
                name: u.fullName,
                birds,
                district: lot.district,
                farmLabel: lot.farmLabel,
              })
            )
          )
          .catch(() => {});
      } catch (inner) {
        await dbQuery("ROLLBACK").catch(() => {});
        throw inner;
      }
    } catch (e) {
      res.status(503).json({ error: e instanceof Error ? e.message : "Could not book lot." });
    }
  });

  router.get("/market/my-orders", async (req, res) => {
    if (!requireDb(res)) return;
    if (!isBuyerRole(req.authUser) && !canAccessPipelineDesk(req.authUser)) {
      return res.status(403).json({ error: "Not allowed." });
    }
    try {
      let buyerId = null;
      if (isBuyerRole(req.authUser)) {
        const buyer = await loadBuyerForUser(req.authUser.id);
        if (!buyer) return res.json({ orders: [] });
        buyerId = buyer.id;
      }
      let r;
      try {
        r = await dbQuery(
          `SELECT ${FULFILLMENT_SELECT}
             FROM pipeline_matches m
             JOIN pipeline_lots l ON l.id = m.lot_id
             JOIN pipeline_buyers b ON b.id = m.buyer_id
             LEFT JOIN farm_profiles fp ON fp.id = l.farm_profile_id
            WHERE ($1::uuid IS NULL OR m.buyer_id = $1::uuid)
            ORDER BY m.created_at DESC
            LIMIT 200`,
          [buyerId]
        );
        const viewer = isBuyerRole(req.authUser) ? "buyer" : "ops";
        return res.json({ orders: r.rows.map((row) => mapFulfillmentJob(row, viewer)) });
      } catch (e) {
        if (!isMissingFulfillmentColumn(e)) throw e;
        r = await dbQuery(
          `SELECT m.id::text AS id, m.lot_id::text AS "lotId", m.buyer_id::text AS "buyerId",
                  b.name AS "buyerName", m.birds, m.agreed_price_per_kg AS "agreedPricePerKg",
                  m.ready_date AS "readyDate", m.status,
                  m.commission_status AS "commissionStatus",
                  m.commission_amount_rwf AS "commissionAmountRwf",
                  m.created_at AS "createdAt",
                  l.farm_label AS "lotFarmLabel", l.district AS "lotDistrict",
                  l.avg_weight_kg AS "avgWeightKg", l.ready_from AS "lotReadyFrom",
                  l.ready_to AS "lotReadyTo"
             FROM pipeline_matches m
             JOIN pipeline_buyers b ON b.id = m.buyer_id
             JOIN pipeline_lots l ON l.id = m.lot_id
            WHERE ($1::uuid IS NULL OR m.buyer_id = $1::uuid)
            ORDER BY m.created_at DESC
            LIMIT 200`,
          [buyerId]
        );
      }
      res.json({ orders: r.rows });
    } catch (e) {
      res.status(503).json({ error: e instanceof Error ? e.message : "Could not list orders." });
    }
  });

  router.post("/matches/:id/confirm-delivered", async (req, res) => {
    return runLegacyConfirmDelivered(req, res, {
      ...ctx,
      getCommissionRatePct: ctx.getCommissionRatePct || getCommissionRatePct,
    });
  });

  // ——— Farmer my listings ———

  router.get("/market/my-listings", async (req, res) => {
    if (!requireDb(res)) return;
    if (!canListFarmerLots(req.authUser) && !canScoutPipeline(req.authUser)) {
      return res.status(403).json({ error: "Not allowed." });
    }
    try {
      if (canListFarmerLots(req.authUser) && !canAccessPipelineDesk(req.authUser)) {
        const company = await loadCompanyVerification(req.authUser.companyId);
        if (company && company.verificationStatus === "pending") {
          return res.status(403).json({
            error: "Farm account awaiting verification.",
            code: "pending_verification",
          });
        }
      }
      const where = ["l.status <> 'cancelled'"];
      const params = [];
      if (req.authUser.role === "vet") {
        params.push(req.authUser.id);
        where.push(`l.scouted_by = $${params.length}::uuid`);
      } else if (!canAccessPipelineDesk(req.authUser)) {
        appendFarmerLotScope(where, params, req.authUser);
      }
      const r = await dbQuery(
        `SELECT ${LOT_SELECT},
                COALESCE(m.matched, 0)::int AS "matchedBirds"
           FROM pipeline_lots l
           LEFT JOIN LATERAL (
             SELECT SUM(birds)::int AS matched
               FROM pipeline_matches pm
              WHERE pm.lot_id = l.id AND pm.status IN ('committed', 'delivered')
           ) m ON true
          WHERE ${where.join(" AND ")}
          ORDER BY l.created_at DESC
          LIMIT 200`,
        params
      );
      const card = await loadPublishedCard(dbQuery).catch(() => null);
      let visitFeeRwf = DEFAULT_VISIT_FEE_RWF;
      try {
        const vf = await dbQuery(
          `SELECT setting_value FROM app_settings WHERE setting_key = 'pipeline_scout_visit_fee_rwf' LIMIT 1`
        );
        const n = Number(vf.rows[0]?.setting_value);
        if (Number.isFinite(n) && n >= 0) visitFeeRwf = n;
      } catch {
        /* default */
      }
      const lots = r.rows.map((row) => {
        const mapped = mapLotRow(row);
        mapped.matchedBirds = Number(row.matchedBirds ?? 0);
        mapped.remainingBirds = remainingBirds(mapped.birdCount, mapped.matchedBirds);
        const decorated = decorateListing(mapped);
        const offer = offerForLot(card, decorated);
        decorated.farmerSplit = farmerMoneySplitView(buildMoneySplit(offer, { visitFeeRwf }));
        return decorated;
      });
      res.json({ lots });
    } catch (e) {
      res.status(503).json({ error: e instanceof Error ? e.message : "Could not list listings." });
    }
  });

  router.get("/market/my-listings/rank-preview", async (req, res) => {
    if (!requireDb(res)) return;
    if (!canListFarmerLots(req.authUser) && !canScoutPipeline(req.authUser)) {
      return res.status(403).json({ error: "Not allowed." });
    }
    try {
      const company = await loadCompanyVerification(req.authUser.companyId);
      const card = await loadPublishedCard(dbQuery).catch(() => null);
      const birds = numOrNull(req.query.birds) || 100;
      const avgKg = numOrNull(req.query.avgKg) || numOrNull(req.query.avg_kg) || 1.8;
      const ask = numOrNull(req.query.ask) || numOrNull(req.query.askPricePerKg);
      const merchantTier = merchantTierOf(
        { source: str(req.query.source, 40) || "scout", flockId: str(req.query.flockId, 64) },
        company
      );
      const rail = listingRailDecision(card, { ask, avgKg, birds, merchantTier });
      const yours = computeOffer(card, {
        birds,
        avgKg,
        askRwfPerKg: ask,
        merchantTier,
        slaughterPayer: "butcher",
        delivery: false,
        readyFrom: "9999-12-31",
        birdsAvailable: birds,
      });
      const peersR = await dbQuery(
        `SELECT l.ask_price_per_kg AS "askPricePerKg",
                l.avg_weight_kg AS "avgWeightKg",
                l.expected_weight_kg AS "expectedWeightKg",
                l.source, l.flock_id::text AS "flockId",
                l.ready_from AS "readyFrom",
                COALESCE(l.rank_eligible, true) AS "rankEligible",
                GREATEST(0, COALESCE(l.saleable_birds, l.bird_count, 0) - COALESCE(m.matched, 0)) AS "remainingBirds",
                COALESCE(c.verification_status, 'verified') AS "companyVerificationStatus"
           FROM pipeline_lots l
           LEFT JOIN companies c ON c.id = l.company_id
           LEFT JOIN LATERAL (
             SELECT SUM(birds)::int AS matched
               FROM pipeline_matches pm
              WHERE pm.lot_id = l.id AND pm.status IN ('committed', 'delivered')
           ) m ON true
          WHERE l.status IN ('open', 'partial')
            AND COALESCE(l.verification_status, 'verified') = 'verified'
            AND COALESCE(l.rank_eligible, true) = true
          LIMIT 200`
      );
      const peerOffers = peersR.rows
        .map((row) =>
          computeOffer(card, {
            birds,
            avgKg: row.avgWeightKg || row.expectedWeightKg || avgKg,
            askRwfPerKg: row.askPricePerKg,
            merchantTier: merchantTierOf(row, { verificationStatus: row.companyVerificationStatus }),
            slaughterPayer: "butcher",
            delivery: false,
            rankEligible: row.rankEligible !== false,
            readyFrom: row.readyFrom,
            birdsAvailable: row.remainingBirds,
          })
        )
        .filter(Boolean);
      const ranked = sortOffers(yours ? [...peerOffers, yours] : peerOffers);
      const rank = yours ? ranked.findIndex((o) => o === yours) + 1 : 0;
      const cheaper = yours
        ? ranked.filter((o) => o !== yours && o.butcher.butcherRwfPerKg < yours.butcher.butcherRwfPerKg).length
        : 0;
      const cheapest = ranked[0]?.butcher.butcherRwfPerKg ?? null;
      res.json({
        rails: rail.rails,
        inRail: rail.inRail,
        rankEligible: Boolean(yours?.rankEligible),
        merchantTier,
        rank: rank || null,
        peers: ranked.length,
        cheaper,
        cheapestBuyerRwfPerKg: cheapest,
        yourBuyerRwfPerKg: yours?.butcher.butcherRwfPerKg ?? null,
        yourFarmGateRwfPerKg: yours?.farmer.farmGateRwfPerKg ?? null,
        takePct: takePctFor(card, merchantTier),
        farmerSplit: farmerMoneySplitView(buildMoneySplit(yours, { visitFeeRwf: DEFAULT_VISIT_FEE_RWF })),
      });
    } catch (e) {
      res.status(503).json({ error: e instanceof Error ? e.message : "Could not preview rank." });
    }
  });

  router.post("/market/my-listings", async (req, res) => {
    if (!requireDb(res)) return;
    if (!canListFarmerLots(req.authUser)) {
      return res.status(403).json({ error: "Farmer account required." });
    }
    const company = await loadCompanyVerification(req.authUser.companyId);
    if (!company || company.verificationStatus !== "verified") {
      return res.status(403).json({
        error: "Farm must be verified before listing.",
        code: "pending_verification",
      });
    }
    const profile = await loadProfileForFarmer(dbQuery, req.authUser);
    const body = req.body ?? {};
    const birdCount = numOrNull(body.birdCount);
    const district = str(body.district, 120);
    const farmLabel = str(body.farmLabel, 200) || profile?.displayName || company.name;
    const week = resolveSellingWeek({
      placementDate: str(body.placementDate, 10),
      chicksInRelative: str(body.chicksInRelative, 40),
      readyFrom: str(body.readyFrom, 10),
      readyTo: str(body.readyTo, 10),
    });
    if (!birdCount || birdCount <= 0) return res.status(400).json({ error: "birdCount is required." });
    if (!district) return res.status(400).json({ error: "district is required." });
    if (!week.placementDate && !week.readyFrom) {
      return res.status(400).json({ error: "Chicks-in date is required." });
    }
    if (!week.readyFrom || !week.readyTo) {
      return res.status(400).json({ error: "Could not suggest a selling week from chicks-in." });
    }

    try {
      let farmProfileId = str(body.farmProfileId, 64);
      if (!farmProfileId) {
        farmProfileId = profile?.id || null;
      }
      const avgKg = numOrNull(body.avgWeightKg);
      const ask = numOrNull(body.askPricePerKg);
      const merchantTier = merchantTierOf({ source: "scout", flockId: null }, company);
      const card = await loadPublishedCard(dbQuery).catch(() => null);
      const rail = listingRailDecision(card, {
        ask,
        avgKg,
        birds: birdCount,
        merchantTier,
      });
      const skipReview = shouldSkipListingReview({
        merchantTier,
        priceOnly: true,
        inRail: rail.inRail,
      });
      const verificationStatus = !rail.inRail || !skipReview ? "pending_review" : "verified";
      const rankEligible = rail.inRail
        ? rankEligibleUntilConfirm({ confirmed: false, railEligible: rail.rankEligible })
        : false;
      const ins = await dbQuery(
        `INSERT INTO pipeline_lots
           (source, company_id, farm_label, contact_phone, district,
            bird_count, saleable_birds, breed_code, avg_weight_kg, expected_weight_kg,
            ready_from, ready_to, placement_date, ask_price_per_kg, farmer_can_slaughter, delivery_available,
            min_order_birds,
            status, verification_status, listed_by, notes, created_by,
            product_type, visibility_tier, farm_profile_id, public_title, public_story, processing_notes,
            rank_eligible)
         VALUES
           ('scout', $1::uuid, $2, $3, $4,
            $5, $6, $7, $8, $9,
            $10::date, $11::date, $12::date, $13, $14, $15,
            $26,
            'open', $24, $16::uuid, $17, $16::uuid,
            $18, $19, $20::uuid, $21, $22, $23, $25)
         RETURNING id::text AS id`,
        [
          req.authUser.companyId,
          farmLabel,
          str(body.contactPhone, 40),
          district,
          birdCount,
          numOrNull(body.saleableBirds) ?? birdCount,
          str(body.breedCode, 40),
          avgKg,
          numOrNull(body.expectedWeightKg),
          week.readyFrom,
          week.readyTo,
          week.placementDate,
          ask,
          bool(body.farmerCanSlaughter, true),
          bool(body.deliveryAvailable, false),
          req.authUser.id,
          str(body.notes, 2000),
          normalizeProductType(body.productType),
          normalizeVisibilityTier(body.visibilityTier),
          farmProfileId,
          str(body.publicTitle, 160),
          str(body.publicStory, 2000),
          str(body.processingNotes, 2000),
          verificationStatus,
          rankEligible,
          numOrNull(body.minOrderBirds),
        ]
      );
      const refetch = await dbQuery(
        `SELECT ${LOT_SELECT} FROM pipeline_lots l WHERE l.id = $1::uuid`,
        [ins.rows[0].id]
      );
      audit(req.authUser, "pipeline.lot.farmer_list", "pipeline_lot", ins.rows[0].id, {});
      res.status(201).json({ lot: decorateListing(mapLotRow(refetch.rows[0])) });
    } catch (e) {
      res.status(503).json({ error: e instanceof Error ? e.message : "Could not create listing." });
    }
  });

  async function assertFarmerOwnsLot(req, lotId) {
    const r = await dbQuery(
      `SELECT id::text AS id, company_id::text AS "companyId",
              bird_count AS "birdCount", status,
              COALESCE(verification_status, 'verified') AS "verificationStatus",
              district, ready_from AS "readyFrom", ready_to AS "readyTo",
              ask_price_per_kg AS "askPricePerKg",
              avg_weight_kg AS "avgWeightKg", expected_weight_kg AS "expectedWeightKg",
              contact_phone AS "contactPhone", notes, farm_label AS "farmLabel",
              saleable_birds AS "saleableBirds",
              source, flock_id::text AS "flockId",
              COALESCE(rank_eligible, true) AS "rankEligible",
              placement_date AS "placementDate",
              scout_confirmed_at AS "scoutConfirmedAt",
              listed_by::text AS "listedBy",
              farm_profile_id::text AS "farmProfileId"
         FROM pipeline_lots WHERE id = $1::uuid`,
      [lotId]
    );
    const lot = r.rows[0];
    if (!lot) return { error: { status: 404, body: { error: "Lot not found." } } };
    if (canAccessPipelineDesk(req.authUser)) return { lot };
    if (!canListFarmerLots(req.authUser)) {
      return { error: { status: 403, body: { error: "Not allowed." } } };
    }
    const profile = isMarketOnlySeller(req.authUser)
      ? await loadProfileForFarmer(dbQuery, req.authUser)
      : null;
    if (!farmerOwnsLot(req.authUser, lot, profile)) {
      return { error: { status: 403, body: { error: "Not your listing." } } };
    }
    return { lot };
  }

  router.get("/market/my-listings/:lotId/bookings", async (req, res) => {
    if (!requireDb(res)) return;
    const owned = await assertFarmerOwnsLot(req, req.params.lotId);
    if (owned.error) return res.status(owned.error.status).json(owned.error.body);
    try {
      try {
        const r = await dbQuery(
          `SELECT ${FULFILLMENT_SELECT}
             FROM pipeline_matches m
             JOIN pipeline_lots l ON l.id = m.lot_id
             JOIN pipeline_buyers b ON b.id = m.buyer_id
             LEFT JOIN farm_profiles fp ON fp.id = l.farm_profile_id
            WHERE m.lot_id = $1::uuid
              AND m.status IN ('committed', 'delivered', 'failed')
            ORDER BY m.created_at DESC
            LIMIT 100`,
          [req.params.lotId]
        );
        return res.json({
          bookings: r.rows.map((row) => mapFulfillmentJob(row, canAccessPipelineDesk(req.authUser) ? "ops" : "farmer")),
        });
      } catch (e) {
        if (!isMissingFulfillmentColumn(e)) throw e;
        const r = await dbQuery(
          `SELECT m.id::text AS id, m.birds, m.status,
                  m.agreed_price_per_kg AS "agreedPricePerKg",
                  m.ready_date AS "readyDate", m.created_at AS "createdAt",
                  b.name AS "buyerName"
             FROM pipeline_matches m
             JOIN pipeline_buyers b ON b.id = m.buyer_id
            WHERE m.lot_id = $1::uuid
              AND m.status IN ('committed', 'delivered', 'failed')
            ORDER BY m.created_at DESC
            LIMIT 100`,
          [req.params.lotId]
        );
        return res.json({ bookings: r.rows });
      }
    } catch (e) {
      res.status(503).json({ error: e instanceof Error ? e.message : "Could not list bookings." });
    }
  });

  router.patch("/market/my-listings/:lotId", async (req, res) => {
    if (!requireDb(res)) return;
    if (!canListFarmerLots(req.authUser) || canAccessPipelineDesk(req.authUser)) {
      // Desk uses other lot tools; this path is farmer/manager tenant only.
      if (canAccessPipelineDesk(req.authUser) && req.authUser.role === "sales_coordinator") {
        return res.status(403).json({ error: "Farmer account required." });
      }
    }
    if (!canListFarmerLots(req.authUser)) {
      return res.status(403).json({ error: "Farmer account required." });
    }
    const owned = await assertFarmerOwnsLot(req, req.params.lotId);
    if (owned.error) return res.status(owned.error.status).json(owned.error.body);
    const lot = owned.lot;
    if (["cancelled", "matched"].includes(lot.status)) {
      return res.status(400).json({ error: `Cannot edit lot in status ${lot.status}.` });
    }
    if (!["pending_review", "verified"].includes(lot.verificationStatus)) {
      return res.status(400).json({ error: "Cannot edit a rejected listing." });
    }

    const body = req.body ?? {};
    const week =
      body.placementDate !== undefined ||
      body.chicksInRelative !== undefined ||
      body.readyFrom !== undefined ||
      body.readyTo !== undefined
        ? resolveSellingWeek({
            placementDate: body.placementDate !== undefined ? str(body.placementDate, 10) : lot.placementDate,
            chicksInRelative: str(body.chicksInRelative, 40),
            readyFrom: body.readyFrom !== undefined ? str(body.readyFrom, 10) : lot.readyFrom,
            readyTo: body.readyTo !== undefined ? str(body.readyTo, 10) : lot.readyTo,
          })
        : null;
    const birdCount = body.birdCount !== undefined ? numOrNull(body.birdCount) : null;
    const district = body.district !== undefined ? str(body.district, 120) : null;
    const readyFrom = week?.readyFrom || (body.readyFrom !== undefined ? str(body.readyFrom, 10) : null);
    const readyTo = week?.readyTo || (body.readyTo !== undefined ? str(body.readyTo, 10) : null);
    const placementDate = week?.placementDate || (body.placementDate !== undefined ? str(body.placementDate, 10) : null);
    const askPricePerKg = body.askPricePerKg !== undefined ? numOrNull(body.askPricePerKg) : undefined;
    const avgWeightKg = body.avgWeightKg !== undefined ? numOrNull(body.avgWeightKg) : undefined;
    const expectedWeightKg =
      body.expectedWeightKg !== undefined ? numOrNull(body.expectedWeightKg) : undefined;
    const contactPhone = body.contactPhone !== undefined ? str(body.contactPhone, 40) : null;
    const notes = body.notes !== undefined ? str(body.notes, 2000) : null;

    try {
      if (birdCount != null) {
        if (birdCount <= 0) return res.status(400).json({ error: "birdCount must be > 0." });
        const matched = await matchedBirdsForLot(req.params.lotId);
        if (birdCount < matched) {
          return res.status(400).json({
            error: `Cannot set birds below ${matched} already booked.`,
          });
        }
      }

      const nextBirds = birdCount ?? lot.birdCount;
      const nextDistrict = district ?? lot.district;
      const nextFrom = readyFrom || lot.readyFrom;
      const nextTo = readyTo || lot.readyTo;
      const nextAsk =
        askPricePerKg !== undefined ? askPricePerKg : lot.askPricePerKg;
      const nextAvg = avgWeightKg !== undefined ? avgWeightKg : lot.avgWeightKg;
      const materialChange =
        Number(nextBirds) !== Number(lot.birdCount) ||
        String(nextDistrict || "") !== String(lot.district || "") ||
        String(nextFrom).slice(0, 10) !== String(lot.readyFrom).slice(0, 10) ||
        String(nextTo).slice(0, 10) !== String(lot.readyTo).slice(0, 10) ||
        Number(nextAsk || 0) !== Number(lot.askPricePerKg || 0) ||
        Number(nextAvg || 0) !== Number(lot.avgWeightKg || 0);
      const priceOnly =
        Number(nextAsk || 0) !== Number(lot.askPricePerKg || 0) &&
        Number(nextBirds) === Number(lot.birdCount) &&
        String(nextDistrict || "") === String(lot.district || "") &&
        String(nextFrom).slice(0, 10) === String(lot.readyFrom).slice(0, 10) &&
        String(nextTo).slice(0, 10) === String(lot.readyTo).slice(0, 10) &&
        Number(nextAvg || 0) === Number(lot.avgWeightKg || 0);
      const company = await loadCompanyVerification(lot.companyId);
      const merchantTier = merchantTierOf(lot, company);
      const card = await loadPublishedCard(dbQuery).catch(() => null);
      const rail = listingRailDecision(card, {
        ask: nextAsk,
        avgKg: nextAvg,
        birds: nextBirds,
        merchantTier,
      });
      const skipReview = shouldSkipListingReview({
        merchantTier,
        priceOnly,
        inRail: rail.inRail,
      });
      const outOfRail = rail.inRail === false;
      const reReview = outOfRail || (lot.verificationStatus === "verified" && materialChange && !skipReview);
      const nextRank = outOfRail
        ? false
        : rankEligibleUntilConfirm({
            confirmed: isScoutConfirmed(lot),
            railEligible: rail.rankEligible,
          });

      await dbQuery(
        `UPDATE pipeline_lots SET
            bird_count = COALESCE($2, bird_count),
            saleable_birds = COALESCE($2, saleable_birds),
            district = COALESCE($3, district),
            ready_from = COALESCE($4::date, ready_from),
            ready_to = COALESCE($5::date, ready_to),
            placement_date = COALESCE($25::date, placement_date),
            ask_price_per_kg = CASE WHEN $6::boolean THEN $7 ELSE ask_price_per_kg END,
            avg_weight_kg = CASE WHEN $8::boolean THEN $9 ELSE avg_weight_kg END,
            expected_weight_kg = CASE WHEN $10::boolean THEN $11 ELSE expected_weight_kg END,
            contact_phone = COALESCE($12, contact_phone),
            notes = COALESCE($13, notes),
            visibility_tier = COALESCE($15, visibility_tier),
            product_type = COALESCE($16, product_type),
            public_title = COALESCE($17, public_title),
            public_story = COALESCE($18, public_story),
            processing_notes = COALESCE($19, processing_notes),
            farmer_can_slaughter = CASE WHEN $20::boolean THEN $21 ELSE farmer_can_slaughter END,
            delivery_available = CASE WHEN $22::boolean THEN $23 ELSE delivery_available END,
            min_order_birds = CASE WHEN $26::boolean THEN $27 ELSE min_order_birds END,
            verification_status = CASE WHEN $14::boolean THEN 'pending_review' ELSE verification_status END,
            verified_at = CASE WHEN $14::boolean THEN NULL ELSE verified_at END,
            rank_eligible = $24,
            updated_at = now()
          WHERE id = $1::uuid`,
        [
          req.params.lotId,
          birdCount,
          district,
          readyFrom || null,
          readyTo || null,
          askPricePerKg !== undefined,
          askPricePerKg ?? null,
          avgWeightKg !== undefined,
          avgWeightKg ?? null,
          expectedWeightKg !== undefined,
          expectedWeightKg ?? null,
          contactPhone,
          notes,
          reReview,
          body.visibilityTier !== undefined ? normalizeVisibilityTier(body.visibilityTier) : null,
          body.productType !== undefined ? normalizeProductType(body.productType) : null,
          body.publicTitle !== undefined ? str(body.publicTitle, 160) : null,
          body.publicStory !== undefined ? str(body.publicStory, 2000) : null,
          body.processingNotes !== undefined ? str(body.processingNotes, 2000) : null,
          body.farmerCanSlaughter !== undefined,
          bool(body.farmerCanSlaughter, false),
          body.deliveryAvailable !== undefined,
          bool(body.deliveryAvailable, false),
          nextRank,
          placementDate || null,
          body.minOrderBirds !== undefined,
          body.minOrderBirds === null ? null : numOrNull(body.minOrderBirds),
        ]
      );
      if (birdCount != null) {
        const matched = await matchedBirdsForLot(req.params.lotId);
        const nextStatus = deriveLotStatusAfterMatch(birdCount, matched, lot.status);
        await dbQuery(`UPDATE pipeline_lots SET status = $2 WHERE id = $1::uuid`, [
          req.params.lotId,
          nextStatus,
        ]);
      }
      const refetch = await dbQuery(
        `SELECT ${LOT_SELECT} FROM pipeline_lots l WHERE l.id = $1::uuid`,
        [req.params.lotId]
      );
      audit(req.authUser, "pipeline.lot.farmer_edit", "pipeline_lot", req.params.lotId, {
        reReview,
      });
      res.json({ lot: decorateListing(mapLotRow(refetch.rows[0])) });
    } catch (e) {
      res.status(503).json({ error: e instanceof Error ? e.message : "Could not update listing." });
    }
  });

  router.post("/market/my-listings/:lotId/cancel", async (req, res) => {
    if (!requireDb(res)) return;
    if (!canListFarmerLots(req.authUser)) {
      return res.status(403).json({ error: "Farmer account required." });
    }
    const owned = await assertFarmerOwnsLot(req, req.params.lotId);
    if (owned.error) return res.status(owned.error.status).json(owned.error.body);
    if (owned.lot.status === "cancelled") {
      return res.json({ ok: true, status: "cancelled" });
    }
    try {
      const matched = await dbQuery(
        `SELECT COUNT(*)::int AS n FROM pipeline_matches
          WHERE lot_id = $1::uuid AND status IN ('committed', 'delivered')`,
        [req.params.lotId]
      );
      if (Number(matched.rows[0]?.n || 0) > 0) {
        return res.status(400).json({
          error: "Cannot cancel a lot with committed or delivered bookings.",
        });
      }
      await dbQuery(
        `UPDATE pipeline_lots SET status = 'cancelled', updated_at = now() WHERE id = $1::uuid`,
        [req.params.lotId]
      );
      audit(req.authUser, "pipeline.lot.farmer_cancel", "pipeline_lot", req.params.lotId, {});
      res.json({ ok: true, status: "cancelled" });
    } catch (e) {
      res.status(503).json({ error: e instanceof Error ? e.message : "Could not cancel listing." });
    }
  });

  // ——— Verification queue (ops) ———

  router.get("/verify/queue", async (req, res) => {
    if (!requireDb(res) || !requireDesk(req, res)) return;
    try {
      const [companies, buyers, lots] = await Promise.all([
        dbQuery(
          `SELECT id::text AS id, name, slug, verification_status AS "verificationStatus",
                  created_at AS "createdAt"
             FROM companies
            WHERE verification_status = 'pending'
            ORDER BY created_at ASC
            LIMIT 100`
        ),
        dbQuery(
          `SELECT id::text AS id, name, buyer_type AS "buyerType", district, phone, whatsapp,
                  user_id::text AS "userId", verification_status AS "verificationStatus",
                  created_at AS "createdAt"
             FROM pipeline_buyers
            WHERE verification_status = 'pending'
            ORDER BY created_at ASC
            LIMIT 100`
        ),
        dbQuery(
          `SELECT ${LOT_SELECT}
             FROM pipeline_lots l
            WHERE COALESCE(l.verification_status, 'verified') = 'pending_review'
              AND l.status <> 'cancelled'
            ORDER BY l.created_at ASC
            LIMIT 100`
        ),
      ]);
      let profiles = [];
      try {
        const pr = await dbQuery(
          `SELECT id::text AS id, slug, display_name AS "displayName", district,
                  verification_status AS "verificationStatus",
                  consent_status AS "consentStatus", published,
                  created_at AS "createdAt"
             FROM farm_profiles
            WHERE verification_status = 'pending'
               OR consent_status = 'pending'
            ORDER BY created_at ASC
            LIMIT 100`
        );
        profiles = pr.rows;
      } catch {
        profiles = [];
      }
      res.json({
        companies: companies.rows,
        buyers: buyers.rows,
        lots: lots.rows.map(mapLotRow),
        profiles,
      });
    } catch (e) {
      res.status(503).json({ error: e instanceof Error ? e.message : "Could not load queue." });
    }
  });

  router.post("/verify/company/:id", async (req, res) => {
    if (!requireDb(res) || !requireDesk(req, res)) return;
    const status = str(req.body?.status, 20);
    if (!["verified", "rejected"].includes(status)) {
      return res.status(400).json({ error: "status must be verified or rejected." });
    }
    try {
      await dbQuery(
        `UPDATE companies SET
            verification_status = $2,
            verified_at = CASE WHEN $2 = 'verified' THEN now() ELSE NULL END,
            verified_by = $3::uuid
          WHERE id = $1::uuid`,
        [req.params.id, status, req.authUser.id]
      );
      audit(req.authUser, "pipeline.verify.company", "company", req.params.id, { status });
      res.json({ ok: true, status });
      if (status === "verified") {
        void emailsForCompanyAdmins(dbQuery, req.params.id)
          .then((admins) => notifyMany(admins, (u) => buildFarmVerifiedEmail({ name: u.fullName })))
          .catch(() => {});
      }
    } catch (e) {
      res.status(503).json({ error: e instanceof Error ? e.message : "Could not verify company." });
    }
  });

  router.post("/verify/buyer/:id", async (req, res) => {
    if (!requireDb(res) || !requireDesk(req, res)) return;
    const status = str(req.body?.status, 20);
    if (!["verified", "rejected"].includes(status)) {
      return res.status(400).json({ error: "status must be verified or rejected." });
    }
    try {
      const before = await dbQuery(
        `SELECT user_id::text AS "userId", name FROM pipeline_buyers WHERE id = $1::uuid`,
        [req.params.id]
      );
      await dbQuery(
        `UPDATE pipeline_buyers SET
            verification_status = $2,
            verified_at = CASE WHEN $2 = 'verified' THEN now() ELSE NULL END,
            verified_by = $3::uuid,
            updated_at = now()
          WHERE id = $1::uuid`,
        [req.params.id, status, req.authUser.id]
      );
      audit(req.authUser, "pipeline.verify.buyer", "pipeline_buyer", req.params.id, { status });
      res.json({ ok: true, status });
      if (status === "verified" && before.rows[0]?.userId) {
        void emailForUserId(dbQuery, before.rows[0].userId)
          .then((u) => {
            if (!u?.email) return;
            return notifyMany([u], () =>
              buildBuyerVerifiedEmail({ name: u.fullName || before.rows[0].name })
            );
          })
          .catch(() => {});
      }
    } catch (e) {
      res.status(503).json({ error: e instanceof Error ? e.message : "Could not verify buyer." });
    }
  });

  router.post("/verify/lot/:id", async (req, res) => {
    if (!requireDb(res) || !requireDesk(req, res)) return;
    const status = str(req.body?.status, 20);
    if (!["verified", "rejected"].includes(status)) {
      return res.status(400).json({ error: "status must be verified or rejected." });
    }
    try {
      const lotBefore = await dbQuery(
        `SELECT listed_by::text AS "listedBy", company_id::text AS "companyId",
                district, bird_count AS "birdCount"
           FROM pipeline_lots WHERE id = $1::uuid`,
        [req.params.id]
      );
      await dbQuery(
        `UPDATE pipeline_lots SET
            verification_status = $2,
            verified_at = CASE WHEN $2 = 'verified' THEN now() ELSE NULL END,
            verified_by = $3::uuid,
            updated_at = now()
          WHERE id = $1::uuid`,
        [req.params.id, status === "verified" ? "verified" : "rejected", req.authUser.id]
      );
      audit(req.authUser, "pipeline.verify.lot", "pipeline_lot", req.params.id, { status });
      res.json({ ok: true, status });
      const lot = lotBefore.rows[0];
      if (status === "verified" && lot) {
        void emailsForLotOwners(dbQuery, { listedBy: lot.listedBy, companyId: lot.companyId })
          .then((owners) =>
            notifyMany(owners, (u) =>
              buildLotLiveEmail({
                name: u.fullName,
                district: lot.district,
                birds: lot.birdCount,
              })
            )
          )
          .catch(() => {});
      }
    } catch (e) {
      res.status(503).json({ error: e instanceof Error ? e.message : "Could not verify lot." });
    }
  });

  // ——— Commissions ———

  router.get("/commissions/mine", async (req, res) => {
    if (!requireDb(res)) return;
    if (!canScoutPipeline(req.authUser) && !canAccessPipelineDesk(req.authUser)) {
      return res.status(403).json({ error: "Not allowed." });
    }
    const scoutId = canAccessPipelineDesk(req.authUser)
      ? str(req.query.userId, 64) || req.authUser.id
      : req.authUser.id;
    const ratePct = await getCommissionRatePct();
    try {
      const openLots = await dbQuery(
        `SELECT ${LOT_SELECT},
                COALESCE(m.matched, 0)::int AS "matchedBirds"
           FROM pipeline_lots l
           LEFT JOIN LATERAL (
             SELECT SUM(birds)::int AS matched
               FROM pipeline_matches pm
              WHERE pm.lot_id = l.id AND pm.status IN ('committed', 'delivered')
           ) m ON true
          WHERE l.scouted_by = $1::uuid
            AND l.status IN ('open', 'partial', 'draft')
            AND COALESCE(l.verification_status, 'verified') IN ('verified', 'pending_review')`,
        [scoutId]
      );
      let couldEarn = 0;
      for (const row of openLots.rows) {
        const mapped = mapLotRow(row);
        mapped.remainingBirds = remainingBirds(mapped.birdCount, Number(row.matchedBirds ?? 0));
        couldEarn += estimateLotCommission(mapped, ratePct).amountRwf;
      }

      const ledger = await dbQuery(
        `SELECT m.id::text AS id, 'trade' AS kind, m.birds, m.agreed_price_per_kg AS "agreedPricePerKg",
                m.commission_rate_pct AS "commissionRatePct",
                m.commission_amount_rwf AS "commissionAmountRwf",
                m.commission_status AS "commissionStatus",
                m.commission_paid_at AS "commissionPaidAt",
                m.status AS "matchStatus", m.created_at AS "createdAt",
                b.name AS "buyerName",
                l.farm_label AS "lotFarmLabel", l.district AS "lotDistrict"
           FROM pipeline_matches m
           JOIN pipeline_lots l ON l.id = m.lot_id
           JOIN pipeline_buyers b ON b.id = m.buyer_id
          WHERE m.commission_vet_user_id = $1::uuid
            AND m.commission_status IN ('accrued', 'paid', 'void')
          ORDER BY m.created_at DESC
          LIMIT 200`,
        [scoutId]
      );
      let visits = [];
      try {
        visits = await listVisitCommissionRows(dbQuery, { scoutId });
      } catch {
        visits = [];
      }
      const rows = [
        ...ledger.rows,
        ...visits,
      ].sort((a, b) => String(b.createdAt || "").localeCompare(String(a.createdAt || "")));
      const accruedUnpaid = rows
        .filter((r) => r.commissionStatus === "accrued")
        .reduce((s, r) => s + Number(r.commissionAmountRwf || 0), 0);
      const monthStart = new Date();
      monthStart.setDate(1);
      monthStart.setHours(0, 0, 0, 0);
      const paidThisMonth = rows
        .filter(
          (r) =>
            r.commissionStatus === "paid" &&
            r.commissionPaidAt &&
            new Date(r.commissionPaidAt) >= monthStart
        )
        .reduce((s, r) => s + Number(r.commissionAmountRwf || 0), 0);

      res.json({
        ratePct,
        couldEarn: Math.round(couldEarn * 100) / 100,
        accruedUnpaid: Math.round(accruedUnpaid * 100) / 100,
        paidThisMonth: Math.round(paidThisMonth * 100) / 100,
        rows,
      });
    } catch (e) {
      res.status(503).json({ error: e instanceof Error ? e.message : "Could not load commissions." });
    }
  });

  router.get("/commissions", async (req, res) => {
    if (!requireDb(res) || !requireDesk(req, res)) return;
    const status = str(req.query.status, 20);
    try {
      const r = await dbQuery(
        `SELECT m.id::text AS id, 'trade' AS kind, m.birds, m.commission_amount_rwf AS "commissionAmountRwf",
                m.commission_rate_pct AS "commissionRatePct",
                m.commission_status AS "commissionStatus",
                m.commission_paid_at AS "commissionPaidAt",
                m.commission_vet_user_id::text AS "commissionVetUserId",
                u.full_name AS "scoutName",
                b.name AS "buyerName",
                l.farm_label AS "lotFarmLabel", l.district AS "lotDistrict",
                m.created_at AS "createdAt"
           FROM pipeline_matches m
           JOIN pipeline_lots l ON l.id = m.lot_id
           JOIN pipeline_buyers b ON b.id = m.buyer_id
           LEFT JOIN users u ON u.id = m.commission_vet_user_id
          WHERE m.commission_status IN ('accrued', 'paid', 'void')
            AND ($1::text IS NULL OR m.commission_status = $1)
          ORDER BY m.created_at DESC
          LIMIT 300`,
        [status]
      );
      let visits = [];
      try {
        visits = await listVisitCommissionRows(dbQuery, { status: status || null });
      } catch {
        visits = [];
      }
      const commissions = [...r.rows, ...visits].sort((a, b) =>
        String(b.createdAt || "").localeCompare(String(a.createdAt || ""))
      );
      res.json({ commissions });
    } catch (e) {
      res.status(503).json({ error: e instanceof Error ? e.message : "Could not list commissions." });
    }
  });

  router.post("/commissions/:matchId/pay", async (req, res) => {
    if (!requireDb(res) || !requireDesk(req, res)) return;
    const matchId = req.params.matchId;
    const note = str(req.body?.note, 2000);
    const kind = str(req.body?.kind, 10) || "trade";
    try {
      if (kind === "visit") {
        const cur = await dbQuery(
          `SELECT id::text AS id, fee_rwf AS "amount", fee_status AS "status",
                  scout_user_id::text AS "scoutId"
             FROM farm_visits WHERE id = $1::uuid`,
          [matchId]
        );
        const row = cur.rows[0];
        if (!row) return res.status(404).json({ error: "Visit not found." });
        if (row.status !== "accrued") {
          return res.status(400).json({ error: `Cannot pay visit fee in status ${row.status}.` });
        }
        const amount = Number(row.amount || 0);
        await dbQuery(
          `UPDATE farm_visits SET fee_status = 'paid', updated_at = now() WHERE id = $1::uuid`,
          [matchId]
        );
        audit(req.authUser, "pipeline.visit_fee.pay", "farm_visit", matchId, { amount });
        return res.json({ ok: true, amountRwf: amount, kind: "visit" });
      }
      const cur = await dbQuery(
        `SELECT id::text AS id, commission_amount_rwf AS "amount",
                commission_status AS "status", commission_vet_user_id::text AS "scoutId"
           FROM pipeline_matches WHERE id = $1::uuid`,
        [matchId]
      );
      const row = cur.rows[0];
      if (!row) return res.status(404).json({ error: "Match not found." });
      if (row.status !== "accrued") {
        return res.status(400).json({ error: `Cannot pay commission in status ${row.status}.` });
      }
      const amount = Number(row.amount || 0);
      await dbQuery(
        `UPDATE pipeline_matches SET
            commission_status = 'paid',
            commission_paid_at = now(),
            commission_paid_by = $2::uuid,
            updated_at = now()
          WHERE id = $1::uuid`,
        [matchId, req.authUser.id]
      );
      await dbQuery(
        `INSERT INTO pipeline_commission_payouts (match_id, amount_rwf, paid_by, note)
         VALUES ($1::uuid, $2, $3::uuid, $4)`,
        [matchId, amount, req.authUser.id, note]
      );
      audit(req.authUser, "pipeline.commission.pay", "pipeline_match", matchId, { amount });
      res.json({ ok: true, amountRwf: amount });
      if (row.scoutId) {
        void emailForUserId(dbQuery, row.scoutId)
          .then((scout) => {
            if (!scout?.email) return;
            return notifyMany([scout], () =>
              buildCommissionPaidEmail({ name: scout.fullName, amountRwf: amount })
            );
          })
          .catch(() => {});
      }
    } catch (e) {
      res.status(503).json({ error: e instanceof Error ? e.message : "Could not mark paid." });
    }
  });

  router.post("/commissions/:matchId/void", async (req, res) => {
    if (!requireDb(res) || !requireDesk(req, res)) return;
    const matchId = req.params.matchId;
    const note = str(req.body?.note, 2000);
    const kind = str(req.body?.kind, 10) || "trade";
    try {
      if (kind === "visit") {
        await dbQuery(
          `UPDATE farm_visits SET fee_status = 'void', notes = COALESCE($2, notes), updated_at = now()
            WHERE id = $1::uuid AND fee_status = 'accrued'`,
          [matchId, note]
        );
        audit(req.authUser, "pipeline.visit_fee.void", "farm_visit", matchId, {});
        return res.json({ ok: true, kind: "visit" });
      }
      await dbQuery(
        `UPDATE pipeline_matches SET
            commission_status = 'void',
            learning_notes = COALESCE($2, learning_notes),
            updated_at = now()
          WHERE id = $1::uuid AND commission_status = 'accrued'`,
        [matchId, note]
      );
      audit(req.authUser, "pipeline.commission.void", "pipeline_match", matchId, {});
      res.json({ ok: true });
    } catch (e) {
      res.status(503).json({ error: e instanceof Error ? e.message : "Could not void." });
    }
  });

  router.get("/market/ops-summary", async (req, res) => {
    if (!requireDb(res) || !requireDesk(req, res)) return;
    try {
      const [lotsR, bookedR, unpaidR, leadsR, exceptR] = await Promise.all([
        dbQuery(
          `SELECT COALESCE(SUM(
              GREATEST(
                l.bird_count - COALESCE((
                  SELECT SUM(pm.birds)::int FROM pipeline_matches pm
                   WHERE pm.lot_id = l.id AND pm.status IN ('committed', 'delivered')
                ), 0),
                0
              )
            ), 0)::int AS "openLotBirds"
             FROM pipeline_lots l
            WHERE l.status IN ('open', 'partial')
              AND COALESCE(l.verification_status, 'verified') = 'verified'`
        ),
        dbQuery(
          `SELECT COALESCE(SUM(birds), 0)::int AS "committedThisWeek"
             FROM pipeline_matches
            WHERE status = 'committed'
              AND created_at >= date_trunc('week', now())`
        ),
        dbQuery(
          `SELECT COALESCE(SUM(commission_amount_rwf), 0)::float AS "accruedUnpaidRwf"
             FROM pipeline_matches
            WHERE commission_status = 'accrued'`
        ),
        dbQuery(
          `SELECT COUNT(*)::int AS n FROM market_leads WHERE status = 'new'`
        ).catch(() => ({ rows: [{ n: 0 }] })),
        dbQuery(
          `SELECT COUNT(*)::int AS n FROM pipeline_matches
            WHERE exception_kind <> 'none' AND exception_resolved_at IS NULL`
        ).catch(() => ({ rows: [{ n: 0 }] })),
      ]);
      res.json({
        openLotBirds: Number(lotsR.rows[0]?.openLotBirds || 0),
        committedThisWeek: Number(bookedR.rows[0]?.committedThisWeek || 0),
        accruedUnpaidRwf: Math.round(Number(unpaidR.rows[0]?.accruedUnpaidRwf || 0) * 100) / 100,
        newLeads: Number(leadsR.rows[0]?.n || 0),
        openExceptions: Number(exceptR.rows[0]?.n || 0),
      });
    } catch (e) {
      res.status(503).json({ error: e instanceof Error ? e.message : "Could not load ops summary." });
    }
  });

  // ——— Public market lead triage ———
  router.get("/leads", async (req, res) => {
    if (!requireDb(res) || !requireDesk(req, res)) return;
    try {
      const status = str(req.query.status, 20);
      const side = str(req.query.side, 10);
      const params = [];
      const clauses = ["TRUE"];
      if (status && status !== "all") {
        params.push(status);
        clauses.push(`ml.status = $${params.length}`);
      }
      if (side === "sell") {
        clauses.push(`(ml.source = 'public_sell' OR ml.buyer_type = 'farmer')`);
      } else if (side === "buy") {
        clauses.push(`NOT (ml.source = 'public_sell' OR COALESCE(ml.buyer_type, '') = 'farmer')`);
      }
      const where = clauses.join(" AND ");
      const leadSelect = `SELECT ml.id::text AS id,
                ml.lot_id::text AS "lotId",
                l.public_ref AS "lotPublicRef",
                ml.contact_name AS "contactName",
                ml.phone,
                ml.business_name AS "businessName",
                ml.buyer_type AS "buyerType",
                ml.district,
                ml.birds,
                ml.needed_from AS "neededFrom",
                ml.message,
                ml.source,
                ml.status,
                ml.assigned_to::text AS "assignedTo",
                ml.buyer_id::text AS "buyerId",
                ml.ops_notes AS "opsNotes",
                ml.created_at AS "createdAt",
                ml.updated_at AS "updatedAt",
                ml.avg_weight_kg AS "avgWeightKg",
                ml.quote_json AS "quoteJson"`;
      const extras = `,
                ml.typical_birds_per_week AS "typicalBirdsPerWeek",
                ml.settle_terms AS "settleTerms",
                ml.expected_rwf_per_kg AS "expectedRwfPerKg",
                ml.handover,
                ml.process`;
      const from = `
           FROM market_leads ml
           LEFT JOIN pipeline_lots l ON l.id = ml.lot_id
          WHERE ${where}
          ORDER BY ml.created_at DESC
          LIMIT 200`;
      let r;
      try {
        r = await dbQuery(`${leadSelect}${extras}${from}`, params);
      } catch (schemaErr) {
        if (
          !/typical_birds|settle_terms|expected_rwf|handover|process|does not exist/i.test(
            String(schemaErr?.message || "")
          )
        ) {
          throw schemaErr;
        }
        r = await dbQuery(`${leadSelect}${from}`, params);
      }
      res.json({ leads: r.rows });
    } catch (e) {
      res.status(503).json({ error: e instanceof Error ? e.message : "Could not list leads." });
    }
  });

  router.patch("/leads/:id", async (req, res) => {
    if (!requireDb(res) || !requireDesk(req, res)) return;
    const id = str(req.params.id, 64);
    if (!id) return res.status(400).json({ error: "id required" });
    const body = req.body || {};
    const status = str(body.status, 20);
    const allowed = new Set(["new", "contacted", "converted", "spam", "closed"]);
    if (status && !allowed.has(status)) {
      return res.status(400).json({ error: "Invalid status" });
    }
    try {
      const r = await dbQuery(
        `UPDATE market_leads SET
            status = COALESCE($2, status),
            ops_notes = COALESCE($3, ops_notes),
            assigned_to = COALESCE($4::uuid, assigned_to),
            updated_at = now()
          WHERE id = $1::uuid
          RETURNING id::text AS id, status, ops_notes AS "opsNotes", assigned_to::text AS "assignedTo"`,
        [
          id,
          status || null,
          body.opsNotes != null ? str(body.opsNotes, 4000) : null,
          body.assignedTo != null ? str(body.assignedTo, 64) || null : null,
        ]
      );
      if (!r.rows[0]) return res.status(404).json({ error: "Lead not found" });
      audit(req.authUser, "market.lead.update", "market_lead", id, { status: r.rows[0].status });
      res.json({ lead: r.rows[0] });
    } catch (e) {
      res.status(503).json({ error: e instanceof Error ? e.message : "Could not update lead." });
    }
  });

  router.post("/leads/:id/convert", async (req, res) => {
    if (!requireDb(res) || !requireDesk(req, res)) return;
    const id = str(req.params.id, 64);
    if (!id) return res.status(400).json({ error: "id required" });
    try {
      const leadCore = `SELECT id::text AS id, contact_name AS "contactName", phone, business_name AS "businessName",
                buyer_type AS "buyerType", district, birds, needed_from AS "neededFrom",
                message, status, source, buyer_id::text AS "buyerId", lot_id::text AS "lotId",
                avg_weight_kg AS "avgWeightKg", quote_json AS "quoteJson"`;
      const leadExtras = `,
                typical_birds_per_week AS "typicalBirdsPerWeek",
                settle_terms AS "settleTerms",
                expected_rwf_per_kg AS "expectedRwfPerKg",
                handover, process`;
      let leadR;
      try {
        leadR = await dbQuery(`${leadCore}${leadExtras} FROM market_leads WHERE id = $1::uuid LIMIT 1`, [id]);
      } catch (schemaErr) {
        if (
          !/typical_birds|settle_terms|expected_rwf|handover|process|does not exist/i.test(
            String(schemaErr?.message || "")
          )
        ) {
          throw schemaErr;
        }
        leadR = await dbQuery(`${leadCore} FROM market_leads WHERE id = $1::uuid LIMIT 1`, [id]);
      }
      const lead = leadR.rows[0];
      if (!lead) return res.status(404).json({ error: "Lead not found" });
      if (lead.status === "converted") {
        if (isSellLead(lead) && lead.lotId) {
          return res.json({ ok: true, lotId: lead.lotId, alreadyConverted: true });
        }
        if (lead.buyerId) {
          return res.json({ ok: true, buyerId: lead.buyerId, alreadyConverted: true });
        }
      }

      if (isSellLead(lead)) {
        const birdsNeeded = Number(lead.birds) > 0 ? Number(lead.birds) : 50;
        const district = lead.district || "Kigali";
        const farmLabel = lead.businessName || lead.contactName || "Seller lead";
        const buckets = forwardWeekBuckets();
        const readyFrom = lead.neededFrom || buckets[0].from;
        const weekTo = buckets[1]?.to || buckets[0].to;
        const readyTo = String(readyFrom) <= String(weekTo) ? weekTo : readyFrom;
        const ask = farmGateFromQuoteJson(lead.quoteJson);
        const avgKg = Number(lead.avgWeightKg) > 0 ? Number(lead.avgWeightKg) : null;
        const lotIns = await dbQuery(
          `INSERT INTO pipeline_lots
             (source, farm_label, contact_phone, district,
              bird_count, saleable_birds, ready_from, ready_to,
              ask_price_per_kg, avg_weight_kg,
              status, verification_status, listed_by, opted_in_at, notes, created_by,
              visibility_tier, product_type)
           VALUES
             ('scout', $1, $2, $3,
              $4, $4, $5::date, $6::date,
              $9, $10,
              'open', 'pending_review', $7::uuid, now(), $8, $7::uuid,
              'brokered_public', 'broiler_birds')
           RETURNING id::text AS id, public_ref AS "publicRef"`,
          [
            farmLabel,
            lead.phone,
            district,
            birdsNeeded,
            readyFrom,
            readyTo,
            req.authUser.id,
            `Converted from public_sell lead ${id}${lead.message ? `: ${lead.message}` : ""}`.slice(0, 2000),
            ask,
            avgKg,
          ]
        );
        const lotId = lotIns.rows[0].id;
        const publicRef = lotIns.rows[0].publicRef || null;
        await dbQuery(
          `UPDATE market_leads SET
              status = 'converted',
              lot_id = $2::uuid,
              updated_at = now()
            WHERE id = $1::uuid`,
          [id, lotId]
        );
        audit(req.authUser, "market.lead.convert_sell", "market_lead", id, { lotId });
        return res.json({ ok: true, lotId, publicRef });
      }

      const buyerTypeRaw = String(lead.buyerType || "other").toLowerCase();
      const buyerTypeMap = {
        butcher: "butcher",
        restaurant: "restaurant",
        hotel: "hotel",
        trader: "vendor",
        vendor: "vendor",
        institution: "institution",
        other: "other",
      };
      const buyerType = buyerTypeMap[buyerTypeRaw] || "other";
      const name = lead.businessName || lead.contactName || "Market lead";
      const birdsNeeded = Number(lead.birds) > 0 ? Number(lead.birds) : 50;

      const typical =
        Number(lead.typicalBirdsPerWeek) > 0 ? Math.round(Number(lead.typicalBirdsPerWeek)) : null;
      const settleTerms = lead.settleTerms || null;
      const expectedRwfPerKg =
        Number(lead.expectedRwfPerKg) > 0 ? Math.round(Number(lead.expectedRwfPerKg)) : null;
      const handover = lead.handover === "collect" || lead.handover === "delivery" ? lead.handover : null;
      const prefersSlaughtered = lead.process === "live" ? false : lead.process === "slaughter" ? true : null;
      const collectOrDelivery = handover || "either";

      let buyerId = lead.buyerId;
      if (!buyerId) {
        // Reuse existing buyer by phone if present
        const existing = await dbQuery(
          `SELECT id::text AS id FROM pipeline_buyers
            WHERE phone = $1 OR whatsapp = $1
            ORDER BY created_at DESC LIMIT 1`,
          [lead.phone]
        );
        if (existing.rows[0]) {
          buyerId = existing.rows[0].id;
        } else {
          try {
            const ins = await dbQuery(
              `INSERT INTO pipeline_buyers
                 (name, buyer_type, district, whatsapp, phone, notes, user_id, verification_status, created_by,
                  weekly_birds_min, weekly_birds_max, prefers_slaughtered, collect_or_delivery,
                  settle_terms, expected_rwf_per_kg)
               VALUES ($1, $2, $3, $4, $4, $5, NULL, 'pending', $6::uuid,
                       $7, $7, COALESCE($8, true), $9, $10, $11)
               RETURNING id::text AS id`,
              [
                name,
                buyerType,
                lead.district || null,
                lead.phone,
                `Converted from public lead ${id}${lead.message ? `: ${lead.message}` : ""}`.slice(0, 2000),
                req.authUser.id,
                typical,
                prefersSlaughtered,
                collectOrDelivery,
                settleTerms,
                expectedRwfPerKg,
              ]
            );
            buyerId = ins.rows[0].id;
          } catch (schemaErr) {
            if (!/settle_terms|expected_rwf|does not exist/i.test(String(schemaErr?.message || ""))) {
              throw schemaErr;
            }
            const ins = await dbQuery(
              `INSERT INTO pipeline_buyers
                 (name, buyer_type, district, whatsapp, phone, notes, user_id, verification_status, created_by,
                  weekly_birds_min, weekly_birds_max, prefers_slaughtered, collect_or_delivery)
               VALUES ($1, $2, $3, $4, $4, $5, NULL, 'pending', $6::uuid, $7, $7, COALESCE($8, true), $9)
               RETURNING id::text AS id`,
              [
                name,
                buyerType,
                lead.district || null,
                lead.phone,
                `Converted from public lead ${id}${lead.message ? `: ${lead.message}` : ""}`.slice(0, 2000),
                req.authUser.id,
                typical,
                prefersSlaughtered,
                collectOrDelivery,
              ]
            );
            buyerId = ins.rows[0].id;
          }
        }
      }

      if (buyerId) {
        try {
          await dbQuery(
            `UPDATE pipeline_buyers SET
                weekly_birds_min = COALESCE($2, weekly_birds_min),
                weekly_birds_max = COALESCE($2, weekly_birds_max),
                prefers_slaughtered = COALESCE($3, prefers_slaughtered),
                collect_or_delivery = COALESCE($4, collect_or_delivery),
                settle_terms = COALESCE($5, settle_terms),
                expected_rwf_per_kg = COALESCE($6, expected_rwf_per_kg),
                updated_at = now()
              WHERE id = $1::uuid`,
            [buyerId, typical, prefersSlaughtered, handover, settleTerms, expectedRwfPerKg]
          );
        } catch {
          /* extras optional until 069 is applied */
        }
      }

      let demandIns;
      try {
        demandIns = await dbQuery(
          `INSERT INTO pipeline_demands
             (buyer_id, birds_needed, needed_from, district_preference, status, channel, raw_notes, created_by,
              settle_terms, expected_rwf_per_kg, handover)
           VALUES ($1::uuid, $2, $3::date, $4, 'open', 'other', $5, $6::uuid, $7, $8, $9)
           RETURNING id::text AS id`,
          [
            buyerId,
            birdsNeeded,
            lead.neededFrom || null,
            lead.district || null,
            `Lead ${id}${lead.lotId ? ` lot=${lead.lotId}` : ""}`.slice(0, 4000),
            req.authUser.id,
            settleTerms,
            expectedRwfPerKg,
            handover,
          ]
        );
      } catch (schemaErr) {
        if (!/settle_terms|expected_rwf|handover|does not exist/i.test(String(schemaErr?.message || ""))) {
          throw schemaErr;
        }
        demandIns = await dbQuery(
          `INSERT INTO pipeline_demands
             (buyer_id, birds_needed, needed_from, district_preference, status, channel, raw_notes, created_by)
           VALUES ($1::uuid, $2, $3::date, $4, 'open', 'other', $5, $6::uuid)
           RETURNING id::text AS id`,
          [
            buyerId,
            birdsNeeded,
            lead.neededFrom || null,
            lead.district || null,
            `Lead ${id}${lead.lotId ? ` lot=${lead.lotId}` : ""}`.slice(0, 4000),
            req.authUser.id,
          ]
        );
      }

      await dbQuery(
        `UPDATE market_leads SET
            status = 'converted',
            buyer_id = $2::uuid,
            updated_at = now()
          WHERE id = $1::uuid`,
        [id, buyerId]
      );

      audit(req.authUser, "market.lead.convert", "market_lead", id, {
        buyerId,
        demandId: demandIns.rows[0].id,
      });
      res.json({
        ok: true,
        buyerId,
        demandId: demandIns.rows[0].id,
      });
    } catch (e) {
      console.error("[leads/convert]", e);
      res.status(503).json({ error: e instanceof Error ? e.message : "Could not convert lead." });
    }
  });

  router.get("/market/me", async (req, res) => {
    if (!requireDb(res)) return;
    try {
      if (isBuyerRole(req.authUser)) {
        const buyer = await loadBuyerForUser(req.authUser.id);
        const live = Boolean(buyer && buyer.active !== false);
        return res.json({
          accountType: "buyer",
          verificationStatus: live ? "verified" : buyer?.verificationStatus ?? "pending",
          buyer,
        });
      }
      if (canListFarmerLots(req.authUser) && !canAccessPipelineDesk(req.authUser)) {
        const company = await loadCompanyVerification(req.authUser.companyId);
        const profile = await loadProfileForFarmer(dbQuery, req.authUser);
        return res.json({
          accountType: "farmer",
          verificationStatus: company?.verificationStatus ?? "pending",
          company,
          profile,
        });
      }
      res.json({ accountType: req.authUser.role, verificationStatus: "verified" });
    } catch (e) {
      res.status(503).json({ error: e instanceof Error ? e.message : "Could not load status." });
    }
  });
}
