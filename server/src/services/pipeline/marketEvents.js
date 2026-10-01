/**
 * Privacy-safe marketplace analytics — no buyer PII.
 */

const EVENT_TYPES = new Set([
  "profile_view",
  "listing_view",
  "request_started",
  "request_submitted",
  "reservation",
]);

export function normalizeMarketEventType(type) {
  const t = String(type || "").trim();
  return EVENT_TYPES.has(t) ? t : null;
}

/**
 * @param {{ eventType?: string, farmProfileId?: string|null, lotId?: string|null, publicRef?: string|null }} input
 */
export function validateMarketEvent(input) {
  const eventType = normalizeMarketEventType(input.eventType ?? input.type);
  if (!eventType) return { ok: false, error: "Unknown event type." };
  const farmProfileId = input.farmProfileId ? String(input.farmProfileId) : null;
  const lotId = input.lotId ? String(input.lotId) : null;
  const publicRef = input.publicRef ? String(input.publicRef).trim().toUpperCase().slice(0, 32) : null;
  if (!farmProfileId && !lotId && !publicRef) {
    return { ok: false, error: "Event needs a farm, lot, or listing code." };
  }
  return { ok: true, eventType, farmProfileId, lotId, publicRef };
}

export async function recordMarketEvent(dbQuery, input) {
  const v = validateMarketEvent(input);
  if (!v.ok) return v;
  try {
    await dbQuery(
      `INSERT INTO market_events (event_type, farm_profile_id, lot_id, public_ref)
       VALUES ($1, $2::uuid, $3::uuid, $4)`,
      [v.eventType, v.farmProfileId, v.lotId, v.publicRef]
    );
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Could not record event." };
  }
}

export async function listingAnalytics(dbQuery, { farmProfileId, lotIds = [] }) {
  const ids = Array.isArray(lotIds) ? lotIds.filter(Boolean) : [];
  try {
    const r = await dbQuery(
      `SELECT event_type AS "eventType",
              lot_id::text AS "lotId",
              COUNT(*)::int AS n
         FROM market_events
        WHERE ($1::uuid IS NULL OR farm_profile_id = $1::uuid)
          AND ($2::int = 0 OR lot_id = ANY($3::uuid[]))
          AND created_at > now() - interval '90 days'
        GROUP BY event_type, lot_id`,
      [farmProfileId || null, ids.length, ids]
    );
    const totals = {
      profileViews: 0,
      listingViews: 0,
      requestStarted: 0,
      requestSubmitted: 0,
      reservations: 0,
    };
    const byLot = {};
    for (const row of r.rows) {
      const n = Number(row.n || 0);
      if (row.eventType === "profile_view") totals.profileViews += n;
      if (row.eventType === "listing_view") totals.listingViews += n;
      if (row.eventType === "request_started") totals.requestStarted += n;
      if (row.eventType === "request_submitted") totals.requestSubmitted += n;
      if (row.eventType === "reservation") totals.reservations += n;
      if (row.lotId) {
        if (!byLot[row.lotId]) {
          byLot[row.lotId] = { listingViews: 0, requestStarted: 0, requestSubmitted: 0, reservations: 0 };
        }
        if (row.eventType === "listing_view") byLot[row.lotId].listingViews += n;
        if (row.eventType === "request_started") byLot[row.lotId].requestStarted += n;
        if (row.eventType === "request_submitted") byLot[row.lotId].requestSubmitted += n;
        if (row.eventType === "reservation") byLot[row.lotId].reservations += n;
      }
    }
    return { totals, byLot };
  } catch {
    return { totals: { profileViews: 0, listingViews: 0, requestStarted: 0, requestSubmitted: 0, reservations: 0 }, byLot: {} };
  }
}
