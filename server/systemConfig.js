/**
 * Superuser-managed reference options, app settings, and breed standards override.
 * In-memory fallbacks when DATABASE_URL is not configured.
 */

/** @type {Array<{ category: string, value: string, label: string, sortOrder: number, active: boolean, metadata?: object }>} */
export const DEFAULT_REFERENCE_ROWS = [
  { category: "breed", value: "generic_broiler", label: "generic_broiler", sortOrder: 0, active: true },
  { category: "breed", value: "cobb_500", label: "cobb_500", sortOrder: 1, active: true },
  { category: "breed", value: "ross_308", label: "ross_308", sortOrder: 2, active: true },
  { category: "slaughter_reason", value: "planned_market", label: "Planned market harvest", sortOrder: 0, active: true },
  { category: "slaughter_reason", value: "target_weight_reached", label: "Target weight reached", sortOrder: 1, active: true },
  { category: "slaughter_reason", value: "emergency_cull", label: "Emergency cull", sortOrder: 2, active: true },
  { category: "slaughter_reason", value: "partial_harvest", label: "Partial harvest", sortOrder: 3, active: true },
  { category: "slaughter_reason", value: "other", label: "Other", sortOrder: 4, active: true },
  { category: "treatment_reason", value: "routine_prevention", label: "Routine prevention", sortOrder: 0, active: true },
  { category: "treatment_reason", value: "suspected_infection", label: "Suspected infection", sortOrder: 1, active: true },
  { category: "treatment_reason", value: "confirmed_infection", label: "Confirmed infection", sortOrder: 2, active: true },
  { category: "treatment_reason", value: "vet_directive", label: "Vet directive", sortOrder: 3, active: true },
  { category: "treatment_reason", value: "other", label: "Other", sortOrder: 4, active: true },
  { category: "treatment_route", value: "oral", label: "oral", sortOrder: 0, active: true },
  { category: "treatment_route", value: "injection", label: "injection", sortOrder: 1, active: true },
  { category: "treatment_route", value: "waterline", label: "waterline", sortOrder: 2, active: true },
  { category: "treatment_route", value: "spray", label: "spray", sortOrder: 3, active: true },
  { category: "treatment_route", value: "other", label: "other", sortOrder: 4, active: true },
  { category: "treatment_dose_unit", value: "ml", label: "ml", sortOrder: 0, active: true },
  { category: "treatment_dose_unit", value: "g", label: "g", sortOrder: 1, active: true },
  { category: "treatment_dose_unit", value: "mg", label: "mg", sortOrder: 2, active: true },
  { category: "treatment_dose_unit", value: "tablet", label: "tablet", sortOrder: 3, active: true },
  { category: "treatment_dose_unit", value: "drop", label: "drop", sortOrder: 4, active: true },
  { category: "treatment_dose_unit", value: "other", label: "other", sortOrder: 5, active: true },
  { category: "medicine_stock_unit", value: "ml", label: "ml", sortOrder: 0, active: true },
  { category: "medicine_stock_unit", value: "g", label: "g", sortOrder: 1, active: true },
  { category: "medicine_stock_unit", value: "doses", label: "doses", sortOrder: 2, active: true },
  { category: "medicine_stock_unit", value: "sachets", label: "sachets", sortOrder: 3, active: true },
  { category: "medicine_category", value: "vaccine", label: "vaccine", sortOrder: 0, active: true },
  { category: "medicine_category", value: "antibiotic", label: "antibiotic", sortOrder: 1, active: true },
  { category: "medicine_category", value: "coccidiostat", label: "coccidiostat", sortOrder: 2, active: true },
  { category: "medicine_category", value: "vitamin", label: "vitamin", sortOrder: 3, active: true },
  { category: "medicine_category", value: "electrolyte", label: "electrolyte", sortOrder: 4, active: true },
  { category: "medicine_category", value: "other", label: "other", sortOrder: 5, active: true },
  { category: "feed_type", value: "starter", label: "starter", sortOrder: 0, active: true },
  { category: "feed_type", value: "grower", label: "grower", sortOrder: 1, active: true },
  { category: "feed_type", value: "finisher", label: "finisher", sortOrder: 2, active: true },
  { category: "feed_type", value: "supplement", label: "supplement", sortOrder: 3, active: true },
  { category: "medicine_admin_route", value: "drinking_water", label: "drinking water", sortOrder: 0, active: true },
  { category: "medicine_admin_route", value: "feed_additive", label: "feed additive", sortOrder: 1, active: true },
  { category: "medicine_admin_route", value: "injection", label: "injection", sortOrder: 2, active: true },
  { category: "medicine_admin_route", value: "topical", label: "topical", sortOrder: 3, active: true },
  { category: "inventory_procurement_reason", value: "supplier_delivery", label: "Supplier delivery", sortOrder: 0, active: true },
  { category: "inventory_procurement_reason", value: "internal_transfer_in", label: "Internal transfer in", sortOrder: 1, active: true },
  { category: "inventory_procurement_reason", value: "returned_stock", label: "Returned stock", sortOrder: 2, active: true },
  { category: "inventory_procurement_reason", value: "other", label: "Other", sortOrder: 3, active: true },
  { category: "inventory_consumption_reason", value: "round_feed", label: "Round feed", sortOrder: 0, active: true },
  { category: "inventory_consumption_reason", value: "catchup_feed", label: "Catch-up feed", sortOrder: 1, active: true },
  { category: "inventory_consumption_reason", value: "spillage_adjusted", label: "Spillage adjusted", sortOrder: 2, active: true },
  { category: "inventory_consumption_reason", value: "other", label: "Other", sortOrder: 3, active: true },
  { category: "inventory_adjust_reason", value: "stock_count_correction", label: "Stock count correction", sortOrder: 0, active: true },
  { category: "inventory_adjust_reason", value: "damage_loss", label: "Damage/loss", sortOrder: 1, active: true },
  { category: "inventory_adjust_reason", value: "expired_feed", label: "Expired feed", sortOrder: 2, active: true },
  { category: "inventory_adjust_reason", value: "other", label: "Other", sortOrder: 3, active: true },
  { category: "department_key", value: "investor_memo", label: "Investor memo channel", sortOrder: 0, active: true },
  { category: "department_key", value: "credit_committee", label: "Credit committee", sortOrder: 1, active: true },
  { category: "department_key", value: "dispatch", label: "Dispatch / logistics", sortOrder: 2, active: true },
  { category: "log_schedule_role", value: "laborer", label: "laborer", sortOrder: 0, active: true },
  { category: "log_schedule_role", value: "dispatcher", label: "dispatcher", sortOrder: 1, active: true },
  { category: "log_schedule_role", value: "vet", label: "vet", sortOrder: 2, active: true },
  { category: "log_schedule_role", value: "vet_manager", label: "vet_manager", sortOrder: 3, active: true },
  { category: "log_schedule_role", value: "manager", label: "manager", sortOrder: 4, active: true },
  { category: "log_schedule_role", value: "procurement_officer", label: "procurement_officer", sortOrder: 5, active: true },
  { category: "log_schedule_role", value: "sales_coordinator", label: "sales_coordinator", sortOrder: 6, active: true },
  { category: "role_label", value: "laborer", label: "Laborer", sortOrder: 0, active: true },
  { category: "role_label", value: "dispatcher", label: "Dispatcher", sortOrder: 1, active: true },
  { category: "role_label", value: "procurement_officer", label: "Procurement officer", sortOrder: 2, active: true },
  { category: "role_label", value: "sales_coordinator", label: "Sales coordinator", sortOrder: 3, active: true },
  { category: "role_label", value: "vet", label: "Veterinarian", sortOrder: 4, active: true },
  { category: "role_label", value: "vet_manager", label: "Vet manager", sortOrder: 5, active: true },
  { category: "role_label", value: "investor", label: "Investor (read-oriented)", sortOrder: 6, active: true },
  { category: "role_label", value: "manager", label: "Manager", sortOrder: 7, active: true },
  { category: "role_label", value: "superuser", label: "Superuser", sortOrder: 8, active: true },
];

export const DEFAULT_APP_SETTINGS = {
  config_version: "1",
  rate_limit_login_max: "10",
  rate_limit_login_window_ms: "900000",
  rate_limit_translate_max: "30",
  rate_limit_translate_window_ms: "60000",
  rate_limit_api_max: "200",
  rate_limit_api_window_ms: "60000",
  max_image_upload_bytes: "5242880",
  demo_initial_count: "1000",
  field_payroll_check_in_rwf: "100",
  field_payroll_feed_rwf: "300",
  field_payroll_missed_check_in_rwf: "200",
  field_payroll_missed_feed_rwf: "200",
  checkin_commission_on_time_rwf: "500",
  checkin_deduction_late_rwf: "300",
  checkin_deduction_missed_rwf: "500",
};

/** @type {Array<{ category: string, value: string, label: string, sortOrder: number, active: boolean, metadata: object }>} */
let memReferenceRows = [];

/** @type {Record<string, string>} */
let memAppSettings = { ...DEFAULT_APP_SETTINGS };

/** @type {object | null} */
let memBreedStandardsOverride = null;

const REFERENCE_CATEGORIES = new Set([
  "breed",
  "slaughter_reason",
  "treatment_reason",
  "treatment_route",
  "treatment_dose_unit",
  "medicine_stock_unit",
  "medicine_category",
  "feed_type",
  "medicine_admin_route",
  "inventory_procurement_reason",
  "inventory_consumption_reason",
  "inventory_adjust_reason",
  "department_key",
  "log_schedule_role",
  "role_label",
]);

export function initializeMemoryDefaults() {
  memReferenceRows = DEFAULT_REFERENCE_ROWS.map((r) => ({
    category: r.category,
    value: r.value,
    label: r.label,
    sortOrder: r.sortOrder,
    active: r.active,
    metadata: r.metadata ?? {},
  }));
  memAppSettings = { ...DEFAULT_APP_SETTINGS };
  memBreedStandardsOverride = null;
}

initializeMemoryDefaults();

/** Normalize machine keys for validation (breed codes are always compared lowercase). */
function normalizedOptionValue(category, value) {
  const s = String(value ?? "").trim();
  if (String(category) === "breed") return s.toLowerCase();
  return s;
}

function rowToClient(row) {
  return {
    category: row.category,
    value: String(row.value ?? "").trim(),
    label: String(row.label ?? "").trim(),
    sortOrder: row.sort_order ?? row.sortOrder ?? 0,
    active: row.active !== false,
    metadata: row.metadata && typeof row.metadata === "object" ? row.metadata : {},
  };
}

export function getStaticFallbackCodes(category) {
  return DEFAULT_REFERENCE_ROWS.filter((r) => r.category === String(category)).map((r) => r.value);
}

export function getActiveReferenceOptionsGrouped() {
  return buildGroupedReferenceOptions(memReferenceRows, true);
}

export function buildGroupedReferenceOptions(rows, activeOnly) {
  /** @type {Record<string, Array<{ value: string, label: string, sortOrder: number, active: boolean, metadata: object }>>} */
  const out = {};
  for (const raw of rows) {
    const r = typeof raw.sort_order === "number" ? raw : { ...raw, sort_order: raw.sortOrder };
    if (activeOnly && r.active === false) continue;
    const cat = String(r.category);
    if (!out[cat]) out[cat] = [];
    out[cat].push({
      value: String(r.value),
      label: String(r.label),
      sortOrder: Number(r.sort_order) || 0,
      active: r.active !== false,
      metadata: r.metadata && typeof r.metadata === "object" ? r.metadata : {},
    });
  }
  for (const k of Object.keys(out)) {
    out[k].sort((a, b) => a.sortOrder - b.sortOrder || a.value.localeCompare(b.value));
  }
  return out;
}

export function getConfigVersion() {
  const v = parseInt(String(memAppSettings.config_version ?? "1"), 10);
  return Number.isFinite(v) ? v : 1;
}

export function getAppSettingNumber(key, defaultValue) {
  const raw = memAppSettings[key];
  if (raw == null || raw === "") return defaultValue;
  const n = Number(raw);
  return Number.isFinite(n) ? n : defaultValue;
}

/** Fixed RWF amounts for field auto payroll (laborer-facing check-in / feed). */
export function getFieldPayrollRates() {
  return {
    checkInRwf: Math.max(0, Math.floor(getAppSettingNumber("field_payroll_check_in_rwf", 100))),
    feedRwf: Math.max(0, Math.floor(getAppSettingNumber("field_payroll_feed_rwf", 300))),
    missedCheckInRwf: Math.max(0, Math.floor(getAppSettingNumber("field_payroll_missed_check_in_rwf", 200))),
    missedFeedRwf: Math.max(0, Math.floor(getAppSettingNumber("field_payroll_missed_feed_rwf", 200))),
  };
}

/** Configurable check-in commission/deduction rates (manager+ editable). */
export function getCheckinCommissionRates() {
  return {
    onTimeRwf: Math.max(0, Math.floor(getAppSettingNumber("checkin_commission_on_time_rwf", 500))),
    lateDeductionRwf: Math.max(0, Math.floor(getAppSettingNumber("checkin_deduction_late_rwf", 300))),
    missedDeductionRwf: Math.max(0, Math.floor(getAppSettingNumber("checkin_deduction_missed_rwf", 500))),
  };
}

const CHECKIN_COMMISSION_DB_KEYS = [
  "checkin_commission_on_time_rwf",
  "checkin_deduction_late_rwf",
  "checkin_deduction_missed_rwf",
];

const FIELD_PAYROLL_DB_KEYS = [
  "field_payroll_check_in_rwf",
  "field_payroll_feed_rwf",
  "field_payroll_missed_check_in_rwf",
  "field_payroll_missed_feed_rwf",
];

/**
 * Persist field payroll rate settings (manager/superuser). Updates memory and DB when configured.
 * @param {(sql: string, params?: unknown[]) => Promise<unknown>} dbQuery
 * @param {() => boolean} hasDbFn
 * @param {{ checkInRwf: unknown, feedRwf: unknown, missedCheckInRwf: unknown, missedFeedRwf: unknown }} body
 */
export async function persistFieldPayrollRates(dbQuery, hasDbFn, body) {
  const clamp = (v) => {
    const n = Math.floor(Number(v));
    if (!Number.isFinite(n)) return 0;
    return Math.max(0, Math.min(1_000_000, n));
  };
  const nextVals = {
    field_payroll_check_in_rwf: clamp(body.checkInRwf),
    field_payroll_feed_rwf: clamp(body.feedRwf),
    field_payroll_missed_check_in_rwf: clamp(body.missedCheckInRwf),
    field_payroll_missed_feed_rwf: clamp(body.missedFeedRwf),
  };
  memAppSettings = {
    ...memAppSettings,
    ...Object.fromEntries(Object.entries(nextVals).map(([k, v]) => [k, String(v)])),
  };
  if (hasDbFn()) {
    for (const k of FIELD_PAYROLL_DB_KEYS) {
      const v = nextVals[k];
      if (v == null) continue;
      await dbQuery(
        `INSERT INTO app_settings (setting_key, setting_value) VALUES ($1,$2)
         ON CONFLICT (setting_key) DO UPDATE SET setting_value = EXCLUDED.setting_value, updated_at = now()`,
        [k, String(v)]
      );
    }
  }
}

export function getAppSettingsSnapshot() {
  return { ...memAppSettings };
}

export function getActiveValuesForCategory(category) {
  const want = String(category);
  const set = new Set();
  for (const r of memReferenceRows) {
    if (r.category !== want || !r.active) continue;
    set.add(normalizedOptionValue(want, r.value));
  }
  return set;
}

export function isActiveReferenceValue(category, value) {
  const v = normalizedOptionValue(category, value);
  if (!v) return false;
  return getActiveValuesForCategory(category).has(v);
}

export function validateAgainstCategory(category, value, fallbackCodes) {
  const active = getActiveValuesForCategory(category);
  const v = normalizedOptionValue(category, value);
  if (active.size > 0) return active.has(v);
  return fallbackCodes.some((c) => normalizedOptionValue(category, c) === v);
}

export function mergeBreedStandardsFileWithDb(fileDoc, dbDoc) {
  const base = fileDoc && typeof fileDoc === "object" ? fileDoc : { breeds: {} };
  const ov = dbDoc && typeof dbDoc === "object" ? dbDoc : {};
  const breedsBase = base.breeds && typeof base.breeds === "object" ? base.breeds : {};
  const breedsOv = ov.breeds && typeof ov.breeds === "object" ? ov.breeds : {};
  return {
    ...base,
    ...ov,
    meta: {
      ...(base.meta && typeof base.meta === "object" ? base.meta : {}),
      ...(ov.meta && typeof ov.meta === "object" ? ov.meta : {}),
    },
    breeds: { ...breedsBase, ...breedsOv },
  };
}

export function getBreedStandardsOverride() {
  return memBreedStandardsOverride;
}

export function validateBreedStandardsDocument(doc) {
  if (!doc || typeof doc !== "object") return "breedStandards must be an object";
  const breeds = doc.breeds;
  if (!breeds || typeof breeds !== "object") return "breedStandards.breeds must be an object";
  for (const code of Object.keys(breeds)) {
    const b = breeds[code];
    if (!b || typeof b !== "object") return `Invalid breed entry: ${code}`;
    const curve = b.curve_kg_avg_weight_by_day;
    if (!curve || typeof curve !== "object") return `Breed ${code} missing curve_kg_avg_weight_by_day`;
    for (const day of Object.keys(curve)) {
      const w = Number(curve[day]);
      if (!Number.isFinite(w) || w < 0) return `Breed ${code} has invalid weight for day ${day}`;
    }
  }
  return null;
}

/**
 * @param {{ query: (sql: string, params?: unknown[]) => Promise<{ rows: unknown[] }> }} dbPoolLike
 */
export async function refreshSystemConfigFromDatabase(dbQuery, hasDbFn) {
  if (!hasDbFn()) return;
  try {
    const rOpts = await dbQuery(
      `SELECT category, value, label, sort_order, active, metadata
         FROM reference_options
        ORDER BY category, sort_order, value`
    );
    if (rOpts.rows.length > 0) {
      memReferenceRows = rOpts.rows.map((row) => rowToClient(row));
    } else {
      memReferenceRows = DEFAULT_REFERENCE_ROWS.map((r) => ({
        category: r.category,
        value: r.value,
        label: r.label,
        sortOrder: r.sortOrder,
        active: r.active,
        metadata: {},
      }));
    }

    const rSet = await dbQuery(`SELECT setting_key, setting_value FROM app_settings`);
    const next = { ...DEFAULT_APP_SETTINGS };
    for (const row of rSet.rows) {
      next[String(row.setting_key)] = String(row.setting_value);
    }
    memAppSettings = next;

    const rBr = await dbQuery(`SELECT document FROM breed_standards_document WHERE id = 1 LIMIT 1`);
    const doc = rBr.rows[0]?.document;
    const raw = doc && typeof doc === "object" ? doc : null;
    if (raw && Object.keys(raw).length === 0) memBreedStandardsOverride = null;
    else memBreedStandardsOverride = raw;
  } catch (e) {
    console.error("[ERROR]", "[systemConfig] refresh:", e instanceof Error ? e.message : e);
  }
}

/**
 * @param {{ version: number, referenceOptions?: unknown[], appSettings?: Record<string, string>, breedStandards?: object }} payload
 * @param {import("pg").Pool | null} dbPool
 */
export async function applyAdminSystemConfigPut(payload, dbPool, dbQuery, hasDbFn, appendAudit, actorUserId, actorRole) {
  const version = Number(payload?.version);
  if (!Number.isFinite(version) || version !== getConfigVersion()) {
    const err = new Error("CONFLICT");
    err.code = "CONFLICT";
    err.currentVersion = getConfigVersion();
    throw err;
  }

  const hasRef = payload.referenceOptions !== undefined;
  const hasSettings = payload.appSettings !== undefined;
  const hasBreed = payload.breedStandards !== undefined;
  if (!hasRef && !hasSettings && !hasBreed) {
    const err = new Error("No changes provided");
    err.code = "EMPTY";
    throw err;
  }

  const refIn = hasRef ? payload.referenceOptions : null;
  const settingsIn = hasSettings && payload.appSettings && typeof payload.appSettings === "object" ? payload.appSettings : null;
  const breedIn = hasBreed ? payload.breedStandards : undefined;

  if (refIn) {
    if (!Array.isArray(refIn) || refIn.length === 0) {
      const err = new Error("referenceOptions must be a non-empty array when provided");
      err.code = "INVALID_REFERENCE";
      throw err;
    }
    const normalized = [];
    for (const raw of refIn) {
      const category = String(raw.category ?? "").trim();
      const value = String(raw.value ?? "").trim().slice(0, 200);
      const label = String(raw.label ?? "").trim().slice(0, 500);
      if (!category || !value || !label) continue;
      if (!REFERENCE_CATEGORIES.has(category)) continue;
      const sortOrder = Math.max(0, Math.min(99999, Number(raw.sortOrder) || 0));
      const active = raw.active !== false;
      const metadata = raw.metadata && typeof raw.metadata === "object" ? raw.metadata : {};
      normalized.push({ category, value, label, sortOrder, active, metadata });
    }
    if (normalized.length === 0 && refIn.length > 0) {
      const err = new Error("INVALID_REFERENCE");
      err.code = "INVALID_REFERENCE";
      throw err;
    }
    if (hasDbFn() && dbPool) {
      const c = await dbPool.connect();
      try {
        await c.query("BEGIN");
        await c.query("DELETE FROM reference_options");
        for (const r of normalized) {
          await c.query(
            `INSERT INTO reference_options (category, value, label, sort_order, active, metadata)
             VALUES ($1,$2,$3,$4,$5,$6::jsonb)`,
            [r.category, r.value, r.label, r.sortOrder, r.active, JSON.stringify(r.metadata)]
          );
        }
        await c.query("COMMIT");
      } catch (e) {
        await c.query("ROLLBACK");
        throw e;
      } finally {
        c.release();
      }
    } else {
      memReferenceRows = normalized;
    }
  }

  if (settingsIn) {
    const allowedKeys = new Set([
      "rate_limit_login_max",
      "rate_limit_login_window_ms",
      "rate_limit_translate_max",
      "rate_limit_translate_window_ms",
      "rate_limit_api_max",
      "rate_limit_api_window_ms",
      "max_image_upload_bytes",
      "demo_initial_count",
    ]);
    const next = { ...memAppSettings };
    const clean = { ...settingsIn };
    delete clean.config_version;
    for (const k of Object.keys(clean)) {
      if (!allowedKeys.has(k)) continue;
      let v = String(clean[k] ?? "").trim();
      if (k === "max_image_upload_bytes") {
        const n = Math.max(1024 * 100, Math.min(50 * 1024 * 1024, Number(v) || 0));
        v = String(n);
      } else if (k.endsWith("_ms")) {
        const n = Math.max(1000, Math.min(86_400_000, Number(v) || 0));
        v = String(Math.floor(n));
      } else {
        const n = Math.max(1, Math.min(1_000_000, Number(v) || 0));
        v = String(Math.floor(n));
      }
      next[k] = v;
    }
    memAppSettings = next;

    if (hasDbFn() && dbPool) {
      const c = await dbPool.connect();
      try {
        await c.query("BEGIN");
        for (const k of allowedKeys) {
          if (next[k] == null) continue;
          await c.query(
            `INSERT INTO app_settings (setting_key, setting_value) VALUES ($1,$2)
             ON CONFLICT (setting_key) DO UPDATE SET setting_value = EXCLUDED.setting_value, updated_at = now()`,
            [k, String(next[k])]
          );
        }
        await c.query("COMMIT");
      } catch (e) {
        await c.query("ROLLBACK");
        throw e;
      } finally {
        c.release();
      }
    }
  }

  if (breedIn !== undefined) {
    const brErr = validateBreedStandardsDocument(breedIn);
    if (brErr) {
      const err = new Error(brErr);
      err.code = "INVALID_BREED";
      throw err;
    }
    memBreedStandardsOverride = breedIn;
    if (hasDbFn()) {
      await dbQuery(
        `INSERT INTO breed_standards_document (id, document) VALUES (1, $1::jsonb)
         ON CONFLICT (id) DO UPDATE SET document = EXCLUDED.document, updated_at = now()`,
        [JSON.stringify(breedIn)]
      );
    }
  }

  const newVer = getConfigVersion() + 1;
  memAppSettings = { ...memAppSettings, config_version: String(newVer) };
  if (hasDbFn()) {
    await dbQuery(
      `INSERT INTO app_settings (setting_key, setting_value) VALUES ('config_version',$1)
       ON CONFLICT (setting_key) DO UPDATE SET setting_value = EXCLUDED.setting_value, updated_at = now()`,
      [String(newVer)]
    );
  }

  appendAudit(actorUserId, actorRole, "system_config.update", "system_config", null, {
    hadReference: Boolean(refIn),
    hadSettings: Boolean(settingsIn),
    hadBreed: breedIn !== undefined,
  });

  if (hasDbFn()) await refreshSystemConfigFromDatabase(dbQuery, hasDbFn);
}

/** @param {() => object} loadFileBreedsDoc */
export function packAdminSystemConfigPayload(loadFileBreedsDoc) {
  const fileDoc = typeof loadFileBreedsDoc === "function" ? loadFileBreedsDoc() : { breeds: {} };
  const grouped = buildGroupedReferenceOptions(memReferenceRows, false);
  return {
    version: getConfigVersion(),
    referenceOptionsByCategory: grouped,
    referenceOptionsFlat: [...memReferenceRows].sort((a, b) =>
      a.category === b.category ? a.sortOrder - b.sortOrder : a.category.localeCompare(b.category)
    ),
    appSettings: getAppSettingsSnapshot(),
    breedStandards: mergeBreedStandardsFileWithDb(fileDoc, memBreedStandardsOverride),
  };
}

/** Fixed-window per-IP limiter; reads limits from systemConfig each request. */
export function ipWindowRateLimitMiddleware(getMax, getWindowMs, jsonBody) {
  /** @type {Map<string, { start: number, n: number }>} */
  const hits = new Map();
  return (req, res, next) => {
    const windowMs = getWindowMs();
    const max = getMax();
    const ip = req.ip || req.socket?.remoteAddress || "unknown";
    const now = Date.now();
    let b = hits.get(ip);
    if (!b || now - b.start > windowMs) b = { start: now, n: 0 };
    b.n += 1;
    hits.set(ip, b);
    if (b.n > max) {
      res.status(429).json(jsonBody);
      return;
    }
    next();
  };
}
