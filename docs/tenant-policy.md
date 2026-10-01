# Tenant policy: default company and superuser

This document describes how Clevafarm separates **platform operators** from **tenant users**, and how the legacy **default company** anchor is used.

## Default company (`default-farm`)

| Property | Value |
|----------|--------|
| UUID | `00000000-0000-4000-8000-000000000001` |
| Slug | `default-farm` |

### Purpose

- Anchor for legacy single-tenant data migrated before multi-tenancy.
- Fallback `company_id` when backfilling rows that cannot be matched to a flock or user (see migration `054_inventory_company_id.sql`).
- **Not** used for new signups — Farm OS `/signup` creates a new company UUID. Marketplace `/signup?from=market` attaches the user to the host company (`MARKET_HOST_COMPANY_ID` / `cleva-technologies`), never to `default-farm`. If the host env is missing, market signup returns 503.

### Protections

- **Cannot be hard-deleted** via super-admin (`assertCompanyDeletable` rejects the default company id).
- **Do not assign** new tenant users to this company except for explicit superuser repair.
- Long-term: migrate remaining flocks into real tenant companies and treat default as read-only archive.

## Superuser (`role = superuser`)

### Purpose

Platform operator — cross-tenant administration, ERPNext company linking, company export/delete, and debugging.

### Anchoring

- Superusers are stored with `users.company_id` pointing at the default company (DB `NOT NULL` constraint).
- Tenant URL slug is **not meaningful** for superusers; they resolve any tenant slug in routing (`tenancy.ts`).

### Capabilities

- Cross-tenant read (bypasses `filterFlocksForUser`, `filterInventoryForUser`, SQL company filters).
- Super-admin panel (`/admin/super`).
- ERPNext company linking per tenant.
- Export and hard-delete tenant companies (with slug confirmation).

### Restrictions

- **Cannot self-signup** — only created by seed/migration or by an existing superuser.
- **Only superusers** may grant the `superuser` role (enforced in user creation handlers).
- Cross-tenant **mutations** should be audit-logged (`appendAudit`).
- Production: maintain seeded superusers via `REQUIRED_PRODUCTION_SUPERUSERS`, rotate passwords, enable MFA when available.

## Tenant roles

| Role | Scope | Notes |
|------|--------|--------|
| `company_admin` | Own tenant | Created at signup; full user management within company |
| `manager` | Own tenant | Operational lead |
| `vet`, `vet_manager`, etc. | Own tenant | Functional roles |
| `superuser` | Platform | Must not operate day-to-day farm data unless debugging |

Farm OS signup creates **`company_admin`**, not `manager`. Marketplace `from=market` sellers join the host as `manager` (list lots); buyers join as `role=buyer`. Welcome/onboarding gates include `company_admin`.

## Marketplace host tenant

Public `/market` and `/sell` guests stay leads. When they create an account with `from=market`, they become users on **one** host company (Cleva Technologies).

- Set `MARKET_HOST_COMPANY_ID` (UUID) or `MARKET_HOST_COMPANY_SLUG` (default `cleva-technologies`).
- Do **not** point the host at `default-farm`.
- Farm OS `/signup` (no `from=market`) still creates a farm company + trial.
- Desk (`superuser`, `sales_coordinator`) stays the only place that sees `market_leads`. Other farm companies cannot.

## Company lifecycle

### Trial

- New signups receive a **30-day trial** (`TRIAL_DAYS = 30` in `saasRoutes.js`).
- `GET /api/onboarding/status` exposes `trialDaysRemaining` and `trialEndsAt` for UI banners.
- Expired trial (`plan = 'trial'` and `trial_ends_at` in the past) redirects users to `/billing/trial-expired`.

### Extend trial (super-admin)

- `POST /api/super-admin/companies/:id/extend-trial` keeps the company on `plan = 'trial'` and pushes `trial_ends_at` forward (default 14 days, max 90).
- Use this for short grace when a prospect needs more time — it does **not** exit the trial.

### Set plan / Enterprise (super-admin)

- `POST /api/super-admin/companies/:id/set-plan` with `{ "plan": "enterprise" }` (also accepts `starter` / `pro` if active in `billing_plans`).
- Clears `trial_ends_at`, sets `is_active = true`, clears `payment_overdue`, and marks the billing subscription `active`.
- After this, trial expiry no longer applies (`trialExpired` stays false) and the trial banner disappears.
- Super-admin UI: **Make enterprise** button, or the per-row **Plan** selector.
- **Suspend** still applies for enforcement regardless of plan.

### Suspend

- Setting `companies.is_active = false` blocks API access for non-superusers (`403 Company suspended` in `requireAuth`).
- Suspend invalidates all active sessions for users in that company.

### Delete (super-admin)

Hard delete with safeguards:

1. Optional `GET /api/super-admin/companies/:id/export` — JSON bundle (meta, users without password hashes, flocks, inventory, vet summary).
2. `DELETE /api/super-admin/companies/:id` with body `{ confirmSlug: "<company-slug>" }`.
3. Blocked for default company.
4. Orchestrated in `companyDelete.js` (FK order, Stripe cancel if present).
5. In-memory caches scrubbed via `scrubCompanyFromMemory` in `server.js`.

## Feed stock isolation

After migration `054`, every `farm_inventory_transactions` row has `company_id`. All `/api/inventory/*` reads and writes are scoped by the authenticated user's company. Superuser is the only bypass.

Suppliers (`055_suppliers_company_id.sql`) are scoped per tenant in API responses.

## Poultry supply pipeline (platform desk)

See [`poultry-supply-pipeline.md`](./poultry-supply-pipeline.md) for the ops runbook.

### What is platform vs tenant

| Object | Scope | Notes |
|-------|--------|--------|
| `poultry_flocks` and farm ops data | Tenant (`company_id`) | Strict isolation; farmers never see other companies |
| `pipeline_lots` with `source = managed_flock` | Opt-in only | Created when a manager opts a flock in; desk may read across tenants |
| `pipeline_lots` with `source = scout` | Platform | Off-software farms; **no** `company_id` / billing / ERPNext |
| `pipeline_buyers`, `pipeline_demands`, `pipeline_matches` | Platform | Cleva ops CRM and matching — no buyer accounts |

### Who may access the desk

- **`sales_coordinator`** and **`superuser`**: full desk + buyer CRM (`/api/pipeline/*` desk routes).
- **`vet` / `vet_manager` / `manager` / `company_admin`**: scout capture and (managers) managed opt-in for **their** company only.
- Matches and lot status changes are audit-logged (`pipeline.match.*`, `pipeline.lot.*`).

### Account bootstrap (ops)

See the full table in [`poultry-supply-pipeline.md`](./poultry-supply-pipeline.md#account-setup-who-gets-what).

- Desk staff: create `sales_coordinator` with farm business unit; page access must include `farm_pipeline`.
- Scouts: `vet` on an ops/field company — not a login per off-platform farmer.
- Butchers: **no accounts** — Buyer CRM rows only.
- Paying farms keep normal tenant roles and only **opt in** flocks; they never browse other tenants.

### Isolation rules

1. Non-opted-in flocks remain invisible to the pipeline desk and to other tenants.
2. Scout lots must not be exposed as company-tenant data or require a SaaS plan.
3. Closing a **managed** match to `delivered` may create a `poultry_sales_orders` row for that flock; scout matches do not.
4. Do not add farmer-to-farmer browse of pipeline lots in v1.

## Recommended operations

1. **Never** put production tenant data on `default-farm` unless migrating legacy rows.
2. **One or few** superuser accounts; use `company_admin` for farm owners.
3. **Export before delete** when offboarding a customer.
4. **Suspend** instead of delete when payment is overdue — delete only after explicit offboarding.
