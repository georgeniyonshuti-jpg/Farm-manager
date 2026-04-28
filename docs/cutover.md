# Cutover Runbook

Migrate from legacy Farm Manager (Node.js + Postgres on Render) to ERPNext + farm_manager.

The plan is to run both systems in parallel for ~1 week, then freeze the legacy app and switch DNS. Roll-back is supported until DNS TTL expires.

## T-7 days: Parallel run starts

- [ ] Production ERPNext deployed (see `docs/deployment.md`).
- [ ] First full migration completed (dry-run + real).
- [ ] Spot-check 5 random flocks: counts, mortality totals, FCR.
- [ ] Train 1-2 power users on Frappe Desk and the Farm Manager workspace.
- [ ] Daily delta migration scheduled at 02:00 (re-run only `daily_logs`, `feed_entries`,
      `weigh_ins`, `mortality_events`, `treatment_round_events`, `poultry_sales_orders`,
      `farm_purchases`).

## T-3 days: Final user training

- [ ] Each role (Farm Manager, Vet, Laborer, Accountant) does at least one task end-to-end on ERPNext.
- [ ] Verify mobile-friendly daily log submission via Desk on phones.
- [ ] Confirm broiler & investor PDFs print correctly from `Flock` form.

## T-1 day: Freeze announcement

- [ ] Announce 2-hour write freeze on legacy app for the next morning.
- [ ] Post-it notes / WhatsApp announcement to laborers.
- [ ] Confirm DNS TTL is reduced to 60 seconds the day before.

## T-0: Cutover Day

| Time   | Action                                                                                |
|--------|---------------------------------------------------------------------------------------|
| 06:00  | Set legacy app to read-only (toggle env var or disable POST routes).                  |
| 06:15  | Run final delta migration: `--only daily_logs feed_entries weigh_ins mortality_events poultry_sales_orders farm_purchases`. |
| 06:30  | Run validation queries (see Validation section below).                                |
| 07:00  | Update DNS: `farmmanager.<yourdomain>` -> ERPNext web service.                        |
| 07:30  | Smoke-test: login as 4 personas (manager, vet, laborer, accountant); record daily log; create sales order. |
| 08:00  | Send GO/NO-GO message to stakeholders.                                                |
| 08:00+ | Keep legacy app reachable on `legacy.farmmanager.<yourdomain>` for 7 days as fallback.|

## Rollback Plan

If a P1 issue is found before DNS propagation completes:

1. Revert DNS to legacy IP.
2. Re-enable writes on legacy app.
3. Hold any newly created ERPNext records under a `to_be_replayed` tag (see `farm_manager.utils.cutover.snapshot_new_records`).
4. Investigate, fix, schedule new cutover window (24-48 hours later).

If a P1 issue is found AFTER DNS propagation (legacy is no longer authoritative):

1. Hot-fix in ERPNext rather than roll back.
2. Use `frappe.db.transaction` patches to repair affected docs.
3. Communicate downtime via in-app banner.

## Validation Queries

Run these BEFORE pulling the trigger and again 24h AFTER cutover:

```sql
-- Flock counts must match
SELECT COUNT(*) FROM `tabFlock` WHERE status IN ('Active','Planned');
-- Compare with legacy
SELECT COUNT(*) FROM poultry_flocks WHERE status IN ('active','planned');

-- Daily log totals (last 30 days)
SELECT SUM(mortality), SUM(feed_intake_kg) FROM `tabFlock Daily Log`
  WHERE log_date >= CURDATE() - INTERVAL 30 DAY AND docstatus = 1;
-- Compare with legacy
SELECT SUM(mortality), SUM(feed_intake_kg) FROM poultry_daily_logs
  WHERE log_date >= CURRENT_DATE - INTERVAL '30 days';
```

Variances within ±0.5% are acceptable due to rounding and timezone. Larger variances must be investigated and replayed before going live.

## Post-Cutover Cleanup (T+30 days)

- [ ] Decommission legacy Render `farm-manager-api` service.
- [ ] Decommission legacy Postgres database (snapshot first to S3).
- [ ] Archive legacy code repo to `read-only` branch protection.
- [ ] Delete `Odoo Sync Outbox` style integrations - no longer needed.
- [ ] Remove `psycopg2-binary` from requirements (only needed during migration).
