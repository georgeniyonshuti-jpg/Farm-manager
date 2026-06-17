/**
 * ClevaFarm entity registry — maps entityType to Postgres source and reconciliation metadata.
 */

export const ENTITY_DEPENDENCY_ORDER = [
  "farm_company",
  "poultry_breed_standard",
  "farm_barn",
  "farm_supplier",
  "flock",
  "farm_medicine_item",
  "farm_medicine_lot",
  "feed_log",
  "feed_inventory_transaction",
  "mortality_log",
  "farm_checkin",
  "farm_checkin_schedule",
  "farm_treatment",
  "slaughter_record",
  "daily_farm_log",
  "farm_vet_log",
  "farm_treatment_round",
  "farm_treatment_round_event",
  "farm_weigh_in",
  "farm_valuation_snapshot",
  "farm_payroll_impact",
  "farm_loan_application",
  "farm_migration_map",
];

/** @type {Record<string, import('./entitySerializers.js').EntityDef>} */
export const ENTITY_DEFS = {
  farm_company: {
    table: "companies",
    idColumn: "id",
    updatedSinceSql: "COALESCE(updated_at, created_at)",
  },
  poultry_breed_standard: {
    table: "poultry_breed_standards",
    idColumn: "id",
    updatedSinceSql: "COALESCE(updated_at, created_at)",
  },
  farm_barn: {
    table: "poultry_barn_names",
    idColumn: "id",
    updatedSinceSql: "COALESCE(updated_at, created_at)",
  },
  farm_supplier: {
    table: "farm_suppliers",
    idColumn: "id",
    updatedSinceSql: "COALESCE(updated_at, created_at)",
  },
  flock: {
    table: "poultry_flocks",
    idColumn: "id",
    updatedSinceSql: "COALESCE(updated_at, created_at)",
  },
  farm_medicine_item: {
    table: "medicine_inventory",
    idColumn: "id",
    updatedSinceSql: "COALESCE(updated_at, created_at)",
  },
  farm_medicine_lot: {
    table: "medicine_lots",
    idColumn: "id",
    updatedSinceSql: "COALESCE(updated_at, created_at)",
  },
  feed_log: {
    table: "flock_feed_entries",
    idColumn: "id",
    updatedSinceSql: "COALESCE(updated_at, recorded_at, created_at)",
  },
  feed_inventory_transaction: {
    table: "farm_inventory_transactions",
    idColumn: "id",
    updatedSinceSql: "COALESCE(updated_at, created_at)",
  },
  mortality_log: {
    table: "flock_mortality_events",
    idColumn: "id",
    updatedSinceSql: "COALESCE(updated_at, at, created_at)",
  },
  farm_checkin: {
    table: "check_ins",
    idColumn: "id",
    updatedSinceSql: "GREATEST(at, COALESCE(reviewed_at, at), COALESCE(updated_at, at))",
    omitPayloadFields: ["photo_url", "photo_urls"],
  },
  farm_checkin_schedule: {
    table: "log_schedule",
    idColumn: "id",
    updatedSinceSql: "COALESCE(updated_at, created_at)",
  },
  farm_treatment: {
    table: "flock_treatments",
    idColumn: "id",
    updatedSinceSql: "COALESCE(updated_at, created_at)",
  },
  slaughter_record: {
    table: "flock_slaughter_events",
    idColumn: "id",
    updatedSinceSql: "COALESCE(updated_at, created_at)",
  },
  daily_farm_log: {
    table: "poultry_daily_logs",
    idColumn: "id",
    updatedSinceSql: "COALESCE(updated_at, log_date, created_at)",
  },
  farm_vet_log: {
    table: "farm_vet_logs",
    idColumn: "id",
    updatedSinceSql: "COALESCE(updated_at, created_at)",
  },
  farm_treatment_round: {
    table: "treatment_rounds",
    idColumn: "id",
    updatedSinceSql: "COALESCE(updated_at, created_at)",
  },
  farm_treatment_round_event: {
    table: "treatment_round_events",
    idColumn: "id",
    updatedSinceSql: "COALESCE(created_at, now())",
  },
  farm_weigh_in: {
    table: "weigh_ins",
    idColumn: "id",
    updatedSinceSql: "COALESCE(updated_at, created_at)",
  },
  farm_valuation_snapshot: {
    table: "flock_valuation_snapshots",
    idColumn: "id",
    updatedSinceSql: "COALESCE(updated_at, created_at)",
  },
  farm_payroll_impact: {
    table: "payroll_impact",
    idColumn: "id",
    updatedSinceSql: "COALESCE(updated_at, created_at)",
  },
  farm_loan_application: {
    table: "farm_loan_applications",
    idColumn: "id",
    updatedSinceSql: "COALESCE(updated_at, created_at)",
  },
  farm_migration_map: {
    table: "farm_migration_map",
    idColumn: "id",
    updatedSinceSql: "COALESCE(updated_at, created_at)",
  },
};

export function getEntityDef(entityType) {
  return ENTITY_DEFS[entityType] || null;
}

export function isValidEntityType(entityType) {
  return Boolean(ENTITY_DEFS[entityType]);
}

export function listEntityTypes() {
  return Object.keys(ENTITY_DEFS);
}

/** Entities with TEXT primary keys (not UUID). */
export const TEXT_PK_ENTITIES = new Set(["farm_treatment", "slaughter_record"]);

export function isTextPkEntity(entityType) {
  return TEXT_PK_ENTITIES.has(entityType);
}
