# ERPNext outbound → Farm API inbound contract

ERPNext (`clevafarm_integration`) posts entity changes to Farm Manager via:

```
POST /api/webhooks/erpnext/entity
X-ClevaFarm-Secret: <shared secret>

{
  "entityType": "<registry type>",
  "event": "on_update",
  "payload": { "id": "<uuid or text pk>", ... }
}
```

Farm Manager maps payloads with **`mapInboundPayload`** (not naive `camelToSnake`). Only whitelisted Postgres columns are written. See [`server/src/services/clevafarm/inboundMappers.js`](../server/src/services/clevafarm/inboundMappers.js).

Cross-links: [`INTEGRATION.md`](./INTEGRATION.md) (architecture, secrets, health).

## Nine ERPNext outbound entity types

These are the entity types ERPNext currently pushes on desk save. Each must use a stable `payload.id` matching the Farm Postgres primary key (UUID or TEXT where noted).

| entityType | Postgres table | PK type | Insert policy |
|------------|----------------|---------|---------------|
| `flock` | `poultry_flocks` | UUID | Insert if required fields present |
| `farm_supplier` | `farm_suppliers` | UUID | Insert if `name` present |
| `farm_barn` | `poultry_barn_names` | UUID | Insert if `name` present |
| `feed_log` | `flock_feed_entries` | UUID | Requires `flock_id`, `feed_kg`, `entered_by_user_id` |
| `mortality_log` | `flock_mortality_events` | UUID | Requires `flock_id`, `count`, `laborer_id` |
| `slaughter_record` | `flock_slaughter_events` | TEXT | Requires flock, birds, weight, entered_by |
| `farm_treatment` | `flock_treatments` | TEXT | Requires flock, medicine, dose, route, admin user |
| `feed_inventory_transaction` | `farm_inventory_transactions` | UUID | Requires type, qty, delta, actor |
| `farm_medicine_lot` | `medicine_lots` | UUID | Requires `medicine_id`, `lot_number`, `quantity_received` |

**Update-only default:** If `payload.id` does not exist locally and required insert columns are missing, Farm API returns **422** (`MISSING_REQUIRED`) instead of a Postgres 500.

## Field mapping (ERPNext → Postgres)

### flock

```json
{
  "id": "a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11",
  "code": "FLOCK-001",
  "breedCode": "ROSS308",
  "placementDate": "2026-01-15",
  "initialCount": 5000,
  "status": "Active",
  "targetWeightKg": 2.4,
  "hatcherySource": "Kigali Hatch"
}
```

| ERPNext key | Postgres column | Notes |
|-------------|-----------------|-------|
| `code` | `code` | |
| `breedCode` | `breed_code` | Required on insert |
| `placementDate` | `placement_date` | ISO date; required on insert |
| `initialCount` | `initial_count` | Required on insert |
| `status` | `status` | `Active`→`active`, `Completed`→`archived`, etc. |
| `targetWeightKg` | `target_weight_kg` | |
| `hatcherySource` | `hatchery_source` | |
| `barnNameId` | `barn_name_id` | UUID only |

**Stripped (never written):** `name`, `flockLabel`, `label`, Frappe metadata.

### farm_supplier / farm_barn

```json
{ "id": "…", "name": "Agro Feed Ltd" }
```

| ERPNext key | Postgres column |
|-------------|-------------------|
| `name` | `name`, `normalized_name` (derived lowercase trim) |

### feed_log

```json
{
  "id": "…",
  "flockId": "<uuid>",
  "feedKg": 120.5,
  "logDate": "2026-02-01T08:00:00Z",
  "enteredByUserId": "<uuid>"
}
```

| ERPNext key | Postgres column |
|-------------|-------------------|
| `flockId` | `flock_id` |
| `feedKg` | `feed_kg` |
| `logDate` / `recordedAt` | `recorded_at` |
| `enteredByUserId` | `entered_by_user_id` |

**Not mapped:** `dead_count`, `flockLabel`, `name`.

### mortality_log

```json
{
  "id": "…",
  "flockId": "<uuid>",
  "deadCount": 3,
  "logDate": "2026-02-02T18:00:00Z",
  "laborerId": "<uuid>"
}
```

| ERPNext key | Postgres column |
|-------------|-------------------|
| `deadCount` or `count` | `count` |
| `logDate` / `at` | `at` |
| `flockId` | `flock_id` |
| `laborerId` | `laborer_id` |

Insert defaults: `photos = []`, `source = erpnext`, `submission_status = approved`.

### slaughter_record

```json
{
  "id": "sl-2026-001",
  "flockId": "<uuid>",
  "birdsSlaughtered": 200,
  "slaughterDate": "2026-03-01",
  "avgLiveWeightKg": 2.1,
  "enteredByUserId": "<uuid>"
}
```

Primary key is **TEXT** (`id` column), not UUID.

### farm_treatment

```json
{
  "id": "tx-2026-001",
  "flockId": "<uuid>",
  "medicineName": "Amoxicillin",
  "diseaseOrReason": "respiratory",
  "dose": 10,
  "doseUnit": "ml",
  "route": "water",
  "administeredByUserId": "<uuid>"
}
```

Primary key is **TEXT**.

### feed_inventory_transaction

Desk ledger rows may include `flockLabel`, `supplierName`, etc. Only inventory columns in `INBOUND_ALLOWED_COLUMNS` are persisted.

### farm_medicine_lot

```json
{
  "id": "…",
  "medicineId": "<uuid>",
  "lotNumber": "LOT-99",
  "quantityReceived": 50,
  "receivedAt": "2026-01-20",
  "expiryDate": "2027-01-20"
}
```

## Foreign key resolution

`*Id` fields may be:

1. **Postgres UUID** (preferred) — used as-is.
2. **ERPNext document name** — resolved via `farm_migration_map` (`erpnext_doctype`, `erpnext_name` → `legacy_id`).
3. **Flock code** — fallback `SELECT id FROM poultry_flocks WHERE code = $1`.
4. **Medicine name** — fallback on `medicine_inventory`.

If resolution fails → **422** `INVALID_FK` with `invalidFkFields`.

## Status enums (flock)

| Farm Postgres | ERPNext outbound |
|---------------|------------------|
| `active` | `Active` |
| `archived` | `Completed` |
| `planned` | `Planned` |
| `cancelled` | `Cancelled` |

Inbound accepts ERPNext labels and maps to Postgres via `FLOCK_STATUS_IN`.

## Error responses

| HTTP | code | When |
|------|------|------|
| 400 | — | Missing `entityType` or `payload.id` |
| 403 | — | Bad `X-ClevaFarm-Secret` |
| 422 | `MISSING_REQUIRED` | Insert attempted without required columns |
| 422 | `INVALID_FK` | Unresolvable `flockId`, `medicineId`, etc. |
| 422 | `INVALID_COLUMN` | Sanitized Postgres column error |
| 500 | — | Unexpected server error |

Failed inbounds are logged to `erpnext_sync_log` (`event_type = webhook_entity`, `status = failed`). Health: `GET /api/erpnext/health` → `inbound_failed_24h`.

## Loop guard

Inbound handler runs inside `withInboundSync()`. `emitEntitySync` does **not** enqueue outbound jobs during inbound writes. The route may enqueue `direction: inbound_logged` for audit only; the outbox worker processes **`direction = outbound'`** only.

## ERPNext-side recommendations

1. Send **Postgres UUIDs** in all `*Id` fields when possible.
2. Use **slim serializers** on ERPNext outbound (omit `name`, desk labels, Frappe internals).
3. For child records created on ERPNext desk, include full required fields or only update existing PWA rows by `id`.
4. Accounting webhooks (`purchase-invoice`, `sales-invoice`) use `farm_entity_id` as flock UUID — separate from `/entity` contract.

## Tests

Golden fixtures for all nine types: [`server/tests/clevafarm-sync.test.js`](../server/tests/clevafarm-sync.test.js).

```bash
cd server && npm test
```
