/**
 * Live farm ops → business-model actuals bridge.
 *
 * Pulls aggregate KPIs from farm DB tables and returns them in the
 * { month, kpi_key, value, source, date_label } format used by budgetingCore.
 *
 * Mapping rationale:
 *   collections      ← slaughter revenue (RWF) per calendar month
 *   units_sold       ← birds slaughtered per calendar month (scale proxy)
 *   yield_per_active ← revenue / active flocks that month
 *   feed_cost_rwf    ← approved feed spend (bonus KPI, not in base model)
 *   active_flocks    ← distinct flocks with slaughter activity
 */

/**
 * @param {Function} dbQuery  - async (sql, params?) => { rows }
 * @param {{ referenceMonth?: number }} [opts]
 * @returns {Promise<{ rows: Array<{month:number,kpi_key:string,value:number,source:string,date_label:string}>, meta: object }>}
 */
export async function extractLiveDbActuals(dbQuery, opts = {}) {
  const refMonth = Math.max(1, Math.floor(Number(opts.referenceMonth ?? 1)));

  const [slaughterRes, flockRes, feedRes] = await Promise.all([
    dbQuery(`
      SELECT
        date_trunc('month', slaughter_date) AS month_start,
        SUM(COALESCE(birds_slaughtered, 0)::numeric
            * COALESCE(price_per_kg_rwf, 0)::numeric
            * COALESCE(avg_carcass_weight_kg, 0)::numeric)  AS revenue_rwf,
        SUM(COALESCE(birds_slaughtered, 0))                  AS birds_slaughtered,
        COUNT(DISTINCT flock_id)                              AS active_flocks
      FROM flock_slaughter_events
      WHERE submission_status != 'rejected'
        AND slaughter_date >= NOW() - INTERVAL '30 months'
      GROUP BY date_trunc('month', slaughter_date)
      ORDER BY month_start
    `),
    dbQuery(`
      SELECT
        date_trunc('month', created_at) AS month_start,
        COUNT(*)                         AS flocks_placed
      FROM poultry_flocks
      WHERE created_at >= NOW() - INTERVAL '30 months'
      GROUP BY date_trunc('month', created_at)
      ORDER BY month_start
    `),
    dbQuery(`
      SELECT
        date_trunc('month', fed_at) AS month_start,
        SUM(COALESCE(kg_given, 0)::numeric
            * COALESCE(cost_per_kg_rwf, 0)::numeric)  AS feed_cost_rwf
      FROM flock_feed_entries
      WHERE submission_status = 'approved'
        AND fed_at >= NOW() - INTERVAL '30 months'
      GROUP BY date_trunc('month', fed_at)
      ORDER BY month_start
    `),
  ]);

  const allDates = new Set([
    ...slaughterRes.rows.map((r) => String(r.month_start).slice(0, 10)),
    ...flockRes.rows.map((r) => String(r.month_start).slice(0, 10)),
    ...feedRes.rows.map((r) => String(r.month_start).slice(0, 10)),
  ]);
  const sortedDates = [...allDates].sort();

  const slByDate = new Map(slaughterRes.rows.map((r) => [String(r.month_start).slice(0, 10), r]));
  const fkByDate = new Map(flockRes.rows.map((r) => [String(r.month_start).slice(0, 10), r]));
  const fdByDate = new Map(feedRes.rows.map((r) => [String(r.month_start).slice(0, 10), r]));

  const rows = [];
  for (let i = 0; i < sortedDates.length; i++) {
    const ds = sortedDates[i];
    const modelMonth = refMonth + i;
    const dateLabel = new Date(`${ds}T12:00:00Z`).toLocaleDateString("en-GB", {
      month: "short",
      year: "numeric",
    });

    const sl = slByDate.get(ds);
    if (sl) {
      const rev = Number(sl.revenue_rwf) || 0;
      const birds = Number(sl.birds_slaughtered) || 0;
      const flocks = Number(sl.active_flocks) || 1;
      if (rev > 0)
        rows.push({ month: modelMonth, kpi_key: "collections", value: rev, source: "live_db", date_label: dateLabel });
      if (birds > 0)
        rows.push({ month: modelMonth, kpi_key: "units_sold", value: birds, source: "live_db", date_label: dateLabel });
      if (rev > 0)
        rows.push({ month: modelMonth, kpi_key: "yield_per_active", value: rev / flocks, source: "live_db", date_label: dateLabel });
      rows.push({ month: modelMonth, kpi_key: "active_flocks", value: flocks, source: "live_db", date_label: dateLabel });
    }

    const fk = fkByDate.get(ds);
    if (fk && !slByDate.has(ds)) {
      rows.push({
        month: modelMonth,
        kpi_key: "active_flocks",
        value: Number(fk.flocks_placed) || 0,
        source: "live_db",
        date_label: dateLabel,
      });
    }

    const fd = fdByDate.get(ds);
    if (fd) {
      const fc = Number(fd.feed_cost_rwf) || 0;
      if (fc > 0)
        rows.push({ month: modelMonth, kpi_key: "feed_cost_rwf", value: fc, source: "live_db", date_label: dateLabel });
    }
  }

  return {
    rows,
    meta: {
      months_found: sortedDates.length,
      earliest: sortedDates[0] ?? null,
      latest: sortedDates[sortedDates.length - 1] ?? null,
      pulled_at: new Date().toISOString(),
    },
  };
}
