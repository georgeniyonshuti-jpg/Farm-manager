import { FLOCK_STATUS_IN } from "./entitySerializers.js";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** @type {Record<string, Set<string>>} */
export const INBOUND_ALLOWED_COLUMNS = {
  flock: new Set([
    "code",
    "breed_code",
    "placement_date",
    "initial_count",
    "status",
    "target_weight_kg",
    "hatchery_source",
    "initial_weight_kg",
    "purchase_cost_rwf",
    "cost_per_chick_rwf",
    "purchase_supplier",
    "purchase_date",
    "barn_name_id",
    "opening_recorded",
    "erpnext_purchase_invoice",
    "sync_source",
  ]),
  farm_supplier: new Set(["name", "normalized_name"]),
  farm_barn: new Set(["name", "normalized_name"]),
  feed_log: new Set([
    "flock_id",
    "recorded_at",
    "feed_kg",
    "notes",
    "entered_by_user_id",
    "submission_status",
    "erpnext_ref",
    "erpnext_sync_status",
  ]),
  mortality_log: new Set([
    "flock_id",
    "laborer_id",
    "at",
    "count",
    "is_emergency",
    "photos",
    "notes",
    "linked_checkin_id",
    "source",
    "submission_status",
    "affects_live_count",
    "erpnext_ref",
    "erpnext_sync_status",
  ]),
  slaughter_record: new Set([
    "flock_id",
    "at",
    "birds_slaughtered",
    "reason_code",
    "avg_live_weight_kg",
    "avg_carcass_weight_kg",
    "notes",
    "entered_by_user_id",
    "erpnext_ref",
    "erpnext_sync_status",
  ]),
  farm_treatment: new Set([
    "flock_id",
    "at",
    "disease_or_reason",
    "medicine_name",
    "reason_code",
    "dose",
    "dose_unit",
    "route",
    "duration_days",
    "withdrawal_days",
    "notes",
    "administered_by_user_id",
    "erpnext_ref",
    "erpnext_sync_status",
  ]),
  feed_inventory_transaction: new Set([
    "flock_id",
    "transaction_type",
    "recorded_at",
    "quantity_kg",
    "delta_kg",
    "unit_cost_rwf_per_kg",
    "reason",
    "reference",
    "supplier_name",
    "actor_user_id",
    "approved_by_user_id",
    "approved_at",
    "feed_type",
    "feed_entry_id",
    "accounting_status",
    "erpnext_ref",
  ]),
  farm_medicine_lot: new Set([
    "medicine_id",
    "lot_number",
    "received_at",
    "expiry_date",
    "quantity_received",
    "quantity_remaining",
    "supplier",
    "invoice_ref",
    "unit_cost_rwf",
    "accounting_status",
    "erpnext_ref",
  ]),
};

/** Columns required for INSERT when row does not exist (update-only otherwise). */
export const REQUIRED_FOR_INSERT = {
  flock: ["breed_code", "placement_date", "initial_count"],
  farm_supplier: ["name"],
  farm_barn: ["name"],
  feed_log: ["flock_id", "feed_kg", "entered_by_user_id"],
  mortality_log: ["flock_id", "count", "laborer_id"],
  slaughter_record: ["flock_id", "birds_slaughtered", "avg_live_weight_kg", "entered_by_user_id"],
  farm_treatment: [
    "flock_id",
    "disease_or_reason",
    "medicine_name",
    "dose",
    "dose_unit",
    "route",
    "administered_by_user_id",
  ],
  feed_inventory_transaction: [
    "transaction_type",
    "quantity_kg",
    "delta_kg",
    "actor_user_id",
  ],
  farm_medicine_lot: ["medicine_id", "lot_number", "quantity_received"],
};

export const INBOUND_ERPNEXT_ENTITY_TYPES = Object.keys(INBOUND_ALLOWED_COLUMNS);

export function normalizeMasterName(name) {
  return String(name ?? "")
    .trim()
    .replace(/\s+/g, " ")
    .toLowerCase();
}

export function isUuidString(val) {
  return typeof val === "string" && UUID_RE.test(val);
}

function pickIsoDate(val) {
  if (val == null || val === "") return undefined;
  const s = String(val).trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  const d = new Date(s);
  if (!Number.isNaN(d.getTime())) return d.toISOString().slice(0, 10);
  return undefined;
}

function pickTimestamp(val) {
  if (val == null || val === "") return undefined;
  const d = new Date(String(val));
  if (!Number.isNaN(d.getTime())) return d.toISOString();
  return undefined;
}

function stripToAllowed(entityType, row) {
  const allowed = INBOUND_ALLOWED_COLUMNS[entityType];
  if (!allowed) return {};
  const out = {};
  for (const [k, v] of Object.entries(row)) {
    if (!allowed.has(k) || v === undefined) continue;
    out[k] = v;
  }
  return out;
}

function mapFlockInbound(payload) {
  const row = {};
  if (payload.code != null) row.code = String(payload.code);
  if (payload.breedCode != null) row.breed_code = String(payload.breedCode);
  if (payload.breed_code != null) row.breed_code = String(payload.breed_code);
  if (payload.placementDate != null) row.placement_date = pickIsoDate(payload.placementDate);
  if (payload.placement_date != null) row.placement_date = pickIsoDate(payload.placement_date);
  if (payload.initialCount != null) row.initial_count = Math.floor(Number(payload.initialCount));
  if (payload.initial_count != null) row.initial_count = Math.floor(Number(payload.initial_count));
  if (payload.targetWeightKg != null) row.target_weight_kg = Number(payload.targetWeightKg);
  if (payload.target_weight_kg != null) row.target_weight_kg = Number(payload.target_weight_kg);
  if (payload.hatcherySource != null) row.hatchery_source = String(payload.hatcherySource);
  if (payload.hatchery_source != null) row.hatchery_source = String(payload.hatchery_source);
  if (payload.barnNameId != null && isUuidString(String(payload.barnNameId))) {
    row.barn_name_id = String(payload.barnNameId);
  }
  if (payload.status != null) {
    const s = String(payload.status);
    row.status = FLOCK_STATUS_IN[s] || String(payload.status).toLowerCase();
  }
  row.sync_source = "erpnext";
  return stripToAllowed("flock", row);
}

function mapNameMasterInbound(entityType, payload) {
  const name = payload.name != null ? String(payload.name).trim() : "";
  if (!name) return {};
  return stripToAllowed(entityType, {
    name,
    normalized_name: normalizeMasterName(name),
  });
}

function mapFeedLogInbound(payload) {
  const row = {};
  if (payload.flockId != null) row.flock_id = String(payload.flockId);
  if (payload.flock_id != null) row.flock_id = String(payload.flock_id);
  const ts =
    pickTimestamp(payload.recordedAt) ||
    pickTimestamp(payload.logDate) ||
    pickTimestamp(payload.recorded_at) ||
    pickTimestamp(payload.log_date);
  if (ts) row.recorded_at = ts;
  const kg = payload.feedKg ?? payload.feed_kg;
  if (kg != null && Number.isFinite(Number(kg))) row.feed_kg = Number(kg);
  if (payload.notes != null) row.notes = String(payload.notes).slice(0, 4000);
  if (payload.enteredByUserId != null) row.entered_by_user_id = String(payload.enteredByUserId);
  if (payload.entered_by_user_id != null) row.entered_by_user_id = String(payload.entered_by_user_id);
  if (payload.submissionStatus != null) row.submission_status = String(payload.submissionStatus);
  if (payload.erpnextRef != null) row.erpnext_ref = String(payload.erpnextRef);
  if (payload.erpnextSyncStatus != null) row.erpnext_sync_status = String(payload.erpnextSyncStatus);
  return stripToAllowed("feed_log", row);
}

function mapMortalityLogInbound(payload) {
  const row = {};
  if (payload.flockId != null) row.flock_id = String(payload.flockId);
  if (payload.flock_id != null) row.flock_id = String(payload.flock_id);
  const count = payload.deadCount ?? payload.count ?? payload.dead_count;
  if (count != null && Number.isFinite(Number(count))) row.count = Math.max(1, Math.floor(Number(count)));
  const ts =
    pickTimestamp(payload.at) ||
    pickTimestamp(payload.logDate) ||
    pickTimestamp(payload.log_date);
  if (ts) row.at = ts;
  if (payload.laborerId != null) row.laborer_id = String(payload.laborerId);
  if (payload.laborer_id != null) row.laborer_id = String(payload.laborer_id);
  if (payload.isEmergency != null) row.is_emergency = Boolean(payload.isEmergency);
  if (payload.notes != null) row.notes = String(payload.notes).slice(0, 4000);
  if (payload.submissionStatus != null) row.submission_status = String(payload.submissionStatus);
  if (payload.affectsLiveCount != null) row.affects_live_count = Boolean(payload.affectsLiveCount);
  if (payload.linkedCheckinId != null) row.linked_checkin_id = String(payload.linkedCheckinId);
  if (Array.isArray(payload.photos)) row.photos = JSON.stringify(payload.photos);
  row.source = payload.source != null ? String(payload.source) : "erpnext";
  return stripToAllowed("mortality_log", row);
}

function mapSlaughterInbound(payload) {
  const row = {};
  if (payload.flockId != null) row.flock_id = String(payload.flockId);
  if (payload.flock_id != null) row.flock_id = String(payload.flock_id);
  const birds = payload.birdsSlaughtered ?? payload.birds_slaughtered;
  if (birds != null) row.birds_slaughtered = Math.floor(Number(birds));
  const liveKg = payload.avgLiveWeightKg ?? payload.avg_live_weight_kg;
  if (liveKg != null) row.avg_live_weight_kg = Number(liveKg);
  const carcassKg = payload.avgCarcassWeightKg ?? payload.avg_carcass_weight_kg;
  if (carcassKg != null) row.avg_carcass_weight_kg = Number(carcassKg);
  const ts =
    pickTimestamp(payload.at) ||
    pickTimestamp(payload.slaughterDate) ||
    pickTimestamp(payload.slaughter_date);
  if (ts) row.at = ts;
  if (payload.reasonCode != null) row.reason_code = String(payload.reasonCode);
  if (payload.notes != null) row.notes = String(payload.notes).slice(0, 4000);
  if (payload.enteredByUserId != null) row.entered_by_user_id = String(payload.enteredByUserId);
  if (payload.erpnextRef != null) row.erpnext_ref = String(payload.erpnextRef);
  if (payload.erpnextSalesInvoice != null) row.erpnext_ref = String(payload.erpnextSalesInvoice);
  return stripToAllowed("slaughter_record", row);
}

function mapTreatmentInbound(payload) {
  const row = {};
  if (payload.flockId != null) row.flock_id = String(payload.flockId);
  if (payload.flock_id != null) row.flock_id = String(payload.flock_id);
  if (payload.medicineName != null) row.medicine_name = String(payload.medicineName);
  if (payload.diseaseOrReason != null) row.disease_or_reason = String(payload.diseaseOrReason);
  if (payload.reasonCode != null) row.reason_code = String(payload.reasonCode);
  if (payload.dose != null) row.dose = Number(payload.dose);
  if (payload.doseUnit != null) row.dose_unit = String(payload.doseUnit);
  if (payload.route != null) row.route = String(payload.route);
  if (payload.durationDays != null) row.duration_days = Math.floor(Number(payload.durationDays));
  if (payload.withdrawalDays != null) row.withdrawal_days = Math.floor(Number(payload.withdrawalDays));
  if (payload.notes != null) row.notes = String(payload.notes).slice(0, 4000);
  if (payload.administeredByUserId != null) row.administered_by_user_id = String(payload.administeredByUserId);
  const ts = pickTimestamp(payload.at) || pickTimestamp(payload.treatmentDate);
  if (ts) row.at = ts;
  if (payload.erpnextRef != null) row.erpnext_ref = String(payload.erpnextRef);
  return stripToAllowed("farm_treatment", row);
}

function mapInventoryTxnInbound(payload) {
  const row = {};
  if (payload.flockId != null) row.flock_id = String(payload.flockId);
  if (payload.transactionType != null) row.transaction_type = String(payload.transactionType);
  if (payload.transaction_type != null) row.transaction_type = String(payload.transaction_type);
  const ts = pickTimestamp(payload.recordedAt) || pickTimestamp(payload.recorded_at);
  if (ts) row.recorded_at = ts;
  const qty = payload.quantityKg ?? payload.quantity_kg;
  if (qty != null) row.quantity_kg = Math.abs(Number(qty));
  const delta = payload.deltaKg ?? payload.delta_kg;
  if (delta != null) row.delta_kg = Number(delta);
  if (payload.unitCostRwfPerKg != null) row.unit_cost_rwf_per_kg = Number(payload.unitCostRwfPerKg);
  if (payload.reason != null) row.reason = String(payload.reason).slice(0, 400);
  if (payload.reference != null) row.reference = String(payload.reference);
  if (payload.supplierName != null) row.supplier_name = String(payload.supplierName);
  if (payload.actorUserId != null) row.actor_user_id = String(payload.actorUserId);
  if (payload.feedType != null) row.feed_type = String(payload.feedType);
  if (payload.feedEntryId != null) row.feed_entry_id = String(payload.feedEntryId);
  if (payload.accountingStatus != null) row.accounting_status = String(payload.accountingStatus);
  if (payload.erpnextRef != null) row.erpnext_ref = String(payload.erpnextRef);
  return stripToAllowed("feed_inventory_transaction", row);
}

function mapMedicineLotInbound(payload) {
  const row = {};
  if (payload.medicineId != null) row.medicine_id = String(payload.medicineId);
  if (payload.medicine_id != null) row.medicine_id = String(payload.medicine_id);
  if (payload.lotNumber != null) row.lot_number = String(payload.lotNumber);
  if (payload.lot_number != null) row.lot_number = String(payload.lot_number);
  const recv = pickIsoDate(payload.receivedAt) || pickIsoDate(payload.received_at);
  if (recv) row.received_at = recv;
  const exp = pickIsoDate(payload.expiryDate) || pickIsoDate(payload.expiry_date);
  if (exp) row.expiry_date = exp;
  const qr = payload.quantityReceived ?? payload.quantity_received;
  if (qr != null) {
    row.quantity_received = Number(qr);
    if (payload.quantityRemaining == null && payload.quantity_remaining == null) {
      row.quantity_remaining = Number(qr);
    }
  }
  const rem = payload.quantityRemaining ?? payload.quantity_remaining;
  if (rem != null) row.quantity_remaining = Number(rem);
  if (payload.supplier != null) row.supplier = String(payload.supplier);
  if (payload.invoiceRef != null) row.invoice_ref = String(payload.invoiceRef);
  if (payload.unitCostRwf != null) row.unit_cost_rwf = Number(payload.unitCostRwf);
  if (payload.erpnextRef != null) row.erpnext_ref = String(payload.erpnextRef);
  return stripToAllowed("farm_medicine_lot", row);
}

/**
 * Map ERPNext outbound entity payload to Postgres column names (inbound only).
 * Strips desk-only keys; does not resolve FKs (see fkResolver.js).
 * @param {string} entityType
 * @param {Record<string, unknown>} payload
 */
export function mapInboundPayload(entityType, payload) {
  if (!payload || typeof payload !== "object") return {};
  switch (entityType) {
    case "flock":
      return mapFlockInbound(payload);
    case "farm_supplier":
      return mapNameMasterInbound("farm_supplier", payload);
    case "farm_barn":
      return mapNameMasterInbound("farm_barn", payload);
    case "feed_log":
      return mapFeedLogInbound(payload);
    case "mortality_log":
      return mapMortalityLogInbound(payload);
    case "slaughter_record":
      return mapSlaughterInbound(payload);
    case "farm_treatment":
      return mapTreatmentInbound(payload);
    case "feed_inventory_transaction":
      return mapInventoryTxnInbound(payload);
    case "farm_medicine_lot":
      return mapMedicineLotInbound(payload);
    default:
      return {};
  }
}

export function applyInsertDefaults(entityType, row) {
  const out = { ...row };
  if (entityType === "mortality_log") {
    if (out.photos == null) out.photos = "[]";
    if (out.source == null) out.source = "erpnext";
    if (out.is_emergency == null) out.is_emergency = false;
    if (out.submission_status == null) out.submission_status = "approved";
    if (out.affects_live_count == null) out.affects_live_count = true;
  }
  if (entityType === "feed_log" && out.submission_status == null) {
    out.submission_status = "approved";
  }
  if (entityType === "slaughter_record" && out.reason_code == null) {
    out.reason_code = "planned_market";
  }
  if (entityType === "farm_treatment") {
    if (out.duration_days == null) out.duration_days = 1;
    if (out.withdrawal_days == null) out.withdrawal_days = 0;
    if (out.notes == null) out.notes = "";
  }
  if (entityType === "feed_inventory_transaction") {
    if (out.reason == null) out.reason = "";
    if (out.reference == null) out.reference = "";
  }
  return out;
}
