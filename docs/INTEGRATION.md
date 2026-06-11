# ClevaFarm ↔ ERPNext integration (`clevafarm_integration`)

Farm Manager (Node API + Postgres) is the source of truth for field operations. ERPNext hosts the management desk via the `clevafarm_integration` Frappe app. Data flows bidirectionally through a shared secret and a 23-type entity registry.

## Architecture

```
PWA field writes → Node API → Postgres
                              ↓ clevafarm_sync_outbox
                              → POST clevafarm_integration.api.webhooks.receive

ERPNext desk → POST /api/webhooks/erpnext/entity → Postgres (loop guard: no outbound echo)
ERPNext daily → GET /api/entities/:entityType?updatedSince= → reconciliation pull
```

## Shared secret

| Location | Key |
|----------|-----|
| ERPNext `site_config.json` | `clevafarm_api_secret` |
| Node API env | `CLEVAFARM_API_SECRET` |

All integration endpoints require header:

```
X-ClevaFarm-Secret: <same value>
```

In production, the Node API **fails closed** if `CLEVAFARM_API_SECRET` is unset.

## Environment variables (Node API)

```env
CLEVAFARM_API_SECRET=
ERPNEXT_BASE_URL=https://erp.clevacredit.com
ERPNEXT_SITE=          # optional multi-site bench
```

`ERPNEXT_BASE_URL` must match `clevafarm_api_url` / bench URL in ERPNext.

## Endpoints

### Outbound (Node → ERPNext)

Worker: `processClevaFarmOutbox` every ~45s.

```
POST {ERPNEXT_BASE_URL}/api/method/clevafarm_integration.api.webhooks.receive
Body: { "entityType": "flock", "event": "on_update", "payload": { "id": "...", ... } }
```

### Inbound entity upsert (ERPNext → Node)

```
POST /api/webhooks/erpnext/entity
X-ClevaFarm-Secret: ...

{ "entityType": "flock", "event": "on_update", "payload": { "id": "uuid", ... } }
```

Runs inside loop guard — no outbound enqueue for ERPNext-originated writes.

### Reconciliation pull

```
GET /api/entities/:entityType?updatedSince=2026-06-10T15:00:00Z
X-ClevaFarm-Secret: ...

Response: { "records": [ ... ] }
```

### Accounting webhooks (existing)

- `POST /api/webhooks/erpnext/purchase-invoice` — sets `opening_recorded` on flock when `farm_entity_id` present
- `POST /api/webhooks/erpnext/sales-invoice`
- `POST /api/webhooks/erpnext/payment-entry`
- `POST /api/webhooks/erpnext/loan-application`

Legacy Frappe HMAC (`x-frappe-webhook-signature`) is accepted when `ERPNEXT_WEBHOOK_SECRET` is set.

## Entity registry (dependency order for backfill)

1. `farm_company` → `companies`
2. `poultry_breed_standard` → `poultry_breed_standards`
3. `farm_barn` → `poultry_barn_names`
4. `farm_supplier` → `farm_suppliers`
5. `flock` → `poultry_flocks`
6. `farm_medicine_item` → `medicine_inventory`
7. `farm_medicine_lot` → `medicine_lots`
8. `feed_log` → `flock_feed_entries`
9. `feed_inventory_transaction` → `farm_inventory_transactions`
10. `mortality_log` → `flock_mortality_events`
11. `farm_checkin` → `check_ins` (photos excluded; `hasPhotos` flag only)
12. `farm_checkin_schedule` → `log_schedule`
13. `farm_treatment` → `flock_treatments`
14. `slaughter_record` → `flock_slaughter_events`
15. `daily_farm_log` → `poultry_daily_logs`
16. `farm_vet_log` → `farm_vet_logs`
17. `farm_treatment_round` → `treatment_rounds`
18. `farm_treatment_round_event` → `treatment_round_events`
19. `farm_weigh_in` → `weigh_ins`
20. `farm_valuation_snapshot` → `flock_valuation_snapshots`
21. `farm_payroll_impact` → `payroll_impact`
22. `farm_loan_application` → `farm_loan_applications`
23. `farm_migration_map` → `farm_migration_map`

## Loop guard

`AsyncLocalStorage` in inbound handlers sets `isClevaFarmInboundSync()`. `emitEntitySync` skips enqueue during inbound writes. Backfill uses `skipClevaFarmSync` or direct outbox enqueue without re-reading.

## Backfill

```bash
cd server && DATABASE_URL=... node ../scripts/backfill-clevafarm-sync.js --dry-run
node ../scripts/backfill-clevafarm-sync.js
node ../scripts/backfill-clevafarm-sync.js --since=2026-01-01T00:00:00Z
```

## Health / observability

`GET /api/erpnext/health` (authenticated) includes:

- `clevafarm_secret_configured`
- `outbox_pending`, `outbox_failed`, `last_outbound_success_at`

Logs: `[clevafarm-sync] direction=outbound|inbound entityType=... id=... status=...`

Postgres: `erpnext_sync_log`, `clevafarm_sync_outbox`  
ERPNext: Farm Sync Log desk

## Manual curl examples

```bash
# Reconciliation
curl -s -H "X-ClevaFarm-Secret: $SECRET" \
  "https://farmapi.clevacredit.com/api/entities/flock?updatedSince=2026-01-01T00:00:00Z"

# Inbound flock upsert
curl -s -X POST -H "Content-Type: application/json" -H "X-ClevaFarm-Secret: $SECRET" \
  -d '{"entityType":"flock","event":"on_update","payload":{"id":"...","status":"Active"}}' \
  https://farmapi.clevacredit.com/api/webhooks/erpnext/entity
```

## Troubleshooting

| Symptom | Check |
|---------|--------|
| 403 on webhooks | `CLEVAFARM_API_SECRET` matches ERPNext `site_config` |
| Outbox stuck | `SELECT * FROM clevafarm_sync_outbox WHERE status IN ('pending','failed')` |
| Loop / duplicates | Inbound writes should not enqueue outbound; verify Farm Sync Log direction |
| Missing entities | Run backfill; confirm migration `047_clevafarm_entity_sync.sql` applied |
