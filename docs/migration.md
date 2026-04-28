# Data Migration Guide

Migrating from legacy Farm Manager (Node.js + Postgres) to ERPNext + farm_manager.

## Prerequisites

1. ERPNext bench running with `farm_manager` installed.
2. A Frappe site created (e.g. `erp.local`).
3. Default `Company`, `Cost Center` parent, and `Item Group` "All Item Groups" present (provided by ERPNext setup).
4. Read-only Postgres user with access to legacy DB.

## Order of operations

1. Configure `Farm Manager Settings` (default warehouse, cost center, accounting accounts).
2. Run dry-run to estimate volumes:
   ```bash
   bench --site erp.local execute farm_manager.scripts.migrate_from_postgres.run \
     --kwargs "{'dsn': 'postgres://ro:secret@host:5432/farm', 'dry_run': True}"
   ```
3. Inspect output, fix mappings if needed.
4. Run full migration:
   ```bash
   bench --site erp.local execute farm_manager.scripts.migrate_from_postgres.run \
     --kwargs "{'dsn': 'postgres://ro:secret@host:5432/farm', 'dry_run': False}"
   ```
5. State file at `/tmp/farm_manager_migration.state.json` tracks completed phases for resumption.
6. Validate counts via the Flock Performance, Flock Mortality Trend reports.

## Validation checklist

- [ ] User counts match
- [ ] Flock counts match
- [ ] Daily log totals (sum of mortality, feed, water) match within rounding tolerance
- [ ] Medicine inventory `quantity_remaining` reconciles to ERPNext stock balance
- [ ] Flock P&L for each migrated flock is non-empty

## Known gaps

The following phases are stubs in the initial release and need site-specific completion:
`check_ins`, `feed_entries`, `weigh_ins`, `treatment_rounds`, `treatment_round_events`,
`health_records`, `prescriptions`, `mortality_events`, `slaughter_events`,
`biosecurity_audits`, `poultry_sales_orders`, `farm_purchases`, `laborer_assignments`,
`flock_payroll_allocations`, `medicine_lots`.

Each stub is implemented as a no-op in `farm_manager/scripts/migrate_from_postgres.py`
and has the table schema available; flesh out using the same pattern as `migrate_daily_logs`.
