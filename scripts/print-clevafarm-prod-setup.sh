#!/usr/bin/env bash
# Print Render + Hetzner config for ClevaFarm ↔ ERPNext prod connection.
# Does NOT write secrets to disk. Copy output into Render dashboard and site_config.json.
set -euo pipefail

SECRET="${CLEVAFARM_API_SECRET:-}"
if [ -z "$SECRET" ]; then
  SECRET="$(openssl rand -hex 32)"
  echo "# Generated new secret (set the SAME value on Render and Hetzner):"
  echo "CLEVAFARM_API_SECRET=$SECRET"
  echo ""
else
  echo "# Using CLEVAFARM_API_SECRET from environment"
  echo ""
fi

cat <<EOF
=== Render (farmapi.clevacredit.com) env vars ===
ERPNEXT_BASE_URL=https://erp.clevacredit.com
CLEVAFARM_API_SECRET=$SECRET
ERPNEXT_API_KEY=<from ERPNext User → API Access>
ERPNEXT_API_SECRET=<from same API key>
ERPNEXT_COMPANY=<exact Company name in ERPNext desk>

=== Hetzner site_config.json (sites/erp.clevacredit.com/) ===
{
  "clevafarm_api_secret": "$SECRET",
  "clevafarm_api_url": "https://farmapi.clevacredit.com",
  "farm_manager_dashboard_url": "https://farm.clevacredit.com"
}

=== After Hetzner site_config change ===
bench --site erp.clevacredit.com clear-cache
sudo supervisorctl restart all

=== Verify (from server/ with secret in .env) ===
npm run verify:migration-047
npm run test:clevafarm

=== Note ===
ERPNext at erp.clevacredit.com already expects clevafarm_api_secret (401 without it).
Either copy the EXISTING Hetzner secret to Render as CLEVAFARM_API_SECRET,
or replace BOTH sides with the secret above.
EOF
