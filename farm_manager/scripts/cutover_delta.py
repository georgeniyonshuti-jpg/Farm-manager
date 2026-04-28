"""Run a delta-only Postgres -> ERPNext migration during the parallel-run window.

Usage:

    bench --site <site> execute farm_manager.scripts.cutover_delta.run \
        --kwargs "{'dsn':'postgres://...','phases':None}"

This is a thin wrapper around `migrate_from_postgres.run` that defaults to the
high-churn DocTypes (logs, events, sales, purchases). Each underlying migrator
is idempotent so re-running is safe.
"""
from __future__ import annotations

import argparse
import json

from farm_manager.scripts.migrate_from_postgres import (
	HIGH_CHURN_PHASES,
	run as _run_full,
)


def run(dsn: str, phases: list[str] | None = None, dry_run: bool = False) -> dict:
	phases = phases or HIGH_CHURN_PHASES
	return _run_full(dsn=dsn, dry_run=dry_run, only=phases, reset=False)


def _cli():
	parser = argparse.ArgumentParser(description="Cutover delta migration runner")
	parser.add_argument("--dsn", required=True)
	parser.add_argument("--site", required=True)
	parser.add_argument("--phases", nargs="+", default=HIGH_CHURN_PHASES)
	parser.add_argument("--dry-run", action="store_true")
	args = parser.parse_args()

	import frappe

	frappe.init(site=args.site)
	frappe.connect()
	try:
		out = run(dsn=args.dsn, phases=args.phases, dry_run=args.dry_run)
		print(json.dumps(out, indent=2, default=str))
	finally:
		frappe.destroy()


if __name__ == "__main__":
	_cli()
