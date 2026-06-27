let _dbQuery = null;

export function initErpnextConfigDb(dbQuery) {
  _dbQuery = dbQuery;
}

function mapConfigRow(row) {
  if (!row) return null;
  return {
    id: row.id,
    companyId: row.company_id,
    erpnextBaseUrl: row.erpnext_base_url,
    erpnextCompany: row.erpnext_company,
    erpnextDefaultCostCenter: row.erpnext_default_cost_center,
    accountFeedExpense: row.account_feed_expense,
    accountMortalityLoss: row.account_mortality_loss,
    accountLivestockAsset: row.account_livestock_asset,
    accountSalesRevenue: row.account_sales_revenue,
    accountPayrollExpense: row.account_payroll_expense,
    accountMedicineExpense: row.account_medicine_expense,
    autoSyncFeed: row.auto_sync_feed,
    autoSyncMortality: row.auto_sync_mortality,
    autoSyncSlaughter: row.auto_sync_slaughter,
    autoSyncPayroll: row.auto_sync_payroll,
    updatedAt: row.updated_at,
  };
}

export async function getErpnextConfig(companyId) {
  if (!_dbQuery || !companyId) return null;
  const r = await _dbQuery(`SELECT * FROM erpnext_config WHERE company_id = $1::uuid`, [companyId]);
  return mapConfigRow(r.rows[0]);
}

export async function upsertErpnextConfig(companyId, config) {
  if (!_dbQuery || !companyId) {
    throw new Error("Database unavailable for ERPNext config.");
  }
  const r = await _dbQuery(
    `INSERT INTO erpnext_config (
       company_id, erpnext_base_url, erpnext_company, erpnext_default_cost_center,
       account_feed_expense, account_mortality_loss, account_livestock_asset,
       account_sales_revenue, account_payroll_expense, account_medicine_expense,
       auto_sync_feed, auto_sync_mortality, auto_sync_slaughter, auto_sync_payroll, updated_at
     ) VALUES (
       $1::uuid, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, now()
     )
     ON CONFLICT (company_id) DO UPDATE SET
       erpnext_base_url = EXCLUDED.erpnext_base_url,
       erpnext_company = EXCLUDED.erpnext_company,
       erpnext_default_cost_center = EXCLUDED.erpnext_default_cost_center,
       account_feed_expense = EXCLUDED.account_feed_expense,
       account_mortality_loss = EXCLUDED.account_mortality_loss,
       account_livestock_asset = EXCLUDED.account_livestock_asset,
       account_sales_revenue = EXCLUDED.account_sales_revenue,
       account_payroll_expense = EXCLUDED.account_payroll_expense,
       account_medicine_expense = EXCLUDED.account_medicine_expense,
       auto_sync_feed = EXCLUDED.auto_sync_feed,
       auto_sync_mortality = EXCLUDED.auto_sync_mortality,
       auto_sync_slaughter = EXCLUDED.auto_sync_slaughter,
       auto_sync_payroll = EXCLUDED.auto_sync_payroll,
       updated_at = now()
     RETURNING *`,
    [
      companyId,
      config.erpnextBaseUrl || "https://erp.clevacredit.com",
      config.erpnextCompany || null,
      config.erpnextDefaultCostCenter || null,
      config.accountFeedExpense || null,
      config.accountMortalityLoss || null,
      config.accountLivestockAsset || null,
      config.accountSalesRevenue || null,
      config.accountPayrollExpense || null,
      config.accountMedicineExpense || null,
      config.autoSyncFeed ?? true,
      config.autoSyncMortality ?? true,
      config.autoSyncSlaughter ?? true,
      config.autoSyncPayroll ?? false,
    ]
  );
  return mapConfigRow(r.rows[0]);
}

export async function listWarehouseMappings(companyId) {
  if (!_dbQuery || !companyId) return [];
  const r = await _dbQuery(
    `SELECT id, barn_name, erpnext_warehouse FROM erpnext_warehouse_mapping
     WHERE company_id = $1::uuid ORDER BY barn_name`,
    [companyId]
  );
  return r.rows.map((row) => ({
    id: row.id,
    barnName: row.barn_name,
    erpnextWarehouse: row.erpnext_warehouse,
  }));
}

export async function upsertWarehouseMapping(companyId, barnName, erpnextWarehouse) {
  if (!_dbQuery || !companyId) throw new Error("Database unavailable.");
  const r = await _dbQuery(
    `INSERT INTO erpnext_warehouse_mapping (company_id, barn_name, erpnext_warehouse)
     VALUES ($1::uuid, $2, $3)
     ON CONFLICT (company_id, barn_name) DO UPDATE SET erpnext_warehouse = EXCLUDED.erpnext_warehouse
     RETURNING id, barn_name, erpnext_warehouse`,
    [companyId, barnName, erpnextWarehouse]
  );
  const row = r.rows[0];
  return { id: row.id, barnName: row.barn_name, erpnextWarehouse: row.erpnext_warehouse };
}

export async function getUserCompanyId(userId) {
  if (!_dbQuery || !userId) return null;
  const r = await _dbQuery(`SELECT company_id::text AS id FROM users WHERE id = $1::uuid`, [userId]);
  return r.rows[0]?.id || null;
}

export async function setErpnextCompanyLink(companyId, erpnextCompany) {
  if (!_dbQuery || !companyId) {
    throw new Error("Database unavailable for ERPNext company link.");
  }
  const name = String(erpnextCompany ?? "").trim();
  if (!name) {
    throw new Error("erpnextCompany is required.");
  }
  const r = await _dbQuery(
    `INSERT INTO erpnext_config (company_id, erpnext_base_url, erpnext_company, updated_at)
     VALUES ($1::uuid, $2, $3, now())
     ON CONFLICT (company_id) DO UPDATE SET
       erpnext_company = EXCLUDED.erpnext_company,
       updated_at = now()
     RETURNING company_id::text AS company_id, erpnext_company`,
    [companyId, "https://erp.clevacredit.com", name]
  );
  const row = r.rows[0];
  return { companyId: row.company_id, erpnextCompany: row.erpnext_company };
}

export async function getErpnextCompanyLinks() {
  if (!_dbQuery) return [];
  const r = await _dbQuery(
    `SELECT company_id::text AS "companyId", erpnext_company AS "erpnextCompany"
     FROM erpnext_config
     WHERE erpnext_company IS NOT NULL AND erpnext_company <> ''
     ORDER BY company_id`
  );
  return r.rows;
}
