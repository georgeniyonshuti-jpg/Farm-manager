# Phase 0 — repo audit

Read-only findings for the Cleva Market repo. Frappe CRM is not in this repository.

## 1. Stack

- API: Node.js, Express, ESM. Entry `server/server.js`. Package `server/package.json`. Tests: `npm test` in `server/` (`node --experimental-strip-types --test tests/*.test.js`).
- Web: React + Vite + TypeScript. `web/package.json`.
- Local run is the existing farm API plus Vite app. This audit did not start them.

## 2. Database

PostgreSQL. Schema changes are numbered SQL files in `database/migrations/`. `server/migrate.js` applies them on startup. There is no ORM. Next file at the time of this audit is `080_crm_bridge.sql`.

## 3. Auth and roles

Session token after signup or login. Roles used by the market include `superuser`, `sales_coordinator`, `vet` (scouts), `vet_manager`, `manager`, `company_admin`, `buyer`. Desk access is `canAccessPipelineDesk` in `web/src/auth/permissions.ts` (`superuser` and `sales_coordinator` only). There is no `marketer` role. Scouts are `vet` users with pipeline page access (`canScoutPipeline`).

## 4. Market records

| Record | Where | Notes |
|---|---|---|
| `market_leads` | `database/migrations/065_public_market.sql` | Guest requests. Ops converts them. |
| `people_onboarding` | `database/migrations/079_signups_crm.sql` | After an account exists. |
| `scout_applications` | `database/migrations/077_scout_applications.sql` | Requires `user_id`. |
| `pipeline_buyers` | `database/migrations/061_poultry_supply_pipeline.sql` | Buyer CRM. |
| `pipeline_lots` | same | Public listing only after verify. Scout source stays off the shop until confirmed. |
| `farm_profiles`, `farm_visits` | storefront migrations and `pipelineStorefrontExtras.js` | Scout capture. |
| Commissions | `064_market_bookings_commissions.sql` | After a settled trade. |

## 5. Districts and phones

Districts are text, checked in the UI against `web/src/lib/rwandaLocations.ts`. There is no scout-to-district coverage table. A scout application stores one district. Phones are stored as entered text. `web/src/lib/marketWhatsapp.ts` normalizes to digits without a leading `+`.

## 6. ERPNext

Accounting sync and an iframe desk: `web/src/pages/farm/ERPNextEmbedPage.tsx`, `server/src/routes/erpnext.routes.js`. OAuth currently treats ERPNext as the identity provider (`web/src/auth/ERPNextOAuth.tsx`). Do not send market staff there for WhatsApp.

## 7. Signup

`POST /api/auth/signup` in `server/src/routes/saasRoutes.js`. Page: `web/src/pages/SignupPage.tsx`. Market invites already use a hashed single-use token (`076_seller_claim_tokens.sql`, query `claim=`). CRM signup links should use `t=` on the same `/signup` page, not a new `/join` path.

## 8. Jobs

No queue library. `server/server.js` uses `setInterval` (ERPNext outbox about every 45 seconds). CRM delivery should use the same pattern. The older outbox shape is `database/migrations/036_odoo_sync_outbox.sql`.

## 9. Conventions

Routes live in `server/src/routes/`. Pipeline domain logic lives in `server/src/services/pipeline/`. Tests are `node:test` files under `server/tests/`. Secrets are environment variables documented in `server/.env.example`. Feature flags are env booleans such as `CLEVA_SSO_ENABLED`.

## 10. Navigation

Desk links: `web/src/components/layout/SidebarNav.tsx` (Signups) and `web/src/components/layout/FieldShellBottomNav.tsx` (sales shell). Scout home: `web/src/pages/farm/ScoutHomePage.tsx`, route `/farm/pipeline/home`.

## 11. Hosting

The API comments mention Render (`RENDER_EXTERNAL_URL`). The web app is a separate frontend (`FRONTEND_URL`). ERPNext hosts referenced in env examples include `erp.clevacredit.com` and `cig.cleva.rw`. Whether those are Frappe Cloud or a self-hosted bench is not stated in this repo. Unknown.

## Mismatches with MASTER_PLAN.md

- Frappe CRM, Frappe WhatsApp, and `cleva_bridge` are not in this repo. They cannot be installed from here.
- Signup path is `/signup`, not `/join`.
- Buyer demand rows require an existing `pipeline_buyers` id. A new WhatsApp buyer becomes a `market_leads` row. A demand is created only when that buyer already exists.
- A scout application requires a user. A candidate with no account is a pending CRM link, not a `scout_applications` row.
- Scout district coverage does not exist. Assignment checks the scout application's district when one is stored. Staff still choose the scout.
- Phones in the new tables use E.164 (`+250…`). Older tables are unchanged.
- SSO into ERPNext is the reverse direction of the CRM launch. CRM launch is a separate short-lived JWT.

## Proposed locations

- `server/src/services/pipeline/crmBridge.js` — rules, HMAC, outbox, convert.
- `server/src/routes/crmBridge.routes.js` — internal HMAC routes and the staff launcher.
- Scout queue routes registered from `server/src/routes/pipeline.routes.js`.
- `database/migrations/080_crm_bridge.sql`.
- `server/tests/crm-bridge.test.js`.
- UI: Messages page for desk, My sellers on the scout home.

## Questions for the owner

Business hours, first-response target, languages, pilot staff, WhatsApp budget, and whether scouts should ever get a CRM login are still the open questions in MASTER_PLAN.md section 15. This slice does not guess them.
