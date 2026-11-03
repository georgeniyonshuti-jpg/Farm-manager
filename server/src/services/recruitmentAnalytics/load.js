/**
 * Read person facts and the extra tables the snapshot needs.
 * Missing tables return an empty extra, not a made-up number.
 */

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { districtNamesFromLocations, normaliseDistrict } from "./districts.js";
import { normaliseChannel } from "./channels.js";
import { queryFailure } from "./command.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
let districtNames = null;

function knownDistricts() {
  if (districtNames) return districtNames;
  try {
    const raw = readFileSync(join(__dirname, "../../data/rwandaLocations.json"), "utf8");
    districtNames = districtNamesFromLocations(JSON.parse(raw));
  } catch {
    districtNames = new Set();
  }
  return districtNames;
}

function iso(value) {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

export function rowToFact(row, districts = knownDistricts()) {
  const rawStage = row.raw_stage || null;
  const activatedAt = iso(row.activated_at);
  return {
    personId: String(row.person_id),
    role: row.role,
    createdAt: iso(row.created_at),
    firstTouchChannel: row.first_touch_channel || null,
    selfReportedSource: row.self_reported_source || null,
    linkOpenAt: iso(row.link_open_at),
    signupStartedAt: iso(row.signup_started_at),
    applicationSubmittedAt: iso(row.application_submitted_at),
    contactedAt: iso(row.contacted_at),
    kycVerifiedAt: iso(row.kyc_verified_at),
    activatedAt,
    liveUnverifiedAt: iso(row.live_unverified_at),
    productiveAt: iso(row.productive_at),
    lastActivityAt: iso(row.last_activity_at) || iso(row.created_at),
    rawStage,
    stageOverride: (rawStage === "unreachable" || rawStage === "not_a_fit") && !activatedAt ? rawStage : null,
    district: normaliseDistrict(row.district, districts),
    isInternal: row.is_internal === true,
    isSynthetic: row.is_synthetic === true,
    assisted: row.assisted === true,
    dqFlags: row.dq_flags || [],
    referredByScoutId: row.referred_by_scout_id ? String(row.referred_by_scout_id) : null,
    approvedAt: iso(row.approved_at),
    phone: row.phone_e164 || null,
    label: row.display_name || "Person",
    lotEvents: [],
    unpaidRwf: 0,
  };
}

async function optionalModule(dbQuery, sql, params = []) {
  try {
    const result = await dbQuery(sql, params);
    return { rows: result.rows || [], failed: false };
  } catch (err) {
    if (queryFailure(err) === "missing") return { rows: [], failed: false };
    return { rows: [], failed: true };
  }
}

async function optional(dbQuery, sql, params = []) {
  const result = await optionalModule(dbQuery, sql, params);
  return result.rows;
}

export async function loadRecruitmentBundle(dbQuery, { from, to } = {}) {
  let factRows;
  try {
    const result = await dbQuery(`SELECT * FROM analytics.person_facts`);
    factRows = result.rows || [];
  } catch (err) {
    const code = String(err?.code || "");
    if (code === "42P01" || code === "3F000") {
      const error = new Error("Recruitment analytics view is not installed yet. Apply migrations 087 and 088, then reload.");
      error.code = "migration_required";
      throw error;
    }
    throw err;
  }
  const people = factRows.map((row) => rowToFact(row));
  const byId = new Map(people.map((p) => [p.personId, p]));

  const lots = await optional(
    dbQuery,
    `SELECT scouted_by::text AS scout_id,
            bird_count,
            verification_status,
            COALESCE(verified_at, created_at) AS at
       FROM pipeline_lots
      WHERE scouted_by IS NOT NULL`
  );
  for (const lot of lots) {
    const scout = byId.get(String(lot.scout_id));
    if (!scout) continue;
    scout.lotEvents.push({
      at: iso(lot.at),
      verified: lot.verification_status === "verified",
      birds: Number(lot.bird_count || 0),
    });
    if (lot.verification_status === "verified") {
      const at = iso(lot.at);
      if (at && (!scout.lastVerifiedLotAt || at > scout.lastVerifiedLotAt)) scout.lastVerifiedLotAt = at;
    }
  }

  const unpaid = await optional(
    dbQuery,
    `SELECT l.scouted_by::text AS scout_id,
            COALESCE(SUM(m.commission_amount_rwf), 0)::float AS amount
       FROM pipeline_matches m
       JOIN pipeline_lots l ON l.id = m.lot_id
      WHERE m.commission_status = 'accrued'
        AND l.scouted_by IS NOT NULL
      GROUP BY 1`
  );
  for (const row of unpaid) {
    const scout = byId.get(String(row.scout_id));
    if (scout) scout.unpaidRwf = Number(row.amount || 0);
  }

  const opens = await optionalModule(
    dbQuery,
    `SELECT lower(source) AS source, COUNT(*)::int AS n
       FROM market_reach
      WHERE event_type = 'opened'
        AND ($1::date IS NULL OR day >= $1::date)
        AND ($2::date IS NULL OR day <= $2::date)
      GROUP BY 1`,
    [from || null, to || null]
  );
  const opensByChannel = {};
  if (!opens.failed) {
    for (const row of opens.rows) {
      const channel = normaliseChannel(row.source);
      opensByChannel[channel] = (opensByChannel[channel] || 0) + Number(row.n || 0);
    }
  }

  const spendMod = await optionalModule(
    dbQuery,
    `SELECT date::text AS date, channel, amount_rwf AS "amountRwf" FROM ad_spend`
  );
  const targetsMod = await optionalModule(
    dbQuery,
    `SELECT id::text AS id, role, metric, scope, value::float AS value, effective_from::text AS "effectiveFrom"
       FROM recruitment_targets`
  );
  const tierMod = await optionalModule(
    dbQuery,
    `SELECT id::text AS id, tier FROM recruitment_targets`
  );
  const tierById = new Map(tierMod.rows.map((row) => [String(row.id), row.tier || "t1"]));
  const targets = targetsMod.rows.map((row) => ({
    ...row,
    value: Number(row.value || 0),
    tier: tierById.get(String(row.id)) || "t1",
  }));
  const supply = await loadSupplyDemand(dbQuery);
  const stated = await loadStated(dbQuery);
  const duplicatePhones = people.filter((p) => (p.dqFlags || []).includes("duplicate_phone")).length;
  const links = await optional(dbQuery, `SELECT COUNT(*)::int AS n FROM tracked_links`);
  return {
    people,
    opensByChannel,
    spend: spendMod.rows.map((row) => ({ ...row, amountRwf: Number(row.amountRwf || 0) })),
    targets,
    supplyDemand: supply,
    stated,
    duplicatePhones,
    trackedLinksThisWeek: Number(links[0]?.n || 0) > 0,
    freshnessMinutes: 0,
    modules: {
      opens: opens.failed ? "unavailable" : "ok",
      spend: spendMod.failed ? "unavailable" : "ok",
      targets: targetsMod.failed ? "unavailable" : "ok",
      supply: supply.reason === "Unavailable" ? "unavailable" : "ok",
      buyers: "ok",
    },
  };
}

async function loadStated(dbQuery) {
  try {
    const result = await dbQuery(
      `SELECT want,
              district,
              flock_size AS "flockSize",
              ready_in_weeks AS "readyInWeeks",
              quantity_min AS "quantityMin",
              can_slaughter AS "canSlaughter",
              can_deliver AS "canDeliver",
              buyer_for AS "buyerFor",
              bird_form AS "birdForm",
              will_visit AS "willVisit",
              farms_known AS "farmsKnown"
         FROM recruitment_contacts`
    );
    const districts = knownDistricts();
    return {
      available: true,
      rows: (result.rows || []).map((row) => ({
        ...row,
        district: normaliseDistrict(row.district, districts),
      })),
    };
  } catch (err) {
    const code = String(err?.code || "");
    if (code === "42703" || code === "42P01") {
      return {
        available: false,
        reason: "Interview facts are not installed yet. Apply migration 089, then reload.",
      };
    }
    return { available: false, reason: "Unavailable" };
  }
}

async function loadSupplyDemand(dbQuery) {
  const live = await optionalModule(
    dbQuery,
    `SELECT COALESCE(SUM(bird_count), 0)::int AS birds
       FROM pipeline_lots
      WHERE status IN ('open', 'partial')
        AND verification_status = 'verified'
        AND ready_from <= CURRENT_DATE
        AND ready_to >= CURRENT_DATE`
  );
  const demand = await optionalModule(
    dbQuery,
    `SELECT COALESCE(SUM(birds_needed), 0)::int AS birds
       FROM pipeline_demands
      WHERE status = 'open'`
  );
  if (live.failed || demand.failed) {
    return { available: false, reason: "Unavailable" };
  }
  if (!live.rows.length && !demand.rows.length) {
    return { available: false, reason: "Live listings and buyer requests could not be read." };
  }
  const byDistrictLots = await optionalModule(
    dbQuery,
    `SELECT COALESCE(NULLIF(btrim(district), ''), 'District unknown') AS district,
            COALESCE(SUM(bird_count), 0)::int AS supply
       FROM pipeline_lots
      WHERE status IN ('open', 'partial')
        AND verification_status = 'verified'
        AND ready_from <= CURRENT_DATE
        AND ready_to >= CURRENT_DATE
      GROUP BY 1`
  );
  const byDistrictDemand = await optionalModule(
    dbQuery,
    `SELECT COALESCE(NULLIF(btrim(district_preference), ''), 'District unknown') AS district,
            COALESCE(SUM(birds_needed), 0)::int AS demand
       FROM pipeline_demands
      WHERE status = 'open'
      GROUP BY 1`
  );
  if (byDistrictLots.failed || byDistrictDemand.failed) {
    return { available: false, reason: "Unavailable" };
  }
  const districts = new Map();
  for (const row of byDistrictLots.rows) districts.set(row.district, { district: row.district, supply: Number(row.supply), demand: 0 });
  for (const row of byDistrictDemand.rows) {
    const existing = districts.get(row.district) || { district: row.district, supply: 0, demand: 0 };
    existing.demand = Number(row.demand);
    districts.set(row.district, existing);
  }
  const flocks = await optional(
    dbQuery,
    `SELECT COUNT(*)::int AS n,
            COUNT(*) FILTER (WHERE placement_date IS NOT NULL)::int AS dated
       FROM poultry_flocks`
  );
  const dated = Number(flocks[0]?.dated || 0);
  return {
    available: true,
    liveBirds: Number(live.rows[0]?.birds || 0),
    demandBirds: Number(demand.rows[0]?.birds || 0),
    demandIsProxy: false,
    byDistrict: [...districts.values()],
    flocksSupportForecast: false,
    forecast: null,
    reason: dated
      ? `${dated} flocks have a placement date. A forecast stays off until a market-age cycle is confirmed.`
      : "No flock placement dates are available, so there is no supply forecast.",
  };
}
