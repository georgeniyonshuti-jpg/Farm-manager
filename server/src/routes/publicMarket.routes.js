/**
 * Public marketplace API — no auth. Safe projections only.
 */

import { Router } from "express";
import crypto from "crypto";
import {
  mapPublicLot,
  publicWeekBuckets,
  validatePublicRequest,
  validatePublicSellRequest,
  weekParamToBucketKey,
  leadReferenceFromId,
  isPublicMarketLotEligible,
  normalizeWhatsapp,
  MATCHED_STATUSES_SQL,
} from "../services/pipeline/publicMarket.js";
import { remainingBirds } from "../services/pipeline/pipeline.js";
import { publicEligibleWhereSql } from "../services/pipeline/sellingWeek.js";
import { buildLeadReceivedEmail, notifyMany, emailsForDeskRoles } from "../services/pipeline/marketNotify.js";
import {
  FARM_PROFILE_SELECT,
  isProfilePubliclyVisible,
  mapFarmProfileRow,
  mapPublicFarm,
  marketplaceStorefrontsEnabled,
} from "../services/pipeline/farmProfiles.js";
import { recordMarketEvent, validateMarketEvent } from "../services/pipeline/marketEvents.js";
import {
  capPricedOffers,
  computeOffer,
  computeQuote,
  loadPreviousCard,
  loadPublishedCard,
  merchantTierOf,
  pickBand,
  buildMoneySplit,
  publicBuyerMoneySplit,
  publicBoard,
  publicBuyerLeadSnapshot,
  publicFarmerQuote,
  sortOffers,
} from "../services/pipeline/marketQuote.js";

const PUBLIC_LOT_FROM = `
  FROM pipeline_lots l
  LEFT JOIN companies c ON c.id = l.company_id
  LEFT JOIN farm_profiles fp ON fp.id = l.farm_profile_id
  LEFT JOIN LATERAL (
    SELECT COALESCE(SUM(m.birds), 0)::int AS matched
      FROM pipeline_matches m
     WHERE m.lot_id = l.id AND m.status IN ${MATCHED_STATUSES_SQL}
  ) mb ON true
  LEFT JOIN LATERAL (
    SELECT COALESCE(json_agg(json_build_object(
      'secureUrl', mm.secure_url,
      'purpose', mm.purpose,
      'caption', mm.caption,
      'width', mm.width,
      'height', mm.height
    ) ORDER BY mm.sort_order, mm.created_at), '[]'::json) AS media
      FROM market_media mm
     WHERE mm.owner_type = 'lot' AND mm.owner_id = l.id
       AND mm.moderation_status = 'approved'
  ) lm ON true
  LEFT JOIN LATERAL (
    SELECT COALESCE(json_agg(json_build_object(
      'secureUrl', mm.secure_url,
      'purpose', mm.purpose,
      'caption', mm.caption,
      'width', mm.width,
      'height', mm.height
    ) ORDER BY mm.sort_order, mm.created_at), '[]'::json) AS media
      FROM market_media mm
     WHERE mm.owner_type = 'farm_profile' AND mm.owner_id = fp.id
       AND mm.moderation_status = 'approved'
  ) fm ON true
`;

const PUBLIC_LOT_SELECT = `
  l.public_ref AS "publicRef",
  l.district,
  l.bird_count AS "birdCount",
  l.saleable_birds AS "saleableBirds",
  l.breed_code AS "breedCode",
  l.avg_weight_kg AS "avgWeightKg",
  l.expected_weight_kg AS "expectedWeightKg",
  l.ready_from AS "readyFrom",
  l.ready_to AS "readyTo",
  l.ask_price_per_kg AS "askPricePerKg",
  l.farmer_can_slaughter AS "farmerCanSlaughter",
  l.delivery_available AS "deliveryAvailable",
  l.min_order_birds AS "minOrderBirds",
  COALESCE(l.product_type, 'broiler_birds') AS "productType",
  COALESCE(l.visibility_tier, 'brokered_public') AS "visibilityTier",
  l.public_title AS "publicTitle",
  l.public_story AS "publicStory",
  COALESCE(mb.matched, 0)::int AS "matchedBirds",
  l.source,
  l.flock_id::text AS "flockId",
  COALESCE(l.rank_eligible, true) AS "rankEligible",
  l.scout_confirmed_at AS "scoutConfirmedAt",
  COALESCE(c.verification_status, 'verified') AS "companyVerificationStatus",
  lm.media AS "lotMedia",
  fm.media AS "farmMedia",
  fp.slug AS "farmSlug",
  fp.display_name AS "farmDisplayName",
  fp.story AS "farmStory",
  fp.district AS "farmDistrict",
  fp.location_label AS "farmLocationLabel",
  fp.specialties AS "farmSpecialties",
  fp.slaughter_available AS "farmSlaughter",
  fp.delivery_available AS "farmDelivery",
  fp.published AS "farmPublished",
  fp.consent_status AS "farmConsentStatus",
  fp.verification_status AS "farmVerificationStatus",
  fp.disclose_contact AS "farmDiscloseContact",
  fp.disclose_exact_location AS "farmDiscloseExact",
  fp.contact_phone AS "farmContactPhone",
  fp.contact_whatsapp AS "farmContactWhatsapp"
`;

const LEGACY_PUBLIC_ELIGIBLE_WHERE = `
  l.status IN ('open', 'partial')
  AND COALESCE(l.verification_status, 'verified') = 'verified'
  AND GREATEST(0, COALESCE(l.saleable_birds, l.bird_count, 0) - COALESCE(mb.matched, 0)) > 0
`;

function publicEligibleWhere(now = new Date()) {
  return publicEligibleWhereSql(now);
}

const LEGACY_LOT_FROM = `
  FROM pipeline_lots l
  LEFT JOIN LATERAL (
    SELECT COALESCE(SUM(m.birds), 0)::int AS matched
      FROM pipeline_matches m
     WHERE m.lot_id = l.id AND m.status IN ${MATCHED_STATUSES_SQL}
  ) mb ON true
`;

const LEGACY_LOT_SELECT = `
  l.public_ref AS "publicRef",
  l.district,
  l.bird_count AS "birdCount",
  l.saleable_birds AS "saleableBirds",
  l.breed_code AS "breedCode",
  l.avg_weight_kg AS "avgWeightKg",
  l.expected_weight_kg AS "expectedWeightKg",
  l.ready_from AS "readyFrom",
  l.ready_to AS "readyTo",
  l.ask_price_per_kg AS "askPricePerKg",
  l.farmer_can_slaughter AS "farmerCanSlaughter",
  l.delivery_available AS "deliveryAvailable",
  l.min_order_birds AS "minOrderBirds",
  COALESCE(mb.matched, 0)::int AS "matchedBirds"
`;

function isMissingStorefrontSchema(err) {
  const msg = String(err?.message || err || "");
  return /farm_profiles|market_media|product_type|visibility_tier|scout_confirmed_at|min_order_birds|does not exist/i.test(msg);
}

function legacyWhere(where) {
  const parts = Array.isArray(where) ? where : [where];
  return [LEGACY_PUBLIC_ELIGIBLE_WHERE, ...parts.slice(1)]
    .filter((w) => w && !/\bfp\.|product_type|visibility_tier|scout_confirmed/.test(w))
    .join(" AND ");
}

async function runPublicLotQuery({ dbQuery, select, where, params = [], extra = "", legacySelect = LEGACY_LOT_SELECT }) {
  const whereSql = Array.isArray(where) ? where.join(" AND ") : where;
  try {
    return {
      rows: (await dbQuery(`SELECT ${select} ${PUBLIC_LOT_FROM} WHERE ${whereSql}${extra}`, params)).rows,
      legacy: false,
    };
  } catch (err) {
    if (!isMissingStorefrontSchema(err)) throw err;
    const safe = legacyWhere(where);
    return {
      rows: (await dbQuery(`SELECT ${legacySelect} ${LEGACY_LOT_FROM} WHERE ${safe}${extra}`, params)).rows,
      legacy: true,
    };
  }
}

/**
 * @param {{
 *   dbQuery: Function,
 *   hasDb: Function,
 *   ipWindowRateLimitMiddleware: Function,
 *   getAppSettingNumber: Function,
 * }} deps
 */
export function createPublicMarketRouter(deps) {
  const { dbQuery, hasDb, ipWindowRateLimitMiddleware, getAppSettingNumber, getAppSetting } = deps;
  const router = Router();

  const browseLimit = ipWindowRateLimitMiddleware(
    () => getAppSettingNumber("rate_limit_public_market_max", 120),
    () => getAppSettingNumber("rate_limit_public_market_window_ms", 60 * 1000),
    { error: "Too many market requests. Wait a moment." }
  );

  const requestLimit = ipWindowRateLimitMiddleware(
    () => getAppSettingNumber("rate_limit_public_request_max", 5),
    () => getAppSettingNumber("rate_limit_public_request_window_ms", 15 * 60 * 1000),
    { error: "Too many requests. Try again later." }
  );

  function requireDb(res) {
    if (!hasDb()) {
      res.status(503).json({ error: "Database unavailable" });
      return false;
    }
    return true;
  }

  function hashIp(req) {
    const ip = String(req.ip || req.headers["x-forwarded-for"] || "").split(",")[0].trim() || "unknown";
    const salt = process.env.MARKET_LEAD_IP_SALT || process.env.SESSION_SECRET || "cleva-market";
    return crypto.createHash("sha256").update(`${salt}:${ip}`).digest("hex");
  }

  function storefrontsOn() {
    const getter = getAppSetting || ((key, fallback) => {
      if (key === "marketplace_storefronts") return "1";
      return fallback;
    });
    return marketplaceStorefrontsEnabled((key, fallback) => {
      if (typeof getter === "function") return getter(key, fallback);
      return fallback;
    });
  }

  function parseMedia(raw) {
    if (!raw) return [];
    if (Array.isArray(raw)) return raw;
    if (typeof raw === "string") {
      try {
        const p = JSON.parse(raw);
        return Array.isArray(p) ? p : [];
      } catch {
        return [];
      }
    }
    return [];
  }

  function tripFromQuery(query = {}) {
    const birds = Number(query.birds);
    const avgKg = Number(query.avgKg ?? query.avg_kg);
    return {
      birds: Number.isFinite(birds) && birds > 0 ? Math.round(birds) : 100,
      avgKg: Number.isFinite(avgKg) && avgKg > 0 ? avgKg : null,
      slaughterPayer: String(query.slaughterPayer || query.slaughter || "butcher") === "farm" ? "farm" : "butcher",
      delivery: query.delivery === "1" || query.delivery === "true",
    };
  }

  function offerForPublicRow(row, card, trip = {}) {
    const available = remainingBirds(
      row.saleableBirds ?? row.saleable_birds ?? row.birdCount ?? row.bird_count,
      row.matchedBirds ?? row.matched ?? 0
    );
    const avgKg = trip.avgKg || Number(row.avgWeightKg ?? row.expectedWeightKg ?? 0);
    return computeOffer(card, {
      birds: trip.birds || 100,
      avgKg,
      askRwfPerKg: row.askPricePerKg,
      merchantTier: merchantTierOf(row, { verificationStatus: row.companyVerificationStatus }),
      slaughterPayer: trip.slaughterPayer,
      delivery: trip.delivery,
      rankEligible: row.rankEligible !== false,
      readyFrom: row.readyFrom,
      birdsAvailable: available,
    });
  }

  function stripOfferPrice(lot) {
    return {
      ...lot,
      priceBandRwf: null,
      buyerRwfPerKg: null,
      youPayRwf: null,
      moneySplit: null,
      priced: false,
    };
  }

  function butcherPriceForLot(row, card) {
    if (!card) return null;
    const kg = Number(row.avgWeightKg ?? row.avg_weight_kg ?? row.expectedWeightKg ?? row.expected_weight_kg);
    const band = pickBand(card.bands, kg);
    return band?.butcherRwfPerKg ?? null;
  }

  function rowToPublic(row, card = null, trip = {}, { hideFarm = true } = {}) {
    const matched = Number(row.matchedBirds ?? row.matched ?? 0);
    const available = remainingBirds(row.saleableBirds ?? row.saleable_birds ?? row.birdCount ?? row.bird_count, matched);
    const profile = row.farmSlug
      ? mapFarmProfileRow({
          slug: row.farmSlug,
          displayName: row.farmDisplayName,
          story: row.farmStory,
          district: row.farmDistrict || row.district,
          locationLabel: row.farmLocationLabel,
          specialties: row.farmSpecialties,
          slaughterAvailable: row.farmSlaughter,
          deliveryAvailable: row.farmDelivery,
          published: row.farmPublished,
          consentStatus: row.farmConsentStatus,
          verificationStatus: row.farmVerificationStatus,
          discloseContact: row.farmDiscloseContact,
          discloseExactLocation: row.farmDiscloseExact,
          contactPhone: row.farmContactPhone,
          contactWhatsapp: row.farmContactWhatsapp,
        })
      : null;
    const offer = offerForPublicRow(row, card, trip);
    return mapPublicLot(
      {
        ...row,
        birdCount: row.saleableBirds ?? row.saleable_birds ?? row.birdCount ?? row.bird_count,
        matchedBirds: matched,
      },
      {
        birdsAvailable: available,
        storefrontsEnabled: storefrontsOn(),
        audience: "guest",
        profile: hideFarm ? null : isProfilePubliclyVisible(profile) ? profile : null,
        media: parseMedia(row.lotMedia),
        profileMedia: hideFarm ? [] : parseMedia(row.farmMedia),
        coverUrl: hideFarm ? null : row.farmCoverUrl || null,
        butcherPricePerKg: offer?.butcher?.butcherRwfPerKg ?? butcherPriceForLot(row, card),
        offer,
        moneySplit: publicBuyerMoneySplit(buildMoneySplit(offer)),
        hideFarm,
      }
    );
  }

  router.get("/quote", browseLimit, async (req, res) => {
    if (!requireDb(res)) return;
    try {
      const card = await loadPublishedCard(dbQuery);
      const quote = publicFarmerQuote(
        computeQuote(card, {
          birds: req.query.birds,
          avgKg: req.query.avgKg ?? req.query.avg_kg,
          slaughterPayer: req.query.slaughterPayer ?? req.query.slaughter,
          delivery: req.query.delivery === "1" || req.query.delivery === "true",
        })
      );
      res.json({ quote });
    } catch (e) {
      console.error("[public-market] quote", e);
      res.status(500).json({ error: e.message || "Could not quote" });
    }
  });

  async function loadMarketWhatsapp() {
    try {
      const r = await dbQuery(
        `SELECT setting_value FROM app_settings WHERE setting_key = 'market_whatsapp_number' LIMIT 1`
      );
      const fromDb = normalizeWhatsapp(r.rows[0]?.setting_value);
      if (fromDb) return fromDb;
    } catch {
      /* fall back to env */
    }
    return normalizeWhatsapp(process.env.MARKET_WHATSAPP_NUMBER);
  }

  router.get("/board", browseLimit, async (req, res) => {
    if (!requireDb(res)) return;
    try {
      const card = await loadPublishedCard(dbQuery);
      const previous = card ? await loadPreviousCard(dbQuery, card).catch(() => null) : null;
      res.json({ board: publicBoard(card, previous), whatsapp: await loadMarketWhatsapp() });
    } catch (e) {
      console.error("[public-market] board", e);
      res.status(500).json({ error: e.message || "Could not load board" });
    }
  });

  /**
   * Build filtered public lot query.
   */
  function buildListQuery(query) {
    const params = [];
    const where = [publicEligibleWhere()];
    const district = String(query.district || "").trim();
    if (district) {
      params.push(district);
      where.push(`lower(l.district) = lower($${params.length})`);
    }
    const minBirds = Number(query.minBirds);
    if (Number.isFinite(minBirds) && minBirds > 0) {
      params.push(minBirds);
      where.push(
        `GREATEST(0, COALESCE(l.saleable_birds, l.bird_count, 0) - COALESCE(mb.matched, 0)) >= $${params.length}`
      );
    }
    const weekKey = weekParamToBucketKey(query.week);
    if (weekKey) {
      const buckets = publicWeekBuckets();
      const b = buckets[weekKey];
      if (b) {
        params.push(b.from);
        params.push(b.to);
        where.push(`l.ready_from::date >= $${params.length - 1}::date AND l.ready_from::date <= $${params.length}::date`);
      }
    }
    const productType = String(query.productType || query.product_type || "").trim();
    if (productType) {
      params.push(productType);
      where.push(`COALESCE(l.product_type, 'broiler_birds') = $${params.length}`);
    }
    const service = String(query.service || "").trim().toLowerCase();
    if (service === "slaughter") where.push("l.farmer_can_slaughter = true");
    if (service === "delivery") where.push("l.delivery_available = true");
    const farmMode = String(query.farmMode || query.farm || "").trim().toLowerCase();
    if (farmMode === "with_profile" || farmMode === "profile") {
      where.push(`COALESCE(l.visibility_tier, 'brokered_public') = 'profile_public'`);
      where.push(`fp.published = true AND fp.consent_status = 'granted' AND fp.verification_status = 'verified'`);
    }
    const sort = String(query.sort || "price").toLowerCase();
    let orderBy = "l.ready_from ASC NULLS LAST, l.created_at DESC";
    if (sort === "birds") {
      orderBy =
        "GREATEST(0, COALESCE(l.saleable_birds, l.bird_count, 0) - COALESCE(mb.matched, 0)) DESC, l.ready_from ASC";
    } else if (sort === "price") {
      orderBy = "l.ready_from ASC NULLS LAST, l.created_at DESC";
    }
    const pageSize = Math.min(24, Math.max(1, Number(query.pageSize) || 12));
    const page = Math.max(1, Number(query.page) || 1);
    const offset = Math.min(200 - pageSize, (page - 1) * pageSize);
    return { where, params, orderBy, pageSize, page, offset };
  }

  router.get("/lots", browseLimit, async (req, res) => {
    if (!requireDb(res)) return;
    try {
      const { where, params, orderBy, pageSize, page, offset } = buildListQuery(req.query || {});
      const countR = await runPublicLotQuery({
        dbQuery,
        select: "COUNT(*)::int AS n",
        where,
        params,
        legacySelect: "COUNT(*)::int AS n",
      });
      const total = Math.min(200, Number(countR.rows[0]?.n || 0));
      const rankInMemory = String((req.query || {}).sort || "price").toLowerCase() === "price";
      const fetchSize = rankInMemory ? 200 : pageSize;
      const fetchOffset = rankInMemory ? 0 : offset;
      const listParams = [...params, fetchSize, fetchOffset];
      const listR = await runPublicLotQuery({
        dbQuery,
        select: PUBLIC_LOT_SELECT,
        where,
        params: listParams,
        extra: `
         ORDER BY ${orderBy}
         LIMIT $${listParams.length - 1} OFFSET $${listParams.length}`,
      });
      const legacy = countR.legacy || listR.legacy;
      const card = await loadPublishedCard(dbQuery).catch(() => null);
      const trip = tripFromQuery(req.query || {});
      const decorated = listR.rows
        .map((row) => {
          const lot = rowToPublic(row, card, trip, { hideFarm: true });
          const offer = offerForPublicRow(row, card, trip);
          return { lot, offer, row };
        })
        .filter((x) =>
          legacy ||
          isPublicMarketLotEligible({
            status: "open",
            verificationStatus: "verified",
            remaining: x.lot.birdsAvailable,
            scoutConfirmedAt: x.row.scoutConfirmedAt,
            readyFrom: x.lot.readyFrom,
            readyTo: x.lot.readyTo,
          })
        );
      let items;
      let overflowCount = 0;
      if (rankInMemory) {
        const ranked = sortOffers(
          decorated.map((d) => (d.offer ? { ...d.offer, publicRef: d.lot.publicRef } : null)).filter(Boolean)
        );
        const rankedRefs = new Set(ranked.map((o) => o.publicRef));
        const byRef = new Map(decorated.map((d) => [d.lot.publicRef, d.lot]));
        const { priced, overflow } = capPricedOffers(ranked);
        overflowCount = overflow.length;
        const pricedLots = priced.map((o) => ({ ...byRef.get(o.publicRef), priced: true }));
        const overflowLots = overflow.map((o) => stripOfferPrice(byRef.get(o.publicRef)));
        const unranked = decorated
          .filter((d) => !rankedRefs.has(d.lot.publicRef))
          .map((d) => stripOfferPrice(d.lot));
        const ordered = [...pricedLots, ...overflowLots, ...unranked].filter(Boolean);
        items = ordered.slice(offset, offset + pageSize);
      } else {
        items = decorated.map((d) => (d.lot.rankEligible ? { ...d.lot, priced: true } : stripOfferPrice(d.lot)));
      }
      res.json({
        items,
        page,
        pageSize,
        total,
        overflowCount,
        hasMore: offset + items.length < total && offset + pageSize < 200,
      });
    } catch (e) {
      console.error("[public-market] lots", e);
      res.status(500).json({ error: e.message || "Failed to load market" });
    }
  });

  router.get("/lots/:publicRef", browseLimit, async (req, res) => {
    if (!requireDb(res)) return;
    try {
      const ref = String(req.params.publicRef || "").trim().toUpperCase();
      if (!ref) return res.status(404).json({ error: "Not found" });
      const r = await runPublicLotQuery({
        dbQuery,
        select: `${PUBLIC_LOT_SELECT},
            l.status,
            COALESCE(l.verification_status, 'verified') AS "verificationStatus"`,
        where: [publicEligibleWhere(), "upper(l.public_ref) = $1"],
        params: [ref],
        extra: " LIMIT 1",
        legacySelect: `${LEGACY_LOT_SELECT},
            l.status,
            COALESCE(l.verification_status, 'verified') AS "verificationStatus"`,
      });
      const row = r.rows[0];
      if (!row) return res.status(404).json({ error: "Listing not available" });
      const card = await loadPublishedCard(dbQuery).catch(() => null);
      const lot = rowToPublic(row, card);
      void recordMarketEvent(dbQuery, { eventType: "listing_view", publicRef: lot.publicRef }).catch(() => {});
      res.json({ lot });
    } catch (e) {
      console.error("[public-market] lot detail", e);
      res.status(500).json({ error: e.message || "Failed to load listing" });
    }
  });

  router.get("/summary", browseLimit, async (req, res) => {
    if (!requireDb(res)) return;
    try {
      const buckets = publicWeekBuckets();
      const summarySelect = `
            l.district,
            l.ready_from::date AS ready_from,
            GREATEST(0, COALESCE(l.saleable_birds, l.bird_count, 0) - COALESCE(mb.matched, 0))::int AS remaining,
            l.company_id`;
      const r = await runPublicLotQuery({
        dbQuery,
        select: summarySelect,
        where: [publicEligibleWhere()],
        legacySelect: summarySelect,
      });
      const byDistrict = {};
      let thisWeek = 0;
      let nextWeek = 0;
      let later = 0;
      const farmIds = new Set();
      for (const row of r.rows) {
        const rem = Number(row.remaining || 0);
        if (rem <= 0) continue;
        const d = String(row.district || "Unknown").trim() || "Unknown";
        byDistrict[d] = (byDistrict[d] || 0) + rem;
        if (row.company_id) farmIds.add(String(row.company_id));
        const rf = row.ready_from ? String(row.ready_from).slice(0, 10) : null;
        if (!rf) {
          later += rem;
          continue;
        }
        if (rf >= buckets.this_week.from && rf <= buckets.this_week.to) thisWeek += rem;
        else if (rf >= buckets.next_week.from && rf <= buckets.next_week.to) nextWeek += rem;
        else later += rem;
      }
      const districts = Object.entries(byDistrict)
        .map(([district, birds]) => ({ district, birds }))
        .sort((a, b) => b.birds - a.birds);
      res.json({
        birdsThisWeek: thisWeek,
        birdsNextWeek: nextWeek,
        birdsLater: later,
        districtsSupplying: districts.length,
        farmsVerified: farmIds.size,
        districts,
        buckets: {
          this_week: buckets.this_week,
          next_week: buckets.next_week,
          week_after: buckets.week_after,
        },
      });
    } catch (e) {
      console.error("[public-market] summary", e);
      res.status(500).json({ error: e.message || "Failed to load summary" });
    }
  });

  router.post("/requests", requestLimit, async (req, res) => {
    if (!requireDb(res)) return;
    try {
      const body = req.body || {};
      const v = validatePublicRequest({
        contactName: body.contactName ?? body.contact_name,
        phone: body.phone,
        birds: body.birds,
        honeypot: body.website ?? body.honeypot ?? body.company_url,
        formStartedAt: body.formStartedAt ?? body.form_started_at,
        typicalBirdsPerWeek: body.typicalBirdsPerWeek ?? body.typical_birds_per_week,
        settleTerms: body.settleTerms ?? body.settle_terms,
        expectedRwfPerKg: body.expectedRwfPerKg ?? body.expected_rwf_per_kg,
        handover: body.handover,
        process: body.process,
        neededWhen: body.neededWhen ?? body.needed_when,
        neededFrom: body.neededFrom ?? body.needed_from,
      });
      if (!v.ok) return res.status(400).json({ error: v.error });

      let lotId = null;
      let lotRef = null;
      let lotDistrict = null;
      let lotRow = null;
      const publicRef = String(body.publicRef ?? body.public_ref ?? "").trim().toUpperCase();
      if (publicRef) {
        const lr = await dbQuery(
          `SELECT l.id::text AS id, ${PUBLIC_LOT_SELECT}
             ${PUBLIC_LOT_FROM}
            WHERE upper(l.public_ref) = $1 AND ${publicEligibleWhere()}
            LIMIT 1`,
          [publicRef]
        );
        if (lr.rows[0]) {
          lotRow = lr.rows[0];
          lotId = lr.rows[0].id;
          lotRef = lr.rows[0].publicRef;
          lotDistrict = lr.rows[0].district;
        }
      }

      const district = String(body.district || lotDistrict || "").trim() || null;
      const businessName = String(body.businessName ?? body.business_name ?? "").trim() || null;
      const buyerType = String(body.buyerType ?? body.buyer_type ?? "").trim() || null;
      const message = String(body.message ?? "").trim() || null;
      const needed = v.neededFrom || null;
      const card = await loadPublishedCard(dbQuery).catch(() => null);
      const avgKg = Number(body.avgWeightKg ?? body.avg_weight_kg ?? lotRow?.avgWeightKg) || 1.8;
      const offer = lotRow
        ? offerForPublicRow(lotRow, card, {
            birds: v.birds,
            avgKg,
            slaughterPayer: "butcher",
            delivery: v.handover === "delivery",
          })
        : computeOffer(card, {
            birds: v.birds,
            avgKg,
            merchantTier: "market_only",
            slaughterPayer: "butcher",
            delivery: v.handover === "delivery",
          });
      const buyerSnap = publicBuyerLeadSnapshot(offer, { publicRef: lotRef });

      let ins;
      try {
        ins = await dbQuery(
          `INSERT INTO market_leads
             (lot_id, contact_name, phone, business_name, buyer_type, district, birds,
              needed_from, message, source, status, ip_hash,
              typical_birds_per_week, settle_terms, expected_rwf_per_kg, handover, process,
              avg_weight_kg, quote_json)
           VALUES ($1::uuid, $2, $3, $4, $5, $6, $7, $8::date, $9, 'public_market', 'new', $10,
                   $11, $12, $13, $14, $15, $16, $17::jsonb)
           RETURNING id::text AS id, created_at AS "createdAt"`,
          [
            lotId,
            v.contactName,
            v.phone,
            businessName,
            buyerType,
            district,
            v.birds,
            needed,
            message,
            hashIp(req),
            v.typicalBirdsPerWeek,
            v.settleTerms,
            v.expectedRwfPerKg,
            v.handover,
            v.process,
            avgKg,
            buyerSnap ? JSON.stringify(buyerSnap) : null,
          ]
        );
      } catch (schemaErr) {
        if (
          !/typical_birds|settle_terms|expected_rwf|handover|process|does not exist/i.test(
            String(schemaErr?.message || "")
          )
        ) {
          throw schemaErr;
        }
        ins = await dbQuery(
          `INSERT INTO market_leads
             (lot_id, contact_name, phone, business_name, buyer_type, district, birds,
              needed_from, message, source, status, ip_hash)
           VALUES ($1::uuid, $2, $3, $4, $5, $6, $7, $8::date, $9, 'public_market', 'new', $10)
           RETURNING id::text AS id, created_at AS "createdAt"`,
          [
            lotId,
            v.contactName,
            v.phone,
            businessName,
            buyerType,
            district,
            v.birds,
            needed,
            message,
            hashIp(req),
          ]
        );
      }
      const id = ins.rows[0]?.id;
      const reference = leadReferenceFromId(id);

      try {
        const deskEmails = await emailsForDeskRoles(dbQuery);
        if (deskEmails.length) {
          const mail = buildLeadReceivedEmail({
            reference,
            contactName: v.contactName,
            phone: v.phone,
            birds: v.birds,
            district,
            lotRef,
            businessName,
          });
          await notifyMany(deskEmails, () => mail);
        }
      } catch (notifyErr) {
        console.warn("[public-market] lead notify failed", notifyErr?.message || notifyErr);
      }

      void recordMarketEvent(dbQuery, {
        eventType: "request_submitted",
        lotId,
        publicRef: lotRef,
      }).catch(() => {});

      res.status(201).json({ ok: true, reference });
    } catch (e) {
      console.error("[public-market] request", e);
      res.status(500).json({ error: e.message || "Failed to submit request" });
    }
  });

  router.post("/sell-requests", requestLimit, async (req, res) => {
    if (!requireDb(res)) return;
    try {
      const body = req.body || {};
      const v = validatePublicSellRequest({
        contactName: body.contactName ?? body.contact_name,
        phone: body.phone,
        birds: body.birds,
        avgWeightKg: body.avgWeightKg ?? body.avg_weight_kg,
        honeypot: body.website ?? body.honeypot ?? body.company_url,
        formStartedAt: body.formStartedAt ?? body.form_started_at,
      });
      if (!v.ok) return res.status(400).json({ error: v.error });

      const district = String(body.district || "").trim() || null;
      const message = String(body.message ?? "").trim() || null;
      const card = await loadPublishedCard(dbQuery).catch(() => null);
      const snap = publicFarmerQuote(
        computeQuote(card, {
          birds: v.birds,
          avgKg: v.avgWeightKg,
          slaughterPayer: "butcher",
          delivery: false,
        })
      );

      let ins;
      try {
        ins = await dbQuery(
          `INSERT INTO market_leads
             (lot_id, contact_name, phone, business_name, buyer_type, district, birds,
              needed_from, message, source, status, ip_hash, avg_weight_kg, quote_json)
           VALUES (NULL, $1, $2, NULL, 'farmer', $3, $4, NULL, $5, 'public_sell', 'new', $6, $7, $8::jsonb)
           RETURNING id::text AS id, created_at AS "createdAt"`,
          [
            v.contactName,
            v.phone,
            district,
            v.birds,
            message,
            hashIp(req),
            v.avgWeightKg,
            snap ? JSON.stringify(snap) : null,
          ]
        );
      } catch (schemaErr) {
        if (!/avg_weight_kg|quote_json|does not exist/i.test(String(schemaErr?.message || ""))) throw schemaErr;
        ins = await dbQuery(
          `INSERT INTO market_leads
             (lot_id, contact_name, phone, business_name, buyer_type, district, birds,
              needed_from, message, source, status, ip_hash)
           VALUES (NULL, $1, $2, NULL, 'farmer', $3, $4, NULL, $5, 'public_sell', 'new', $6)
           RETURNING id::text AS id, created_at AS "createdAt"`,
          [v.contactName, v.phone, district, v.birds, message, hashIp(req)]
        );
      }
      const id = ins.rows[0]?.id;
      const reference = leadReferenceFromId(id);

      try {
        const deskEmails = await emailsForDeskRoles(dbQuery);
        if (deskEmails.length) {
          const mail = buildLeadReceivedEmail({
            reference,
            contactName: v.contactName,
            phone: v.phone,
            birds: v.birds,
            district,
            kind: "sell",
          });
          await notifyMany(deskEmails, () => mail);
        }
      } catch (notifyErr) {
        console.warn("[public-market] sell lead notify failed", notifyErr?.message || notifyErr);
      }

      void recordMarketEvent(dbQuery, {
        eventType: "request_submitted",
      }).catch(() => {});

      res.status(201).json({ ok: true, reference });
    } catch (e) {
      console.error("[public-market] sell-request", e);
      res.status(500).json({ error: e.message || "Failed to submit listing request" });
    }
  });

  router.post("/events", browseLimit, async (req, res) => {
    if (!requireDb(res)) return;
    const v = validateMarketEvent({
      eventType: req.body?.eventType ?? req.body?.type,
      farmProfileId: req.body?.farmProfileId,
      lotId: req.body?.lotId,
      publicRef: req.body?.publicRef,
    });
    if (!v.ok) return res.status(400).json({ error: v.error });
    if (v.eventType === "reservation") {
      return res.status(400).json({ error: "Reservations are recorded by the booking API." });
    }
    await recordMarketEvent(dbQuery, v);
    res.status(202).json({ ok: true });
  });

  router.get("/farms", browseLimit, async (req, res) => {
    if (!requireDb(res)) return;
    if (!storefrontsOn()) return res.json({ items: [], total: 0 });
    const district = String(req.query.district || "").trim();
    try {
      const params = [];
      const where = [
        `fp.published = true`,
        `fp.consent_status = 'granted'`,
        `fp.verification_status = 'verified'`,
      ];
      if (district) {
        params.push(district);
        where.push(`lower(fp.district) = lower($${params.length})`);
      }
      const r = await dbQuery(
        `SELECT ${FARM_PROFILE_SELECT},
                (
                  SELECT mm.secure_url FROM market_media mm
                   WHERE mm.owner_type = 'farm_profile' AND mm.owner_id = fp.id
                     AND mm.moderation_status = 'approved'
                   ORDER BY CASE WHEN mm.purpose = 'cover' THEN 0 ELSE 1 END, mm.sort_order
                   LIMIT 1
                ) AS "coverUrl"
           FROM farm_profiles fp
          WHERE ${where.join(" AND ")}
          ORDER BY fp.display_name ASC
          LIMIT 60`,
        params
      );
      const items = r.rows
        .map((row) => mapPublicFarm(mapFarmProfileRow(row), { coverUrl: row.coverUrl }))
        .filter(Boolean);
      res.json({ items, total: items.length });
    } catch (e) {
      console.error("[public-market] farms", e);
      res.status(500).json({ error: e.message || "Failed to load farms" });
    }
  });

  router.get("/farms/:slug", browseLimit, async (req, res) => {
    if (!requireDb(res)) return;
    if (!storefrontsOn()) return res.status(404).json({ error: "Not found" });
    const slug = String(req.params.slug || "").trim().toLowerCase();
    if (!slug) return res.status(404).json({ error: "Not found" });
    try {
      const r = await dbQuery(
        `SELECT ${FARM_PROFILE_SELECT}
           FROM farm_profiles fp
          WHERE fp.slug = $1
            AND fp.published = true
            AND fp.consent_status = 'granted'
            AND fp.verification_status = 'verified'
          LIMIT 1`,
        [slug]
      );
      const profile = mapFarmProfileRow(r.rows[0]);
      if (!profile) return res.status(404).json({ error: "Farm not available" });
      const mediaR = await dbQuery(
        `SELECT secure_url AS "secureUrl", purpose, caption, width, height
           FROM market_media
          WHERE owner_type = 'farm_profile' AND owner_id = $1::uuid
            AND moderation_status = 'approved'
          ORDER BY sort_order, created_at`,
        [profile.id]
      );
      const farm = mapPublicFarm(profile, { media: mediaR.rows });
      const lotsR = await dbQuery(
        `SELECT ${PUBLIC_LOT_SELECT}
         ${PUBLIC_LOT_FROM}
         WHERE ${publicEligibleWhere()}
           AND l.farm_profile_id = $1::uuid
           AND COALESCE(l.visibility_tier, 'brokered_public') = 'profile_public'
         ORDER BY l.ready_from ASC NULLS LAST
         LIMIT 24`,
        [profile.id]
      );
      void recordMarketEvent(dbQuery, { eventType: "profile_view", farmProfileId: profile.id }).catch(() => {});
      const card = await loadPublishedCard(dbQuery).catch(() => null);
      res.json({
        farm,
        lots: lotsR.rows.map((row) => rowToPublic(row, card)),
      });
    } catch (e) {
      console.error("[public-market] farm", e);
      res.status(500).json({ error: e.message || "Failed to load farm" });
    }
  });

  router.get("/featured", browseLimit, async (req, res) => {
    if (!requireDb(res)) return;
    try {
      const r = await runPublicLotQuery({
        dbQuery,
        select: PUBLIC_LOT_SELECT,
        where: [publicEligibleWhere()],
        extra: `
         ORDER BY l.ready_from ASC NULLS LAST
         LIMIT 40`,
      });
      const card = await loadPublishedCard(dbQuery).catch(() => null);
      const trip = tripFromQuery(req.query || {});
      const decorated = r.rows.map((row) => ({
        lot: rowToPublic(row, card, trip, { hideFarm: true }),
        offer: offerForPublicRow(row, card, trip),
      }));
      const ranked = sortOffers(
        decorated.map((d) => (d.offer ? { ...d.offer, publicRef: d.lot.publicRef } : null)).filter(Boolean)
      );
      const byRef = new Map(decorated.map((d) => [d.lot.publicRef, d.lot]));
      const { priced } = capPricedOffers(ranked);
      res.json({ items: priced.map((o) => ({ ...byRef.get(o.publicRef), priced: true })).filter(Boolean) });
    } catch (e) {
      console.error("[public-market] featured", e);
      res.status(500).json({ error: e.message || "Failed to load featured" });
    }
  });

  return router;
}

export default createPublicMarketRouter;
