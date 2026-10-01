/**
 * Super-admin company export and hard delete orchestration.
 */

export const DEFAULT_COMPANY_ID = "00000000-0000-4000-8000-000000000001";

export function assertCompanyDeletable(companyId, confirmSlug, companySlug) {
  if (String(companyId) === DEFAULT_COMPANY_ID) {
    throw new Error("The default company cannot be deleted.");
  }
  if (!confirmSlug || String(confirmSlug).trim() !== String(companySlug)) {
    throw new Error("Company slug confirmation does not match.");
  }
}

export async function exportCompanyBundle(dbQuery, companyId) {
  const [company, users, flocks, inventory, feedEntries, vetLogs] = await Promise.all([
    dbQuery(
      `SELECT id::text, name, slug, plan, trial_ends_at, is_active, payment_overdue, created_at
         FROM companies WHERE id = $1::uuid`,
      [companyId]
    ),
    dbQuery(
      `SELECT id::text, email, full_name, role, business_unit_access, created_at
         FROM users WHERE company_id = $1::uuid`,
      [companyId]
    ),
    dbQuery(
      `SELECT f.id::text, f.code, bn.name AS barn_name, f.breed_code, f.status,
              f.placement_date, f.initial_count, f.created_at
         FROM poultry_flocks f
         LEFT JOIN poultry_barn_names bn ON bn.id = f.barn_name_id
        WHERE f.company_id = $1::uuid`,
      [companyId]
    ),
    dbQuery(
      `SELECT id::text, transaction_type, recorded_at, quantity_kg, delta_kg, feed_type,
              flock_id::text AS flock_id, supplier_name, reference
         FROM farm_inventory_transactions WHERE company_id = $1::uuid
         ORDER BY recorded_at DESC`,
      [companyId]
    ),
    dbQuery(
      `SELECT e.id::text, e.flock_id::text, e.recorded_at, e.feed_kg, e.feed_type, e.submission_status
         FROM flock_feed_entries e
         JOIN poultry_flocks f ON f.id = e.flock_id
        WHERE f.company_id = $1::uuid
        ORDER BY e.recorded_at DESC
        LIMIT 5000`,
      [companyId]
    ),
    dbQuery(
      `SELECT v.id::text, v.flock_id::text, v.log_date, v.submission_status
         FROM farm_vet_logs v
         JOIN poultry_flocks f ON f.id = v.flock_id
        WHERE f.company_id = $1::uuid
        ORDER BY v.log_date DESC
        LIMIT 2000`,
      [companyId]
    ),
  ]);

  return {
    exportedAt: new Date().toISOString(),
    company: company.rows[0] ?? null,
    users: users.rows,
    flocks: flocks.rows,
    inventoryTransactions: inventory.rows,
    feedEntries: feedEntries.rows,
    vetLogs: vetLogs.rows,
  };
}

export function invalidateSessionsForCompany(sessions, usersById, companyId) {
  const userIds = new Set();
  for (const user of usersById.values()) {
    if (String(user.companyId) === String(companyId)) {
      userIds.add(String(user.id));
    }
  }
  for (const [token, session] of sessions.entries()) {
    if (userIds.has(String(session.userId))) {
      sessions.delete(token);
    }
  }
  return userIds.size;
}

/**
 * Hard-delete a tenant company and dependent operational data.
 * @param {Function} dbQuery
 * @param {string} companyId
 * @param {{ confirmSlug: string }} opts
 */
export async function deleteCompanyHard(dbQuery, companyId, opts) {
  const companyRes = await dbQuery(
    `SELECT id::text, slug FROM companies WHERE id = $1::uuid`,
    [companyId]
  );
  const company = companyRes.rows[0];
  if (!company) throw new Error("Company not found.");
  assertCompanyDeletable(companyId, opts.confirmSlug, company.slug);

  await dbQuery("BEGIN");
  try {
    const flockIdsUuid = `(SELECT id FROM poultry_flocks WHERE company_id = $1::uuid)`;
    const flockIdsText = `(SELECT id::text FROM poultry_flocks WHERE company_id = $1::uuid)`;
    const userIdsSub = `(SELECT id FROM users WHERE company_id = $1::uuid)`;

    await dbQuery(`DELETE FROM payroll_impact WHERE flock_id IN ${flockIdsUuid}`, [companyId]);
    await dbQuery(`DELETE FROM payroll_impact WHERE user_id IN ${userIdsSub}`, [companyId]);
    await dbQuery(`DELETE FROM flock_feed_entries WHERE flock_id IN ${flockIdsUuid}`, [companyId]);
    await dbQuery(`DELETE FROM flock_mortality_events WHERE flock_id IN ${flockIdsUuid}`, [companyId]);
    await dbQuery(`DELETE FROM check_ins WHERE flock_id IN ${flockIdsUuid}`, [companyId]);
    await dbQuery(`DELETE FROM farm_vet_logs WHERE flock_id IN ${flockIdsUuid}`, [companyId]);
    await dbQuery(`DELETE FROM treatment_rounds WHERE flock_id IN ${flockIdsText}`, [companyId]);
    await dbQuery(`DELETE FROM flock_treatments WHERE flock_id IN ${flockIdsText}`, [companyId]);
    await dbQuery(`DELETE FROM flock_slaughter_events WHERE flock_id IN ${flockIdsText}`, [companyId]);
    await dbQuery(`DELETE FROM flock_valuation_snapshots WHERE flock_id IN ${flockIdsText}`, [companyId]);
    await dbQuery(`DELETE FROM weigh_ins WHERE flock_id IN ${flockIdsText}`, [companyId]);
    await dbQuery(`DELETE FROM log_schedule WHERE flock_id IN ${flockIdsUuid}`, [companyId]);
    await dbQuery(`DELETE FROM poultry_daily_logs WHERE flock_id IN ${flockIdsUuid}`, [companyId]);
    await dbQuery(`DELETE FROM farm_inventory_transactions WHERE company_id = $1::uuid`, [companyId]);
    await dbQuery(`DELETE FROM farm_suppliers WHERE company_id = $1::uuid`, [companyId]);
    await dbQuery(`DELETE FROM farm_loan_applications WHERE company_id = $1::uuid`, [companyId]);
    await dbQuery(`DELETE FROM erpnext_warehouse_mapping WHERE company_id = $1::uuid`, [companyId]);
    await dbQuery(`DELETE FROM erpnext_config WHERE company_id = $1::uuid`, [companyId]);
    await dbQuery(`DELETE FROM clevafarm_sync_outbox WHERE company_id = $1::uuid`, [companyId]);
    await dbQuery(`DELETE FROM farm_migration_map WHERE company_id = $1::uuid`, [companyId]);
    await dbQuery(`DELETE FROM erpnext_sync_log WHERE company_id = $1::uuid`, [companyId]);

    // Storefronts owned by this tenant. Scout-captured unclaimed profiles (company_id null) stay.
    await dbQuery(
      `DELETE FROM market_events
        WHERE farm_profile_id IN (SELECT id FROM farm_profiles WHERE company_id = $1::uuid)
           OR lot_id IN (SELECT id FROM pipeline_lots WHERE company_id = $1::uuid)`,
      [companyId]
    ).catch(() => {});
    await dbQuery(
      `DELETE FROM market_media
        WHERE (owner_type = 'farm_profile' AND owner_id IN (SELECT id FROM farm_profiles WHERE company_id = $1::uuid))
           OR (owner_type = 'lot' AND owner_id IN (SELECT id FROM pipeline_lots WHERE company_id = $1::uuid))`,
      [companyId]
    ).catch(() => {});
    await dbQuery(
      `DELETE FROM farm_visits
        WHERE farm_profile_id IN (SELECT id FROM farm_profiles WHERE company_id = $1::uuid)`,
      [companyId]
    ).catch(() => {});
    await dbQuery(
      `DELETE FROM farm_profile_claims
        WHERE farm_profile_id IN (SELECT id FROM farm_profiles WHERE company_id = $1::uuid)`,
      [companyId]
    ).catch(() => {});
    await dbQuery(`DELETE FROM farm_profiles WHERE company_id = $1::uuid`, [companyId]).catch(() => {});

    // Pipeline: remove matches/lots for this tenant before flocks (scout lots with null company_id stay).
    await dbQuery(
      `DELETE FROM pipeline_matches
        WHERE lot_id IN (SELECT id FROM pipeline_lots WHERE company_id = $1::uuid)
           OR lot_id IN (
                SELECT id FROM pipeline_lots
                 WHERE flock_id IN (SELECT id FROM poultry_flocks WHERE company_id = $1::uuid)
              )`,
      [companyId]
    );
    await dbQuery(
      `DELETE FROM pipeline_lots
        WHERE company_id = $1::uuid
           OR flock_id IN (SELECT id FROM poultry_flocks WHERE company_id = $1::uuid)`,
      [companyId]
    );
    await dbQuery(
      `DELETE FROM poultry_sales_orders
        WHERE flock_id IN (SELECT id FROM poultry_flocks WHERE company_id = $1::uuid)`,
      [companyId]
    );

    await dbQuery(`DELETE FROM poultry_flocks WHERE company_id = $1::uuid`, [companyId]);
    await dbQuery(`DELETE FROM users WHERE company_id = $1::uuid`, [companyId]);
    await dbQuery(`DELETE FROM companies WHERE id = $1::uuid`, [companyId]);
    await dbQuery("COMMIT");
  } catch (e) {
    await dbQuery("ROLLBACK");
    throw e;
  }
}
