/**
 * Mortality review since last approved vet log — vet-confirmed live count is source of truth.
 */

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
 * @param {number|null} [opts.verifiedLiveCount]
 */
export async function buildMortalityReviewContext({
  client,
  flockId,
  beforeDate,
  initialCount,
  slaughterToDate,
  mortalityToDate,
  verifiedLiveCount,
}) {
  const previous = await findPreviousApprovedVetLog(client, flockId, beforeDate);
  const sinceAt = previous?.createdAt
    ? previous.createdAt instanceof Date
      ? previous.createdAt
      : new Date(previous.createdAt)
    : null;

  const events = await fetchMortalityEventsSince(client, flockId, sinceAt);
  const loggedSinceLastVisit = events.reduce((s, e) => s + e.count, 0);
  const computedBirdsLive = Math.max(
    0,
    Math.floor(Number(initialCount) || 0) - Math.floor(Number(mortalityToDate) || 0) - Math.floor(Number(slaughterToDate) || 0)
  );
  const birdsLiveEstimate =
    verifiedLiveCount != null && Number.isFinite(Number(verifiedLiveCount))
      ? Math.max(0, Math.floor(Number(verifiedLiveCount)))
      : computedBirdsLive;

  return {
    previousVetLogId: previous?.id ?? null,
    previousVetLogDate: previous?.logDate ?? null,
    sinceAt: sinceAt ? sinceAt.toISOString() : null,
    events,
    loggedSinceLastVisit,
    initialCount: Math.floor(Number(initialCount) || 0),
    slaughterToDate: Math.floor(Number(slaughterToDate) || 0),
    mortalityToDate: Math.floor(Number(mortalityToDate) || 0),
    computedBirdsLive,
    birdsLiveEstimate,
    verifiedLiveCount:
      verifiedLiveCount != null && Number.isFinite(Number(verifiedLiveCount))
        ? Math.floor(Number(verifiedLiveCount))
        : null,
    suggestedLiveCount: computedBirdsLive,
  };
}

/**
 * @param {object} mortalityReview
 * @param {number} mortalityReview.confirmedLiveCount
 * @param {{ eventId: string, count: number }[]} [mortalityReview.mortalityAdjustments]
 */
export function validateMortalityReview(mortalityReview) {
  const confirmedLiveCount = Math.floor(Number(mortalityReview?.confirmedLiveCount));
  if (!Number.isFinite(confirmedLiveCount) || confirmedLiveCount < 0) {
    throw new Error("confirmedLiveCount must be a non-negative integer.");
  }
  const adjustments = mortalityReview?.mortalityAdjustments ?? [];
  for (const adj of adjustments) {
    const count = Math.floor(Number(adj.count));
    if (!adj.eventId || !Number.isFinite(count) || count < 1) {
      throw new Error("Each mortality adjustment requires eventId and count ≥ 1.");
    }
  }
  return { confirmedLiveCount, adjustments };
}

/**
 * Apply vet mortality review — updates events, flock verified count, vet log snapshot.
 * @param {object} opts
 * @param {import('pg').PoolClient} opts.client
 * @param {string} opts.flockId
 * @param {string} opts.vetLogId
 * @param {string} opts.authorUserId
 * @param {string} opts.logDate
 * @param {object} opts.mortalityReview
 * @param {number} opts.loggedSinceLastVisit baseline before adjustments
 * @returns {Promise<{ adjustedEventIds: string[], confirmedLiveCount: number, mortalityConfirmedSinceLastVisit: number }>}
 */
export async function applyMortalityReview({
  client,
  flockId,
  vetLogId,
  authorUserId,
  logDate,
  mortalityReview,
  loggedSinceLastVisit,
}) {
  const { confirmedLiveCount, adjustments } = validateMortalityReview(mortalityReview);
  const previous = await findPreviousApprovedVetLog(client, flockId, logDate);

  const adjustedEventIds = [];
  let confirmedSinceLast = loggedSinceLastVisit;

  if (adjustments.length > 0) {
    const sinceAt = previous?.createdAt
      ? previous.createdAt instanceof Date
        ? previous.createdAt
        : new Date(previous.createdAt)
      : null;
    const events = await fetchMortalityEventsSince(client, flockId, sinceAt);
    const eventMap = new Map(events.map((e) => [e.id, e]));

    for (const adj of adjustments) {
      const eventId = String(adj.eventId);
      const newCount = Math.floor(Number(adj.count));
      const existing = eventMap.get(eventId);
      if (!existing) {
        throw new Error(`Mortality event ${eventId} not found in review window.`);
      }
      if (existing.count === newCount) continue;

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
      confirmedSinceLast += newCount - existing.count;
      adjustedEventIds.push(eventId);
    }
  } else {
    confirmedSinceLast = loggedSinceLastVisit;
  }

  const note = `Vet log ${logDate}: confirmed ${confirmedLiveCount} live birds (${confirmedSinceLast} deaths since last visit).`;
  await client.query(
    `UPDATE poultry_flocks
        SET verified_live_count = $2,
            verified_live_note = $3,
            verified_live_at = now(),
            updated_at = now()
      WHERE id = $1::uuid`,
    [flockId, confirmedLiveCount, note.slice(0, 2000)]
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
      confirmedSinceLast,
      confirmedLiveCount,
    ]
  );

  void authorUserId;
  return {
    adjustedEventIds,
    confirmedLiveCount,
    mortalityConfirmedSinceLastVisit: confirmedSinceLast,
  };
}

/**
 * @param {(entityType: string, entityId: string) => void} clevaSync
 * @param {string} flockId
 * @param {string[]} adjustedEventIds
 */
export function syncMortalityReviewToErp(clevaSync, flockId, adjustedEventIds) {
  clevaSync("flock", flockId);
  for (const id of adjustedEventIds) {
    clevaSync("mortality_log", id);
  }
}
