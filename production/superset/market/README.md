# Market Command Center (Superset)

Barn Trends use ERPNext → Superset. **Market Analytics** reads **Farm Postgres** (`pipeline_*`, `market_*`, `people_onboarding`, `signup_attempts`, `market_reach`).

## 1. Connect Farm Postgres

In Superset → Settings → Database connections → **+ Database**:

- Name: `Cleva Farm Postgres`
- SQLAlchemy URI: `postgresql+psycopg2://USER:PASSWORD@HOST:5432/DBNAME`
- Enable **SQL Lab** and **Allow DML** off
- Expose schemas with market tables

Note the numeric **database id** (API `/api/v1/database/`).

## 2. Provision datasets + dashboards

Attach Superset to the Farm Postgres Docker network (`farm-postgres`), then run:

```bash
cd server
SUPERSET_URL=https://bi.clevacredit.com \
SUPERSET_USERNAME=admin \
SUPERSET_PASSWORD=… \
SUPERSET_FARM_SQLALCHEMY_URI='postgresql+psycopg2://clevafarm:PASS@farm-postgres:5432/clevafarm' \
node scripts/provisionMarketSuperset.js
```

This creates the Farm Postgres connection (if missing), virtual datasets from SQL in this folder, charts, five embedded pack dashboards, and prints `MARKET_INSIGHTS_PACK_*` UUIDs:

| Pack | Slug |
|------|------|
| Overview | `cleva-market-overview` |
| Supply | `cleva-market-supply` |
| Demand | `cleva-market-demand` |
| Scouts | `cleva-market-scouts` |
| Sales | `cleva-market-sales` |
| Acquisition | `cleva-market-acquisition` |

**PWA wiring:** Market overview (`/dashboard/market`) stays native KPIs. Market trends (`/dashboard/market/trends`) embeds these packs via `/api/insights/market/*` (same pattern as farm Today → Trends).

## 3. Wire Farm API

Set on farmapi:

```
SUPERSET_URL=https://insights.example.com
MARKET_INSIGHTS_SUPERSET_URL=https://insights.example.com
SUPERSET_USERNAME=…
SUPERSET_PASSWORD=…
MARKET_INSIGHTS_DASHBOARD_UUID=<overview-or-mega-uuid>
MARKET_INSIGHTS_PACK_OVERVIEW=…
MARKET_INSIGHTS_PACK_SUPPLY=…
MARKET_INSIGHTS_PACK_DEMAND=…
MARKET_INSIGHTS_PACK_SCOUTS=…
MARKET_INSIGHTS_PACK_SALES=…
MARKET_INSIGHTS_PACK_ACQUISITION=…
```

Until these are set, Market → Analytics uses the **native** Command Center (same KPIs from `/api/insights/market/summary`).

## 4. Company bootstrap

`bootstrapMarketInsights` seeds pack prefs (and copies env dashboard UUIDs into `app_settings`) whenever the market host company is loaded, and farm packs when a company is created via ERP provision.
