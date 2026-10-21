/**
 * Recruitment analytics — channel activation, weekly targets, scout depth.
 */

import {
  DEFAULT_MARKET_EXPECTATIONS,
  normalizeMarketExpectations,
} from "../marketInsightsPacks.js";

const EXPECTATIONS_KEY = "market_expectations";

async function readJsonSetting(dbQuery, key, fallback) {
  try {
    const r = await dbQuery(`SELECT setting_value FROM app_settings WHERE setting_key = $1`, [key]);
    if (!r.rows.length) return fallback;
    return normalizeMarketExpectations({ ...fallback, ...JSON.parse(r.rows[0].setting_value) });
  } catch {
    return fallback;
  }
}

async function safeQuery(dbQuery, sql, params = []) {
  try {
    return await dbQuery(sql, params);
  } catch (e) {
    console.warn("[marketRecruitment]", e instanceof Error ? e.message : e);
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
 * @param {Function} dbQuery
 */
export async function loadMarketExpectations(dbQuery) {
  return readJsonSetting(dbQuery, EXPECTATIONS_KEY, DEFAULT_MARKET_EXPECTATIONS);
}

/**
 * @param {Function} dbQuery
 * @param {unknown} input
 */
export async function saveMarketExpectations(dbQuery, input) {
  const next = normalizeMarketExpectations(input);
  await dbQuery(
    `INSERT INTO app_settings (setting_key, setting_value)
     VALUES ($1, $2)
     ON CONFLICT (setting_key) DO UPDATE SET setting_value = EXCLUDED.setting_value`,
    [EXPECTATIONS_KEY, JSON.stringify(next)]
  );
  return next;
}

/**
 * @param {{ dbQuery: Function, days?: number }} opts
 */
export async function buildRecruitmentAnalytics(opts) {
  const dbQuery = opts.dbQuery;
  const days = Math.min(Math.max(Number(opts.days) || 7, 7), 90);
  const expectations = await loadMarketExpectations(dbQuery);
  const deadDays = Math.max(1, num(expectations.deadAfterDays, 14));
  const weekScale = days / 7;

  const [
    scorecard,
    channelRows,
    scoutPerf,
    scoutApps,
    inactiveScouts,
    coverageDemand,
    coverageScout,
    stuckSellers,
    unpaidComm,
  ] = await Promise.all([
    safeQuery(
      dbQuery,
      `SELECT
         (SELECT COUNT(*)::int FROM market_reach
           WHERE day >= (CURRENT_DATE - ($1 || ' days')::interval)::date
             AND event_type = 'opened') AS opens,
         (SELECT COUNT(*)::int FROM market_reach
           WHERE day >= (CURRENT_DATE - ($1 || ' days')::interval)::date
             AND event_type = 'join_started') AS join_started,
         (SELECT COUNT(*)::int FROM signup_attempts
           WHERE created_at >= now() - ($1 || ' days')::interval) AS attempts,
         (SELECT COUNT(*)::int FROM signup_attempts
           WHERE created_at >= now() - ($1 || ' days')::interval
             AND outcome = 'succeeded') AS accounts,
         (SELECT COUNT(*)::int FROM signup_attempts
           WHERE created_at >= now() - ($1 || ' days')::interval
             AND outcome = 'failed') AS failed,
         (SELECT COUNT(*)::int FROM people_onboarding
           WHERE account_type = 'farmer'
             AND created_at >= now() - ($1 || ' days')::interval) AS new_sellers,
         (SELECT COUNT(*)::int FROM people_onboarding
           WHERE account_type = 'scout'
             AND created_at >= now() - ($1 || ' days')::interval) AS new_scouts,
         (SELECT COUNT(*)::int FROM people_onboarding
           WHERE account_type = 'buyer'
             AND created_at >= now() - ($1 || ' days')::interval) AS new_buyers,
         (SELECT COUNT(DISTINCT po.user_id)::int
            FROM people_onboarding po
           WHERE po.account_type = 'farmer'
             AND po.created_at >= now() - ($1 || ' days')::interval
             AND EXISTS (
               SELECT 1 FROM pipeline_lots pl
               LEFT JOIN farm_profiles fp ON fp.id = pl.farm_profile_id
                WHERE pl.created_at >= now() - ($1 || ' days')::interval
                  AND (
                    fp.owner_user_id = po.user_id
                    OR pl.created_by = po.user_id
                    OR pl.listed_by = po.user_id
                  )
             )) AS sellers_activated,
         (SELECT COUNT(DISTINCT pl.scouted_by)::int
            FROM pipeline_lots pl
           WHERE pl.scouted_by IS NOT NULL
             AND pl.created_at >= now() - ($1 || ' days')::interval
             AND pl.scouted_by IN (
               SELECT user_id FROM people_onboarding
                WHERE account_type = 'scout'
                  AND created_at >= now() - ($1 || ' days')::interval
             )) AS scouts_activated,
         (SELECT COUNT(DISTINCT po.user_id)::int
            FROM people_onboarding po
            JOIN pipeline_buyers pb ON pb.user_id = po.user_id
            JOIN pipeline_demands d ON d.buyer_id = pb.id
           WHERE po.account_type = 'buyer'
             AND po.created_at >= now() - ($1 || ' days')::interval
             AND d.created_at >= now() - ($1 || ' days')::interval) AS buyers_activated`,
      [days]
    ),
    safeQuery(
      dbQuery,
      `WITH sources AS (
         SELECT DISTINCT lower(COALESCE(NULLIF(trim(source), ''), 'direct')) AS source
           FROM (
             SELECT source FROM market_reach
              WHERE day >= (CURRENT_DATE - ($1 || ' days')::interval)::date
             UNION ALL
             SELECT source FROM signup_attempts
              WHERE created_at >= now() - ($1 || ' days')::interval
             UNION ALL
             SELECT source FROM people_onboarding
              WHERE created_at >= now() - ($1 || ' days')::interval
           ) s
       ),
       reach AS (
         SELECT lower(COALESCE(NULLIF(trim(source), ''), 'direct')) AS source,
                COUNT(*) FILTER (WHERE event_type = 'opened')::int AS opens,
                COUNT(*) FILTER (WHERE event_type = 'join_started')::int AS join_started
           FROM market_reach
          WHERE day >= (CURRENT_DATE - ($1 || ' days')::interval)::date
          GROUP BY 1
       ),
       attempts AS (
         SELECT lower(COALESCE(NULLIF(trim(source), ''), 'direct')) AS source,
                COUNT(*)::int AS attempts,
                COUNT(*) FILTER (WHERE outcome = 'succeeded')::int AS accounts,
                COUNT(*) FILTER (WHERE outcome = 'failed')::int AS failed
           FROM signup_attempts
          WHERE created_at >= now() - ($1 || ' days')::interval
          GROUP BY 1
       ),
       people AS (
         SELECT lower(COALESCE(NULLIF(trim(source), ''), 'direct')) AS source,
                COUNT(*) FILTER (WHERE account_type = 'farmer')::int AS sellers,
                COUNT(*) FILTER (WHERE account_type = 'scout')::int AS scouts,
                COUNT(*) FILTER (WHERE account_type = 'buyer')::int AS buyers
           FROM people_onboarding
          WHERE created_at >= now() - ($1 || ' days')::interval
          GROUP BY 1
       ),
       seller_act AS (
         SELECT lower(COALESCE(NULLIF(trim(po.source), ''), 'direct')) AS source,
                COUNT(DISTINCT po.user_id)::int AS activated,
                AVG(EXTRACT(EPOCH FROM (first_lot.first_at - po.created_at)) / 86400.0)::float AS avg_days
           FROM people_onboarding po
           JOIN LATERAL (
             SELECT MIN(pl.created_at) AS first_at
               FROM pipeline_lots pl
               LEFT JOIN farm_profiles fp ON fp.id = pl.farm_profile_id
              WHERE fp.owner_user_id = po.user_id
                 OR pl.created_by = po.user_id
                 OR pl.listed_by = po.user_id
           ) first_lot ON first_lot.first_at IS NOT NULL
          WHERE po.account_type = 'farmer'
            AND po.created_at >= now() - ($1 || ' days')::interval
          GROUP BY 1
       ),
       seller_dead AS (
         SELECT lower(COALESCE(NULLIF(trim(po.source), ''), 'direct')) AS source,
                COUNT(*)::int AS dead
           FROM people_onboarding po
          WHERE po.account_type = 'farmer'
            AND po.created_at >= now() - ($1 || ' days')::interval
            AND po.created_at < now() - ($2 || ' days')::interval
            AND NOT EXISTS (
              SELECT 1 FROM pipeline_lots pl
              LEFT JOIN farm_profiles fp ON fp.id = pl.farm_profile_id
               WHERE fp.owner_user_id = po.user_id
                  OR pl.created_by = po.user_id
                  OR pl.listed_by = po.user_id
            )
          GROUP BY 1
       ),
       paid AS (
         SELECT lower(COALESCE(NULLIF(trim(po.source), ''), 'direct')) AS source,
                COUNT(DISTINCT po.user_id)::int AS first_paid
           FROM people_onboarding po
           JOIN pipeline_lots pl ON TRUE
           LEFT JOIN farm_profiles fp ON fp.id = pl.farm_profile_id
           JOIN pipeline_matches pm ON pm.lot_id = pl.id
            AND pm.status IN ('committed', 'delivered')
            AND COALESCE(pm.buyer_payment_status, '') = 'paid'
          WHERE po.account_type = 'farmer'
            AND po.created_at >= now() - ($1 || ' days')::interval
            AND (fp.owner_user_id = po.user_id OR pl.created_by = po.user_id OR pl.listed_by = po.user_id)
          GROUP BY 1
       )
       SELECT s.source,
              COALESCE(r.opens, 0) AS opens,
              COALESCE(r.join_started, 0) AS join_started,
              COALESCE(a.attempts, 0) AS attempts,
              COALESCE(a.accounts, 0) AS accounts,
              COALESCE(a.failed, 0) AS failed,
              COALESCE(p.sellers, 0) AS sellers,
              COALESCE(p.scouts, 0) AS scouts,
              COALESCE(p.buyers, 0) AS buyers,
              COALESCE(sa.activated, 0) AS sellers_activated,
              COALESCE(sa.avg_days, NULL) AS avg_days_to_listing,
              COALESCE(sd.dead, 0) AS sellers_dead,
              COALESCE(pd.first_paid, 0) AS first_paid
         FROM sources s
         LEFT JOIN reach r ON r.source = s.source
         LEFT JOIN attempts a ON a.source = s.source
         LEFT JOIN people p ON p.source = s.source
         LEFT JOIN seller_act sa ON sa.source = s.source
         LEFT JOIN seller_dead sd ON sd.source = s.source
         LEFT JOIN paid pd ON pd.source = s.source
        WHERE COALESCE(r.opens, 0) + COALESCE(a.attempts, 0) + COALESCE(p.sellers, 0)
            + COALESCE(p.scouts, 0) + COALESCE(p.buyers, 0) > 0
        ORDER BY COALESCE(r.opens, 0) + COALESCE(a.attempts, 0) DESC`,
      [days, deadDays]
    ),
    safeQuery(
      dbQuery,
      `SELECT u.id::text AS scout_id,
              COALESCE(NULLIF(trim(u.full_name), ''), u.email, 'Scout') AS name,
              COALESCE(NULLIF(trim(po.district), ''), NULLIF(trim(sa.district), ''), '—') AS district,
              COUNT(pl.id)::int AS lots,
              COALESCE(SUM(pl.bird_count), 0)::int AS birds,
              COUNT(DISTINCT pl.contact_phone)::int AS sellers,
              MAX(pl.created_at) AS last_lot_at,
              sa.status AS application_status
         FROM users u
         LEFT JOIN people_onboarding po ON po.user_id = u.id
         LEFT JOIN scout_applications sa ON sa.user_id = u.id
         LEFT JOIN pipeline_lots pl
           ON pl.scouted_by = u.id
          AND pl.created_at >= now() - ($1 || ' days')::interval
        WHERE (u.department_keys ? 'scout')
           OR sa.user_id IS NOT NULL
           OR po.account_type = 'scout'
        GROUP BY u.id, u.full_name, u.email, po.district, sa.district, sa.status
        ORDER BY lots DESC, birds DESC
        LIMIT 50`,
      [days]
    ),
    safeQuery(
      dbQuery,
      `SELECT status, COUNT(*)::int AS n
         FROM scout_applications
        GROUP BY status`,
      []
    ),
    safeQuery(
      dbQuery,
      `SELECT u.id::text AS scout_id,
              COALESCE(NULLIF(trim(u.full_name), ''), u.email, 'Scout') AS name,
              COALESCE(NULLIF(trim(po.district), ''), NULLIF(trim(sa.district), ''), '—') AS district,
              MAX(pl.created_at) AS last_lot_at
         FROM users u
         LEFT JOIN people_onboarding po ON po.user_id = u.id AND po.account_type = 'scout'
         LEFT JOIN scout_applications sa ON sa.user_id = u.id AND sa.status = 'approved'
         LEFT JOIN pipeline_lots pl ON pl.scouted_by = u.id
        WHERE sa.status = 'approved'
           OR (u.department_keys ? 'scout')
           OR po.account_type = 'scout'
        GROUP BY u.id, u.full_name, u.email, po.district, sa.district
       HAVING MAX(pl.created_at) IS NULL
           OR MAX(pl.created_at) < now() - interval '14 days'
        ORDER BY last_lot_at NULLS FIRST
        LIMIT 30`,
      []
    ),
    safeQuery(
      dbQuery,
      `SELECT COALESCE(NULLIF(trim(district_preference), ''), 'Unknown') AS district,
              COUNT(*)::int AS open_demands,
              COALESCE(SUM(birds_needed), 0)::int AS birds_wanted
         FROM pipeline_demands
        WHERE status IN ('open', 'partial')
        GROUP BY 1
        ORDER BY birds_wanted DESC
        LIMIT 30`,
      []
    ),
    safeQuery(
      dbQuery,
      `SELECT COALESCE(NULLIF(trim(district), ''), 'Unknown') AS district,
              COUNT(*)::int AS scout_lots,
              COALESCE(SUM(bird_count), 0)::int AS birds_listed
         FROM pipeline_lots
        WHERE scouted_by IS NOT NULL
          AND created_at >= now() - interval '30 days'
        GROUP BY 1`,
      []
    ),
    safeQuery(
      dbQuery,
      `SELECT COUNT(*)::int AS n
         FROM people_onboarding
        WHERE account_type = 'farmer'
          AND stage IN ('new', 'contacted', 'call_booked')
          AND COALESCE(is_blocked, false) IS NOT TRUE`,
      []
    ),
    safeQuery(
      dbQuery,
      `SELECT COUNT(*)::int AS n,
              COALESCE(SUM(commission_amount_rwf), 0)::float AS amount
         FROM pipeline_matches
        WHERE commission_status = 'accrued'`,
      []
    ),
  ]);

  const unpaidCount = num(unpaidComm.rows[0]?.n);
  const unpaidAmount = Math.round(num(unpaidComm.rows[0]?.amount));

  const sc = scorecard.rows[0] || {};
  const sellerTarget = num(expectations.newSellersPerWeek) * weekScale;
  const scoutTarget = num(expectations.newScoutsPerWeek) * weekScale;
  const buyerTarget = num(expectations.newBuyersPerWeek) * weekScale;

  const scoutLotsTarget = num(expectations.scoutLotsPerWeek) * weekScale;
  const scoutSellersTarget = num(expectations.scoutSellersPerWeek) * weekScale;
  const scoutBirdsTarget = num(expectations.scoutBirdsPerWeek) * weekScale;

  const scouts = scoutPerf.rows.map((r) => {
    const lots = num(r.lots);
    const sellers = num(r.sellers);
    const birds = num(r.birds);
    const lotsPct = pct(lots, scoutLotsTarget);
    return {
      scoutId: r.scout_id,
      name: r.name,
      district: r.district || "—",
      lots,
      birds,
      sellers,
      lastLotAt: r.last_lot_at || null,
      applicationStatus: r.application_status || null,
      expected: {
        lots: scoutLotsTarget,
        sellers: scoutSellersTarget,
        birds: scoutBirdsTarget,
      },
      vsExpected: {
        lotsPct,
        sellersPct: pct(sellers, scoutSellersTarget),
        birdsPct: pct(birds, scoutBirdsTarget),
      },
      tone: lotsPct >= 80 ? "ok" : lotsPct >= 40 ? "warn" : "danger",
    };
  });

  const scoutLotByDistrict = Object.fromEntries(
    coverageScout.rows.map((r) => [r.district, { lots: num(r.scout_lots), birds: num(r.birds_listed) }])
  );
  const coverageGaps = coverageDemand.rows
    .map((r) => {
      const scout = scoutLotByDistrict[r.district] || { lots: 0, birds: 0 };
      return {
        district: r.district,
        openDemands: num(r.open_demands),
        birdsWanted: num(r.birds_wanted),
        scoutLots30d: scout.lots,
        scoutBirds30d: scout.birds,
        gap: scout.lots === 0,
      };
    })
    .filter((r) => r.gap || r.birdsWanted > 0)
    .sort((a, b) => Number(b.gap) - Number(a.gap) || b.birdsWanted - a.birdsWanted);

  const apps = { pending: 0, approved: 0, rejected: 0 };
  for (const row of scoutApps.rows) {
    const st = String(row.status || "");
    if (st in apps) apps[st] = num(row.n);
  }

  return {
    days,
    dataAsOf: new Date().toISOString(),
    expectations,
    scorecard: {
      opens: num(sc.opens),
      joinStarted: num(sc.join_started),
      attempts: num(sc.attempts),
      accounts: num(sc.accounts),
      failed: num(sc.failed),
      failRatePct: pct(sc.failed, sc.attempts),
      newSellers: num(sc.new_sellers),
      newScouts: num(sc.new_scouts),
      newBuyers: num(sc.new_buyers),
      sellersActivated: num(sc.sellers_activated),
      scoutsActivated: num(sc.scouts_activated),
      buyersActivated: num(sc.buyers_activated),
      sellersVsTargetPct: pct(sc.sellers_activated, sellerTarget),
      scoutsVsTargetPct: pct(sc.scouts_activated, scoutTarget),
      buyersVsTargetPct: pct(sc.buyers_activated, buyerTarget),
      targets: {
        sellers: sellerTarget,
        scouts: scoutTarget,
        buyers: buyerTarget,
      },
      stuckSellers: num(stuckSellers.rows[0]?.n),
    },
    channels: channelRows.rows.map((r) => {
      const opens = num(r.opens);
      const accounts = num(r.accounts);
      const sellers = num(r.sellers);
      const activated = num(r.sellers_activated);
      const dead = num(r.sellers_dead);
      return {
        source: r.source,
        opens,
        joinStarted: num(r.join_started),
        attempts: num(r.attempts),
        accounts,
        failed: num(r.failed),
        sellers,
        scouts: num(r.scouts),
        buyers: num(r.buyers),
        sellersActivated: activated,
        sellersDead: dead,
        firstPaid: num(r.first_paid),
        openToAccountPct: pct(accounts, opens),
        accountToActivatedPct: pct(activated, sellers || accounts),
        activatedToPaidPct: pct(r.first_paid, activated),
        deadRatePct: pct(dead, sellers),
        avgDaysToListing:
          r.avg_days_to_listing != null ? Math.round(num(r.avg_days_to_listing) * 10) / 10 : null,
      };
    }),
    scouts: {
      leaderboard: scouts,
      applications: apps,
      inactive: inactiveScouts.rows.map((r) => ({
        scoutId: r.scout_id,
        name: r.name,
        district: r.district || "—",
        lastLotAt: r.last_lot_at || null,
      })),
      coverageGaps: coverageGaps.slice(0, 15),
      unpaidCommissions: { count: unpaidCount, amountRwf: unpaidAmount },
    },
  };
}
