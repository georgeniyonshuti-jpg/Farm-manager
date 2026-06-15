import { ENTITY_DEPENDENCY_ORDER } from "./entityRegistry.js";

/** Fallback Frappe DocType per entityType when ERPNext response omits doctype. */
export const ENTITY_ERPNEXT_DOCTYPE = {
  farm_company: "Company",
  poultry_breed_standard: "Poultry Breed Standard",
  farm_barn: "Farm Barn",
  farm_supplier: "Farm Supplier",
  flock: "Flock",
  farm_medicine_item: "Farm Medicine Item",
  farm_medicine_lot: "Farm Medicine Lot",
  feed_log: "Feed Log",
  feed_inventory_transaction: "Feed Inventory Transaction",
  mortality_log: "Mortality Log",
  farm_checkin: "Farm Checkin",
  farm_checkin_schedule: "Farm Checkin Schedule",
  farm_treatment: "Farm Treatment",
  slaughter_record: "Slaughter Record",
  daily_farm_log: "Daily Farm Log",
  farm_vet_log: "Farm Vet Log",
  farm_treatment_round: "Farm Treatment Round",
  farm_treatment_round_event: "Farm Treatment Round Event",
  farm_weigh_in: "Farm Weigh In",
  farm_valuation_snapshot: "Farm Valuation Snapshot",
  farm_payroll_impact: "Farm Payroll Impact",
  farm_loan_application: "Farm Loan Application",
  farm_migration_map: "Farm Migration Map",
};

export function getErpnextDoctypeForEntity(entityType, responseDoctype = null) {
  if (responseDoctype) return String(responseDoctype);
  return ENTITY_ERPNEXT_DOCTYPE[entityType] || null;
}

/**
 * Upsert Postgres id ↔ ERPNext document name for inbound FK resolution.
 * @param {{ legacyId: string, erpnextDoctype: string, erpnextName: string, companyId?: string | null, dbQuery: (sql: string, params?: unknown[]) => Promise<unknown> }} opts
 */
export async function upsertMigrationMapEntry({
  legacyId,
  erpnextDoctype,
  erpnextName,
  companyId = null,
  dbQuery,
}) {
  if (!legacyId || !erpnextDoctype || !erpnextName || !dbQuery) return false;

  await dbQuery(
    `INSERT INTO farm_migration_map (legacy_id, erpnext_doctype, erpnext_name, company_id)
     VALUES ($1, $2, $3, $4::uuid)
     ON CONFLICT (legacy_id, erpnext_doctype) DO UPDATE
       SET erpnext_name = EXCLUDED.erpnext_name,
           company_id = COALESCE(EXCLUDED.company_id, farm_migration_map.company_id),
           updated_at = now()`,
    [String(legacyId), String(erpnextDoctype), String(erpnextName), companyId]
  );
  return true;
}

export { ENTITY_DEPENDENCY_ORDER };
