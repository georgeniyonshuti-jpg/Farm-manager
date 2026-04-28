# Farm Manager

Native ERPNext / Frappe custom app that brings the Farm Manager (poultry operations) domain into ERPNext as first-class DocTypes integrated with Stock, Accounts, Selling, Buying, HR/Payroll and Projects.

## Status

This app implements the plan in `farm_manager_native_erpnext_module` and replaces the legacy Node.js / Postgres `Farm Manager` codebase.

## Install

```bash
# from a Frappe bench
bench get-app farm_manager <git-url>
bench --site <site-name> install-app farm_manager
bench --site <site-name> migrate
```

### Local dev (Ubuntu, bench v15 + ERPNext v15)

After MariaDB, Redis, and a bench exist, add this app: copy the repo to `apps/farm_manager` (or `bench get-app` from a git URL) and add `farm_manager` to `sites/apps.txt` so Frappe can resolve `public/` for asset builds. Full bring-up: [docs/local_bench_setup.md](docs/local_bench_setup.md).

**Host one-shot (sudo):** [scripts/bootstrap_ubuntu_mariadb_for_frappe.sh](scripts/bootstrap_ubuntu_mariadb_for_frappe.sh)  
**Create site and install (after that):** [scripts/finish_bench_site.sh](scripts/finish_bench_site.sh) with `DB_ROOT` and `ADMIN_PASS` set.

## Modules

- Farms & Houses
- Flocks (lifecycle, breed standards, snapshots)
- Daily Operations (logs, check-ins, feed entries, weigh-ins)
- Health & Treatments (records, prescriptions, treatment rounds, medicine lots, biosecurity)
- Mortality / Slaughter
- Sales -> ERPNext Sales Order / Sales Invoice
- Buying -> ERPNext Purchase Order / Purchase Invoice
- HR & Payroll -> Per-flock cost allocation
- Accounting -> Auto Journal Entries to Cost Center per flock
- Projects -> Each flock cycle is a Project

## Data Migration

Legacy Postgres data is migrated via `farm_manager/scripts/migrate_from_postgres.py`. See `docs/migration.md`.

During the parallel-run / cutover window use the delta runner:
`farm_manager/scripts/cutover_delta.py`.

## Deployment

See `deploy/render/render.yaml` and `deploy/docker/` for production deployment artifacts. Detailed runbook in `docs/deployment.md`.

## Cutover

The end-to-end cutover playbook (parallel run, freeze, DNS switch, rollback, validation)
lives in `docs/cutover.md` and `docs/post_cutover_validation.md`.

## Architecture

See `docs/architecture.md` for the module map, DocType ER diagram, event flow, and permission model.

## License

MIT
