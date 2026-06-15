# Production connection — next steps (manual)

Repo tooling is in place. **Render env must be pasted manually** (see Hetzner `~/gitops/clevafarm-render.env`).

## Current production state (last checked)

| Check | Result |
|-------|--------|
| Farm API deploy (clevafarm routes) | OK — `/api/entities/flock` responds (not 404) |
| Hetzner `clevafarm_api_secret` | **Configured** on ERPNext |
| Hetzner `pause_scheduler` | **Unpaused** (0) |
| Hetzner `farm_manager_dashboard_url` | `https://farm.clevacredit.com` |
| ERPNext `farmapi@clevacredit.com` API key | **Created** — copy from ERPNext User → API Access |
| Render `CLEVAFARM_API_SECRET` | **Pending manual paste** — returns 503 until set |
| ERPNext `clevafarm_integration` receive | OK — secret auth works |

## What you must do now

### 1. Render environment (required)

SSH to Hetzner and open the prepared env file:

```bash
ssh deploy@178.105.103.228
cat ~/gitops/clevafarm-render.env
```

Copy **every line** into **Render → farm-manager-api → Environment**, then **Manual Deploy**.

Or from ERPNext repo (with Render API key):

```bash
RENDER_API_KEY=rnd_... bash production/scripts/sync-clevafarm-render-env.sh
```

### 2. Verify

```bash
CLEVAFARM_API_SECRET='<from clevafarm-render.env>' bash production/scripts/verify-clevafarm-connection.sh
```

Or locally:

```bash
cd server && npm run test:clevafarm
```

### 3. Backfill

```bash
DATABASE_URL=<prod> bash scripts/run-prod-backfill.sh --dry-run
DATABASE_URL=<prod> bash scripts/run-prod-backfill.sh
```

Or trigger ERPNext reconciliation pull on Hetzner:

```bash
docker compose -p erpnext-prod exec -T backend \
  bench --site erp.clevacredit.com execute clevafarm_integration.tasks.reconciliation_sync.run
```

See [INTEGRATION.md](./INTEGRATION.md) for full reference.
