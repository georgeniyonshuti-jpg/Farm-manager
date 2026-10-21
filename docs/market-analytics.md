# Trends + Market Analytics

## Why Management → Trends can be empty

Farm Trends embeds Superset via ERPNext (`/api/insights/meta` → guest token). That requires:

1. `erpnext_config` for the company (`erpnextCompany` + base URL)
2. ERPNext Insights meta with Command Center dashboard UUIDs
3. Farm API ERP credentials (`ERPNEXT_API_KEY` / secret)

**Creating a company does not invent those UUIDs.** Pack prefs in `app_settings` only store which packs are enabled in the PWA.

For **cleva-tech** (market host), barn Trends often stay empty on purpose: there is little flock data, and marketplace metrics live under **Market → Analytics**.

Empty Trends now links to Market Analytics.

## Market → Analytics

- **Native Command Center** (default): `/api/insights/market/summary` aggregates Farm Postgres (GMV, match rate, supply/demand funnels, scouts vs expectations, app vs scout sales, settlements).
- **Superset embed** (optional): when `SUPERSET_*` + `MARKET_INSIGHTS_*` dashboard UUIDs are set, the same tab embeds Market Command Center packs.

### Packs

| Pack | Content |
|------|---------|
| Overview | GMV, match rate, sell-through, take rate, region liquidity |
| Supply | Seller funnel, sell-through, district supply |
| Demand | Buyer funnel, stages, district demand |
| Scouts | Leaderboard vs weekly expectations |
| Sales | App vs scout channel, settlement cycle times |

### Provision Superset (ops)

See [production/superset/market/README.md](../production/superset/market/README.md).

```bash
cd server
SUPERSET_URL=… SUPERSET_USERNAME=… SUPERSET_PASSWORD=… \
SUPERSET_FARM_DATABASE_ID=4 \
node scripts/provisionMarketSuperset.js
```

### Company bootstrap

- New companies from ERP provision get default **farm** pack prefs (`bootstrapFarmInsightsPacks`).
- Market host load seeds **market** pack prefs + copies env dashboard map (`bootstrapMarketInsights`).
