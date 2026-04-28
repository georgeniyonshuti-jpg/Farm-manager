#!/usr/bin/env bash
# Run after bootstrap_ubuntu_mariadb_for_frappe.sh and with ~/frappe-bench ready.
# Usage:
#   export DB_ROOT='your-mariadb-root-password'
#   export ADMIN_PASS='your-desk-admin-password'
#   ./scripts/finish_bench_site.sh
set -euo pipefail
: "${DB_ROOT:?export DB_ROOT to MariaDB root password}"
: "${ADMIN_PASS:?export ADMIN_PASS to Administrator account password}"
export PATH="${HOME}/.local/bin:${PATH}"
BENCH="${FRAPPE_BENCH:-${HOME}/frappe-bench}"
SITE="${FRAPPE_SITE_NAME:-dev.local}"
cd "$BENCH"
bench new-site "$SITE" --admin-password "$ADMIN_PASS" --mariadb-root-password "$DB_ROOT"
bench --site "$SITE" install-app erpnext
bench --site "$SITE" install-app farm_manager
bench --site "$SITE" migrate
bench use "$SITE"
echo "OK. Now: cd $BENCH && bench use $SITE && bench start"
echo "Open: http://$SITE:8000"
