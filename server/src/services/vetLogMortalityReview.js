/**
 * Mortality review since last approved vet log — corrected mortality drives live bird count.
 */

/**
 * @param {import('pg').PoolClient | { query: Function }} client
 * @param {string} flockId
 */
export async function queryMortalityToDate(client, flockId) {
  const r = await client.query(
    `SELECT COALESCE(SUM(count), 0)::int AS total
       FROM flock_mortality_events
      WHERE flock_id = $1::uuid
        AND submission_status = 'approved'
        AND affects_live_count IS NOT FALSE`,
    [flockId]
  );
  return Number(r.rows[0]?.total) || 0;
}

/**
 * @param {import('pg').PoolClient | { query: Function }} client
 * @param {string} flockId
 * @param {string} [beforeDate] ISO date string (visit log date)
 */
export async function findPreviousApprovedVetLog(client, flockId, beforeDate) {
  const params = [flockId];
  let dateFilter = "";
  if (beforeDate) {
    params.push(String(beforeDate).slice(0, 10));
    dateFilter = ` AND (v.log_date < $2::date OR (v.log_date = $2::date AND v.created_at < now()))`;
  }
  const r = await client.query(
    `SELECT v.id::text AS id,
            v.log_date::text AS "logDate",
            v.created_at AS "createdAt"
       FROM farm_vet_logs v
      WHERE v.flock_id = $1::uuid
        AND v.submission_status = 'approved'
        ${dateFilter}
      ORDER BY v.log_date DESC, v.created_at DESC
      LIMIT 1`,
    params
  );
  return r.rows[0] ?? null;
}

/**
 * @param {import('pg').PoolClient | { query: Function }} client
 * @param {string} flockId
 * @param {Date|null} sinceAt
 */
export async function fetchMortalityEventsSince(client, flockId, sinceAt) {
  const params = [flockId];
  let sinceSql = "";
  if (sinceAt) {
    params.push(sinceAt.toISOString());
    sinceSql = ` AND m.at > $2::timestamptz`;
  }
  const r = await client.query(
    `SELECT m.id::text AS id,
            m.at,
            m.count,
            m.submission_status AS "submissionStatus",
            m.affects_live_count AS "affectsLiveCount",
            m.source,
            m.notes,
            u.full_name AS "laborerName"
       FROM flock_mortality_events m
       LEFT JOIN users u ON u.id = m.laborer_id
      WHERE m.flock_id = $1::uuid
        AND m.submission_status = 'approved'
        AND m.affects_live_count IS NOT FALSE
        ${sinceSql}
      ORDER BY m.at ASC`,
    params
  );
  return r.rows.map((row) => ({
    id: String(row.id),
    at: row.at instanceof Date ? row.at.toISOString() : String(row.at),
    count: Number(row.count) || 0,
    submissionStatus: row.submissionStatus ?? "approved",
    affectsLiveCount: row.affectsLiveCount !== false,
    source: row.source ?? null,
    notes: row.notes ?? null,
    laborerName: row.laborerName ?? null,
  }));
}

/**
 * @param {object} opts
 * @param {import('pg').PoolClient | { query: Function }} opts.client
 * @param {string} opts.flockId
 * @param {string} [opts.beforeDate]
 * @param {number} opts.initialCount
 * @param {number} opts.slaughterToDate
 * @param {number} opts.mortalityToDate
 */
export async function buildMortalityReviewContext({
  client,
  flockId,
  beforeDate,
  initialCount,
  slaughterToDate,
  mortalityToDate,
}) {
  const previous = await findPreviousApprovedVetLog(client, flockId, beforeDate);
  const sinceAt = previous?.createdAt
    ? previous.createdAt instanceof Date
      ? previous.createdAt
      : new Date(previous.createdAt)
    : null;

  const events = await fetchMortalityEventsSince(client, flockId, sinceAt);
  const loggedSinceLastVisit = events.reduce((s, e) => s + e.count, 0);
  const initial = Math.floor(Number(initialCount) || 0);
  const slaughter = Math.floor(Number(slaughterToDate) || 0);
  const mortality = Math.floor(Number(mortalityToDate) || 0);
  const computedBirdsLive = Math.max(0, initial - mortality - slaughter);

  return {
    previousVetLogId: previous?.id ?? null,
    previousVetLogDate: previous?.logDate ?? null,
    sinceAt: sinceAt ? sinceAt.toISOString() : null,
    events,
    loggedSinceLastVisit,
    initialCount: initial,
    slaughterToDate: slaughter,
    mortalityToDate: mortality,
    computedBirdsLive,
  };
}

/**
 * @param {object} mortalityReview
 * @param {number} mortalityReview.loggedSinceLastVisit
 * @param {{ eventId: string, count: number }[]} [mortalityReview.mortalityAdjustments]
 * @param {number} [mortalityReview.confirmedSinceLastVisit]
 * @param {boolean} [hasEventsInWindow]
 */
export function validateMortalityReview(mortalityReview, hasEventsInWindow = true) {
  const loggedSinceLastVisit = Math.floor(Number(mortalityReview?.loggedSinceLastVisit));
  if (!Number.isFinite(loggedSinceLastVisit) || loggedSinceLastVisit < 0) {
    throw new Error("loggedSinceLastVisit must be a non-negative integer.");
  }
  const adjustments = mortalityReview?.mortalityAdjustments ?? [];
  for (const adj of adjustments) {
    const count = Math.floor(Number(adj.count));
    if (!adj.eventId || !Number.isFinite(count) || count < 1) {
      throw new Error("Each mortality adjustment requires eventId and count ≥ 1.");
    }
  }
  let confirmedSinceLastVisit = loggedSinceLastVisit;
  if (!hasEventsInWindow) {
    const raw = mortalityReview?.confirmedSinceLastVisit;
    if (raw == null) {
      throw new Error("confirmedSinceLastVisit is required when no mortality events exist in the review window.");
    }
    confirmedSinceLastVisit = Math.floor(Number(raw));
    if (!Number.isFinite(confirmedSinceLastVisit) || confirmedSinceLastVisit < 0) {
      throw new Error("confirmedSinceLastVisit must be a non-negative integer.");
    }
  }
  return { loggedSinceLastVisit, adjustments, confirmedSinceLastVisit };
}

/**
 * Apply vet mortality review — updates events, clears verified override, stores computed live snapshot.
 * @param {object} opts
 * @param {import('pg').PoolClient} opts.client
 * @param {string} opts.flockId
 * @param {string} opts.vetLogId
 * @param {string} opts.authorUserId
 * @param {string} opts.logDate
 * @param {object} opts.mortalityReview
 * @param {number} opts.initialCount
 * @param {number} opts.slaughterToDate
 * @returns {Promise<{ syncedMortalityIds: string[], confirmedLiveCount: number, mortalityConfirmedSinceLastVisit: number, mortalityToDate: number }>}
 */
export async function applyMortalityReview({
  client,
  flockId,
  vetLogId,
  authorUserId,
  logDate,
  mortalityReview,
  initialCount,
  slaughterToDate,
}) {
  const previous = await findPreviousApprovedVetLog(client, flockId, logDate);
  const sinceAt = previous?.createdAt
    ? previous.createdAt instanceof Date
      ? previous.createdAt
      : new Date(previous.createdAt)
    : null;
  const eventsInWindow = await fetchMortalityEventsSince(client, flockId, sinceAt);
  const loggedSinceLastVisit = eventsInWindow.reduce((s, e) => s + e.count, 0);

  const { adjustments, confirmedSinceLastVisit: clientConfirmedSince } = validateMortalityReview(
    mortalityReview,
    eventsInWindow.length > 0
  );

  const syncedMortalityIds = [];
  let mortalityConfirmedSinceLastVisit = loggedSinceLastVisit;

  if (eventsInWindow.length > 0) {
    const eventMap = new Map(eventsInWindow.map((e) => [e.id, e]));
    for (const adj of adjustments) {
      const eventId = String(adj.eventId);
      const newCount = Math.floor(Number(adj.count));
      const existing = eventMap.get(eventId);
      if (!existing) {
        throw new Error(`Mortality event ${eventId} not found in review window.`);
      }
      if (existing.count !== newCount) {
        await client.query(
          `UPDATE flock_mortality_events
              SET count = $2,
                  notes = COALESCE(notes, '') || $3
            WHERE id = $1::uuid AND flock_id = $4::uuid`,
          [
            eventId,
            newCount,
            `\n[Vet log ${vetLogId.slice(0, 8)}] Count corrected ${existing.count} → ${newCount}.`,
            flockId,
          ]
        );
        mortalityConfirmedSinceLastVisit += newCount - existing.count;
        syncedMortalityIds.push(eventId);
      }
    }
    // Re-sum in case adjustments weren't sent for unchanged rows
    if (adjustments.length > 0) {
      const refreshed = await fetchMortalityEventsSince(client, flockId, sinceAt);
      mortalityConfirmedSinceLastVisit = refreshed.reduce((s, e) => s + e.count, 0);
    }
  } else if (clientConfirmedSince > 0) {
    const at = `${logDate}T12:00:00.000Z`;
    const ins = await client.query(
      `INSERT INTO flock_mortality_events
         (flock_id, laborer_id, at, count, is_emergency, photos, notes, source, submission_status, affects_live_count)
       VALUES ($1::uuid, $2::uuid, $3::timestamptz, $4, false, '[]'::jsonb, $5, 'vet_log_reconciliation', 'approved', true)
       RETURNING id::text AS id`,
      [
        flockId,
        authorUserId,
        at,
        clientConfirmedSince,
        `Mortality reconciled at vet log ${vetLogId.slice(0, 8)} on ${logDate}.`,
      ]
    );
    const newId = ins.rows[0]?.id;
    if (!newId) throw new Error("Failed to create vet reconciliation mortality event.");
    syncedMortalityIds.push(String(newId));
    mortalityConfirmedSinceLastVisit = clientConfirmedSince;
  } else {
    mortalityConfirmedSinceLastVisit = 0;
  }

  const mortalityToDate = await queryMortalityToDate(client, flockId);
  const initial = Math.floor(Number(initialCount) || 0);
  const slaughter = Math.floor(Number(slaughterToDate) || 0);
  const confirmedLiveCount = Math.max(0, initial - mortalityToDate - slaughter);

  await client.query(
    `UPDATE poultry_flocks
        SET verified_live_count = NULL,
            verified_live_note = NULL,
            verified_live_at = NULL,
            updated_at = now()
      WHERE id = $1::uuid`,
    [flockId]
  );

  await client.query(
    `UPDATE farm_vet_logs
        SET previous_vet_log_id = $2::uuid,
            mortality_logged_since_last_visit = $3,
            mortality_confirmed_since_last_visit = $4,
            confirmed_live_count = $5,
            updated_at = now()
      WHERE id = $1::uuid`,
    [
      vetLogId,
      previous?.id ?? null,
      loggedSinceLastVisit,
      mortalityConfirmedSinceLastVisit,
      confirmedLiveCount,
    ]
  );

  return {
    syncedMortalityIds,
    confirmedLiveCount,
    mortalityConfirmedSinceLastVisit,
    mortalityToDate,
  };
}

/**
 * @param {(entityType: string, entityId: string) => void} clevaSync
 * @param {string} flockId
 * @param {string[]} mortalityEventIds
 */
export function syncMortalityReviewToErp(clevaSync, flockId, mortalityEventIds) {
  clevaSync("flock", flockId);
  for (const id of mortalityEventIds) {
    clevaSync("mortality_log", id);
  }
}
