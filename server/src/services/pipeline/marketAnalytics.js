/**
 * Market Command Center — SQL aggregations for native Analytics (and Superset SQL Lab templates).
 * Market tables are platform-scoped (market host desk), not barn-tenant filtered.
 */

import {
  DEFAULT_MARKET_EXPECTATIONS,
  normalizeMarketExpectations,
} from "../marketInsightsPacks.js";

/**
 * @param {Function} dbQuery
 * @param {string} key
 * @param {unknown} fallback
 */
async function readJsonSetting(dbQuery, key, fallback) {
  try {
    const r = await dbQuery(`SELECT setting_value FROM app_settings WHERE setting_key = $1`, [key]);
    if (!r.rows.length) return normalizeMarketExpectations(fallback);
    return normalizeMarketExpectations({ ...fallback, ...JSON.parse(r.rows[0].setting_value) });
  } catch {
    return normalizeMarketExpectations(fallback);
  }
}

async function safeQuery(dbQuery, sql, params = []) {
  try {
    return await dbQuery(sql, params);
  } catch (e) {
    console.warn("[marketAnalytics]", e instanceof Error ? e.message : e);
    return { rows: [] };
  }
}

function num(v, d = 0) {
  const n = Number(v);
  return Number.isFinite(n) ? n : d;
}

function pct(numr, den) {
  const d = num(den);
  if (d <= 0) return 0;
  return Math.round((num(numr) / d) * 1000) / 10;
}

/**
 * @param {{ dbQuery: Function, days?: number }} opts
 */
export async function buildMarketAnalytics(opts) {
  const dbQuery = opts.dbQuery;
  const days = Math.min(Math.max(Number(opts.days) || 30, 7), 90);
  const expectations = await readJsonSetting(
    dbQuery,
    "market_expectations",
    DEFAULT_MARKET_EXPECTATIONS
  );

  const [
    kpis,
    weeklySales,
    weeklyMatch,
    regionRows,
    supplyFunnel,
    demandFunnel,
    sellThrough,
    scoutRows,
    salesChannel,
    settlementRows,
    cycleRows,
    peopleByStage,
  ] = await Promise.all([
    safeQuery(
      dbQuery,
      `SELECT
         (SELECT COALESCE(SUM(birds), 0) FROM pipeline_matches
           WHERE created_at >= now() - ($1 || ' days')::interval
             AND status IN ('committed', 'delivered')) AS birds_sold,
         (SELECT COALESCE(SUM(
             COALESCE(buyer_paid_rwf, birds * COALESCE(agreed_price_per_kg, 0) * 1.5)
           ), 0) FROM pipeline_matches
           WHERE created_at >= now() - ($1 || ' days')::interval
             AND status IN ('committed', 'delivered')) AS gmv_rwf,
         (SELECT COALESCE(SUM(amount_rwf), 0) FROM market_settlements
           WHERE side = 'visit_fee' AND status = 'paid'
             AND created_at >= now() - ($1 || ' days')::interval) AS commission_rwf,
         (SELECT COUNT(*)::int FROM pipeline_lots
           WHERE status IN ('open', 'partial')) AS listings_live,
         (SELECT COUNT(*)::int FROM pipeline_buyers WHERE active IS TRUE) AS active_buyers,
         (SELECT COUNT(DISTINCT owner_user_id)::int FROM farm_profiles
           WHERE verification_status IN ('verified', 'pending')) AS active_sellers,
         (SELECT COUNT(*)::int FROM pipeline_matches
           WHERE created_at >= now() - ($1 || ' days')::interval
             AND status IN ('committed', 'delivered')) AS matches,
         (SELECT COUNT(*)::int FROM pipeline_lots
           WHERE created_at >= now() - ($1 || ' days')::interval) AS lots_created,
         (SELECT COUNT(*)::int FROM market_reach
           WHERE day >= (CURRENT_DATE - ($1 || ' days')::interval)::date
             AND event_type = 'opened') AS reach_opens,
         (SELECT COUNT(*)::int FROM signup_attempts
           WHERE created_at >= now() - ($1 || ' days')::interval
             AND outcome = 'succeeded') AS signups_ok`,
      [days]
    ),
    safeQuery(
      dbQuery,
      `SELECT date_trunc('week', created_at)::date AS week,
              COALESCE(SUM(birds), 0)::int AS birds,
              COALESCE(SUM(COALESCE(buyer_paid_rwf, birds * COALESCE(agreed_price_per_kg, 0) * 1.5)), 0)::float AS gmv
         FROM pipeline_matches
        WHERE created_at >= now() - interval '84 days'
          AND status IN ('committed', 'delivered')
        GROUP BY 1
        ORDER BY 1`,
      []
    ),
    safeQuery(
      dbQuery,
      `WITH weeks AS (
         SELECT date_trunc('week', d)::date AS week
           FROM generate_series(now() - interval '84 days', now(), interval '7 days') d
       ),
       lots AS (
         SELECT date_trunc('week', created_at)::date AS week, COUNT(*)::int AS n
           FROM pipeline_lots
          WHERE created_at >= now() - interval '84 days'
          GROUP BY 1
       ),
       matches AS (
         SELECT date_trunc('week', created_at)::date AS week, COUNT(*)::int AS n
           FROM pipeline_matches
          WHERE created_at >= now() - interval '84 days'
            AND status IN ('committed', 'delivered')
          GROUP BY 1
       )
       SELECT w.week,
              COALESCE(l.n, 0) AS lots,
              COALESCE(m.n, 0) AS matches
         FROM weeks w
         LEFT JOIN lots l ON l.week = w.week
         LEFT JOIN matches m ON m.week = w.week
        ORDER BY w.week`,
      []
    ),
    safeQuery(
      dbQuery,
      `WITH lot_regions AS (
         SELECT COALESCE(NULLIF(trim(district), ''), 'Unknown') AS district,
                COUNT(*) FILTER (WHERE status IN ('open', 'partial', 'matched'))::int AS listings,
                COALESCE(SUM(bird_count) FILTER (WHERE status IN ('open', 'partial')), 0)::int AS birds_listed
           FROM pipeline_lots
          GROUP BY 1
       ),
       buyer_regions AS (
         SELECT COALESCE(NULLIF(trim(district), ''), 'Unknown') AS district,
                COUNT(*)::int AS buyers
           FROM pipeline_buyers
          WHERE active IS TRUE
          GROUP BY 1
       )
       SELECT l.district,
              l.listings,
              l.birds_listed,
              COALESCE(b.buyers, 0)::int AS buyers
         FROM lot_regions l
         LEFT JOIN buyer_regions b ON b.district = l.district
        ORDER BY l.birds_listed DESC
        LIMIT 20`,
      []
    ),
    safeQuery(
      dbQuery,
      `SELECT
         (SELECT COUNT(*)::int FROM market_reach
           WHERE day >= (CURRENT_DATE - ($1 || ' days')::interval)::date
             AND event_type = 'opened'
             AND (account_type IS NULL OR account_type IN ('farmer', 'seller'))) AS visits,
         (SELECT COUNT(*)::int FROM signup_attempts
           WHERE created_at >= now() - ($1 || ' days')::interval
             AND outcome = 'succeeded'
             AND account_type IN ('farmer', 'seller')) AS signups,
         (SELECT COUNT(*)::int FROM people_onboarding
           WHERE account_type = 'farmer'
             AND stage IN ('contacted', 'call_booked', 'onboarded', 'active')
             AND created_at >= now() - ($1 || ' days')::interval) AS onboarded,
         (SELECT COUNT(DISTINCT owner_user_id)::int FROM farm_profiles fp
           WHERE fp.created_at >= now() - ($1 || ' days')::interval
             OR EXISTS (
               SELECT 1 FROM pipeline_lots pl
                WHERE pl.company_id = fp.company_id
                  AND pl.created_at >= now() - ($1 || ' days')::interval
             )) AS listed,
         (SELECT COUNT(DISTINCT pl.company_id)::int FROM pipeline_lots pl
           JOIN pipeline_matches pm ON pm.lot_id = pl.id
          WHERE pm.created_at >= now() - ($1 || ' days')::interval
            AND pm.status IN ('committed', 'delivered')) AS first_sale`,
      [days]
    ),
    safeQuery(
      dbQuery,
      `SELECT
         (SELECT COUNT(*)::int FROM market_reach
           WHERE day >= (CURRENT_DATE - ($1 || ' days')::interval)::date
             AND event_type = 'opened'
             AND (account_type IS NULL OR account_type = 'buyer')) AS visits,
         (SELECT COUNT(*)::int FROM signup_attempts
           WHERE created_at >= now() - ($1 || ' days')::interval
             AND outcome = 'succeeded'
             AND account_type = 'buyer') AS signups,
         (SELECT COUNT(*)::int FROM people_onboarding
           WHERE account_type = 'buyer'
             AND stage IN ('contacted', 'call_booked', 'onboarded', 'active')
             AND created_at >= now() - ($1 || ' days')::interval) AS onboarded,
         (SELECT COUNT(*)::int FROM pipeline_demands
           WHERE created_at >= now() - ($1 || ' days')::interval) AS demands,
         (SELECT COUNT(*)::int FROM pipeline_matches
           WHERE created_at >= now() - ($1 || ' days')::interval
             AND buyer_payment_status = 'paid') AS paid`,
      [days]
    ),
    safeQuery(
      dbQuery,
      `SELECT
         COUNT(*)::int AS listed,
         COUNT(*) FILTER (WHERE status IN ('matched', 'partial'))::int AS sold_ish,
         COUNT(*) FILTER (WHERE status = 'expired')::int AS expired
         FROM pipeline_lots
        WHERE created_at >= now() - ($1 || ' days')::interval`,
      [days]
    ),
    safeQuery(
      dbQuery,
      `SELECT u.id::text AS scout_id,
              COALESCE(NULLIF(trim(u.full_name), ''), u.email, 'Scout') AS name,
              COALESCE(NULLIF(trim(po.district), ''), NULLIF(trim(sa.district), ''), '—') AS district,
              COUNT(pl.id)::int AS lots,
              COALESCE(SUM(pl.bird_count), 0)::int AS birds,
              COUNT(DISTINCT pl.contact_phone)::int AS sellers,
              COUNT(pm.id)::int AS matches
         FROM users u
         LEFT JOIN people_onboarding po ON po.user_id = u.id
         LEFT JOIN scout_applications sa ON sa.user_id = u.id
         LEFT JOIN pipeline_lots pl
           ON pl.scouted_by = u.id
          AND pl.created_at >= now() - ($1 || ' days')::interval
         LEFT JOIN pipeline_matches pm
           ON pm.lot_id = pl.id
          AND pm.status IN ('committed', 'delivered')
        WHERE (u.department_keys ? 'scout')
           OR u.role = 'vet'
           OR sa.user_id IS NOT NULL
           OR po.account_type = 'scout'
        GROUP BY u.id, u.full_name, u.email, po.district, sa.district
        ORDER BY lots DESC, birds DESC
        LIMIT 50`,
      [days]
    ),
    safeQuery(
      dbQuery,
      `SELECT
         COUNT(*) FILTER (WHERE pl.source = 'scout')::int AS scout_lots,
         COUNT(*) FILTER (WHERE pl.source = 'managed_flock')::int AS app_lots,
         COALESCE(SUM(pm.birds) FILTER (WHERE pl.source = 'scout'), 0)::int AS scout_birds_sold,
         COALESCE(SUM(pm.birds) FILTER (WHERE pl.source = 'managed_flock'), 0)::int AS app_birds_sold
         FROM pipeline_matches pm
         JOIN pipeline_lots pl ON pl.id = pm.lot_id
        WHERE pm.created_at >= now() - ($1 || ' days')::interval
          AND pm.status IN ('committed', 'delivered')`,
      [days]
    ),
    safeQuery(
      dbQuery,
      `SELECT side, status, COUNT(*)::int AS n, COALESCE(SUM(amount_rwf), 0)::float AS amount
         FROM market_settlements
        WHERE created_at >= now() - ($1 || ' days')::interval
        GROUP BY side, status
        ORDER BY side, status`,
      [days]
    ),
    safeQuery(
      dbQuery,
      `SELECT
         AVG(EXTRACT(EPOCH FROM (pm.updated_at - pm.created_at)) / 3600.0)::float AS hours_to_update,
         AVG(EXTRACT(EPOCH FROM (pm.buyer_paid_at - pm.created_at)) / 3600.0)
           FILTER (WHERE pm.buyer_paid_at IS NOT NULL)::float AS hours_to_buyer_pay,
         AVG(EXTRACT(EPOCH FROM (pm.farmer_paid_at - pm.buyer_paid_at)) / 3600.0)
           FILTER (WHERE pm.farmer_paid_at IS NOT NULL AND pm.buyer_paid_at IS NOT NULL)::float AS hours_payout_lag
         FROM pipeline_matches pm
        WHERE pm.created_at >= now() - ($1 || ' days')::interval`,
      [days]
    ),
    safeQuery(
      dbQuery,
      `SELECT account_type, stage, COUNT(*)::int AS n
         FROM people_onboarding
        GROUP BY account_type, stage
        ORDER BY account_type, stage`,
      []
    ),
  ]);

  const k = kpis.rows[0] || {};
  const matchRate = pct(k.matches, k.lots_created);
  const takeRate = pct(k.commission_rwf, k.gmv_rwf);
  const st = sellThrough.rows[0] || {};
  const sellThroughPct = pct(st.sold_ish, st.listed);

  const sf = supplyFunnel.rows[0] || {};
  const df = demandFunnel.rows[0] || {};
  const ch = salesChannel.rows[0] || {};
  const cy = cycleRows.rows[0] || {};

  const scouts = scoutRows.rows.map((r) => {
    const lots = num(r.lots);
    const sellers = num(r.sellers);
    const birds = num(r.birds);
    return {
      scoutId: r.scout_id,
      name: r.name,
      district: r.district || "—",
      lots,
      birds,
      sellers,
      matches: num(r.matches),
      expected: {
        lots: num(expectations.scoutLotsPerWeek) * (days / 7),
        sellers: num(expectations.scoutSellersPerWeek) * (days / 7),
        birds: num(expectations.scoutBirdsPerWeek) * (days / 7),
      },
      vsExpected: {
        lotsPct: pct(lots, num(expectations.scoutLotsPerWeek) * (days / 7)),
        sellersPct: pct(sellers, num(expectations.scoutSellersPerWeek) * (days / 7)),
        birdsPct: pct(birds, num(expectations.scoutBirdsPerWeek) * (days / 7)),
      },
    };
  });

  const weeks = weeklySales.rows.map((r) => ({
    week: r.week,
    birds: num(r.birds),
    gmv: Math.round(num(r.gmv)),
  }));

  const matchTrend = weeklyMatch.rows.map((r) => ({
    week: r.week,
    lots: num(r.lots),
    matches: num(r.matches),
    matchRatePct: pct(r.matches, r.lots),
  }));

  return {
    days,
    dataAsOf: new Date().toISOString(),
    expectations,
    overview: {
      kpis: {
        gmvRwf: Math.round(num(k.gmv_rwf)),
        birdsSold: num(k.birds_sold),
        commissionRwf: Math.round(num(k.commission_rwf)),
        takeRatePct: takeRate,
        matchRatePct: matchRate,
        sellThroughPct,
        listingsLive: num(k.listings_live),
        activeSellers: num(k.active_sellers),
        activeBuyers: num(k.active_buyers),
        sellerBuyerRatio:
          num(k.active_buyers) > 0
            ? Math.round((num(k.active_sellers) / num(k.active_buyers)) * 100) / 100
            : null,
        reachOpens: num(k.reach_opens),
        signupsOk: num(k.signups_ok),
        matchRateTargetPct: num(expectations.matchRateTargetPct),
        sellThroughTargetPct: num(expectations.sellThroughTargetPct),
      },
      gmvTrend: weeks,
      matchTrend,
      byRegion: regionRows.rows.map((r) => ({
        district: r.district,
        listings: num(r.listings),
        birdsListed: num(r.birds_listed),
        buyers: num(r.buyers),
      })),
    },
    supply: {
      funnel: [
        { stage: "Visits", count: num(sf.visits) },
        { stage: "Signups", count: num(sf.signups) },
        { stage: "Onboarded", count: num(sf.onboarded) },
        { stage: "Listed", count: num(sf.listed) },
        { stage: "First sale", count: num(sf.first_sale) },
      ],
      sellThroughPct,
      listed: num(st.listed),
      sold: num(st.sold_ish),
      expired: num(st.expired),
      expectationDaysToListing: num(expectations.sellerDaysToFirstListing),
      peopleByStage: peopleByStage.rows
        .filter((r) => r.account_type === "farmer")
        .map((r) => ({ stage: r.stage, count: num(r.n) })),
      byRegion: regionRows.rows.map((r) => ({
        district: r.district,
        listings: num(r.listings),
        birdsListed: num(r.birds_listed),
      })),
    },
    demand: {
      funnel: [
        { stage: "Visits", count: num(df.visits) },
        { stage: "Signups", count: num(df.signups) },
        { stage: "Onboarded", count: num(df.onboarded) },
        { stage: "Demands", count: num(df.demands) },
        { stage: "Paid", count: num(df.paid) },
      ],
      expectationDaysToDemand: num(expectations.buyerDaysToFirstDemand),
      peopleByStage: peopleByStage.rows
        .filter((r) => r.account_type === "buyer")
        .map((r) => ({ stage: r.stage, count: num(r.n) })),
      byRegion: regionRows.rows.map((r) => ({
        district: r.district,
        buyers: num(r.buyers),
        birdsListed: num(r.birds_listed),
      })),
    },
    scouts: {
      expectations: {
        sellersPerWeek: num(expectations.scoutSellersPerWeek),
        lotsPerWeek: num(expectations.scoutLotsPerWeek),
        birdsPerWeek: num(expectations.scoutBirdsPerWeek),
      },
      leaderboard: scouts,
      coverage: scouts.reduce((acc, s) => {
        const d = s.district || "—";
        acc[d] = (acc[d] || 0) + 1;
        return acc;
      }, /** @type {Record<string, number>} */ ({})),
    },
    sales: {
      channel: {
        scoutLots: num(ch.scout_lots),
        appLots: num(ch.app_lots),
        scoutBirdsSold: num(ch.scout_birds_sold),
        appBirdsSold: num(ch.app_birds_sold),
      },
      gmvTrend: weeks,
      settlements: settlementRows.rows.map((r) => ({
        side: r.side,
        status: r.status,
        count: num(r.n),
        amountRwf: Math.round(num(r.amount)),
      })),
      cycle: {
        hoursToUpdate: cy.hours_to_update != null ? Math.round(num(cy.hours_to_update) * 10) / 10 : null,
        hoursToBuyerPay:
          cy.hours_to_buyer_pay != null ? Math.round(num(cy.hours_to_buyer_pay) * 10) / 10 : null,
        hoursPayoutLag:
          cy.hours_payout_lag != null ? Math.round(num(cy.hours_payout_lag) * 10) / 10 : null,
      },
    },
  };
}
