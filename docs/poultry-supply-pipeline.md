# Broiler market (ops runbook)

**Job:** Anyone can browse live verified supply on the public market; guests request birds (ops leads); verified partners book instantly; scouts earn commission on delivered trades; Cleva ops verifies accounts/listings, triages leads, and marks commissions paid.

WhatsApp demand logging remains as a **legacy** ops tool — it is not the primary path.

## Public market surface

**Positioning:** Live broiler supply across Rwanda — booked through Cleva. Guests see the **Cleva buyer price** (landed RWF/kg + trip total). Not ecommerce: no guest checkout, cart, or MoMo.

| Actor | Can browse | Price shown | Book | Request birds |
|-------|------------|-------------|------|---------------|
| Guest | Yes (`/market`) | Cleva buyer landed (no farm-gate) | No | Yes → `market_leads` |
| Verified partner buyer | Yes (+ `/app/:slug/market`) | Same buyer landed; **server-locks** both sides | Yes | N/A |
| Prospective farmer | Sell page `/market/sell` | — | — | 3-field lead (`public_sell`) |
| Verified farmer | Share public ref | Own ask + rank preview | — | Listings UI |

**Never public:** farm name, phone, slug, `companyId`, flock id, farm-gate / `askPricePerKg`, take %, notes. Priced shop rows stay anonymous even if `visibility_tier = profile_public`. Identity after partner book / ops match only.

`disclose_exact_price` is unused — do not turn it on. Display is merchant-tier + buyer price, not a farmer toggle that would print farm-gate.

### Forward book (071)

Farmers can put **any-age** birds on a private Cleva book from chicks-in date. We suggest a selling week (placement + day 35–42) they can change. Copy on farmer/scout/public surfaces: chicks in, selling week, visit, average weight, on the book, live. Never “slaughter date” / harvest / farm-gate.

| Phase | Who sees it | Gate |
|-------|-------------|------|
| On the book | Farmer, ops, scouts | Listed; not weighed |
| Visit this week | Same | `ready_from` within 7 days |
| Weighed | Same | `scout_confirmed_at` set; not yet this/next week + rank |
| Live | Public `/market` + partner shop | verified + open + remaining + confirmed + this/next week + `rank_eligible` |

Market-only farmer lists (`source=scout`) always need a scout weigh. Cleva-run (`managed_flock` + `flock_id` + company verified) can treat a `weigh_ins` row + live count in the last 7 days as the confirm.

Scout pay: visit fee (fixed RWF) + existing trade %. Both can pay on the same flock.

### Offer pricing (070)

Three numbers, never mixed on the wire:

| Side | What | Who sees it |
|------|------|-------------|
| Farm-gate | Farmer ask + quantity-tier adj | Farmer + ops |
| Cleva buyer landed | Ask + butcher spread + tier adj + slaughter/delivery | Guest + partner |
| Weekly board “from” | Public index, not a shop sort | Everyone |

**Quantity tiers** (ops-editable on Rates): Kitchen 10–49 (+150 RWF/kg butcher), Shop 50–99, Usual 100–199, Load 200+. Ranked MOQ stays **50**; kitchens book/request at the Kitchen uplift, not the priced rank strip. Foodservice floor is 10 birds (not household 1–5).

**Logistics:** Live birds default to **buyer collect** after pay (Cleva connects farm only then). `delivery_actor` on matches: `buyer` | `farm` | `cleva` (distinct from merchant tier `cleva_run`). Farm delivery is a paid trip fee when the lot has `delivery_available`. Cleva delivery is ops-only — buyers can flag “need delivery help”; no self-serve live courier.

**Takes:** `commission_pct` = market-only (often 5). `cleva_run_commission_pct` = full-system (default 2). Take % stays off `/api/market/board` and public copy.

**Cleva-run** = `source = managed_flock` AND `flock_id` AND company `verified`. Benefits: lower take, 5% rank tolerance, in-rail price-only edits skip re-review. Farmer self-list is `source=scout` → market-only.

**Rails** (server, on create/edit): market-only `[board farm-gate × 0.95, × 1.08]`; Cleva-run `[× 0.92, × 1.10]`. Out of rail → `pending_review`, `rank_eligible = false`.

**Public rank** (`sort=price`, default): rank-eligible only; buyer landed RWF/kg for the requestor’s trip; Cleva-run may sit up to 5% above the cheapest eligible offer and still sort first at that band; then ready date, remaining birds. Cap **8** priced rows per trip bucket. Remainder: “More this week — request, we match” with no prices.

**Lock:** `POST /market/bookings` recomputes inside `FOR UPDATE` and **ignores client `agreedPricePerKg`** unless ops desk. Snapshot: `farm_gate_per_kg`, `buyer_price_per_kg`, `quote_json`; `agreed_price_per_kg` = buyer kg. Guest request stores a **buyer** `quote_json` only. Fulfillment variance checks the buyer lock.

### Public APIs (`/api/market`, no auth)

- `GET /lots` — ranked buyer offers (default `sort=price`); trip query `birds`, `avgKg`, slaughter/delivery; cap 8 priced rows; no farm object on priced rows
- `GET /lots/:publicRef` — single public card by human ref (`LOT-XXXXXX`)
- `GET /summary` — birds this/next/later week + districts (verified open only)
- `POST /requests` — guest buyer lead (honeypot + rate limit); write-only
- `POST /sell-requests` — guest seller lead (`source=public_sell`); write-only

### Lead lifecycle

`new` → `contacted` → `converted` | `spam` | `closed`

Ops **Convert** on a buy lead creates/reuses a `pipeline_buyers` row (`verification_status=pending`, `user_id=null`) and a `pipeline_demands` row (`channel=other`), then links `buyer_id`. Convert on a sell lead (`source=public_sell`) creates a scout lot (`company_id` NULL) in `pending_review`.

Managed flocks are **auto-drafted onto the forward book** from chicks-in (any age) as `pending_review` lots. They stay off the public shop until a scout weigh-in sets `scout_confirmed_at` **and** the selling week overlaps this or next week. Recording slaughter or a poultry sale refreshes or closes the open lot.

## Target flow

1. Guest browses `/market` or partner signs up (`accountType: farmer | buyer`) → pending verification.
2. Sales coordinator / superuser verifies company, buyer, and lots (`/market/verify`); triages `/market/leads`.
3. Farmer lists birds from chicks-in (`/market/listings`) onto the **forward book** (suggested selling week, no kg/ask on day one). Scout weigh-in confirms count + average kg. Ops verifies. Shop row appears only when confirmed + this/next week + rank rails.
4. Partner buyer books → `pipeline_matches` committed (atomic remaining-birds check). Guests request → lead queue.
5. After reserve + pay, buyer and farm **plan handover** (live/slaughter, collect vs farm delivery, `delivery_actor`, ready window) then **each confirm** actual birds / kg / price. One side cannot close the trade.
6. Conflicting numbers or a reported problem open an **exception** on `/market/jobs`. Ops settle, fail, or reopen. Birds return to the lot if the trade fails.
7. Scout pay is **two pots**: a fixed visit fee (`pipeline_scout_visit_fee_rwf`, default 5000) accrues on a valid weigh submit; trade % still accrues after both sides (or ops) settle. Ops mark each row paid on `/market/commissions`. No MoMo in v1.

## Account setup

| Actor | Role | How |
|-------|------|-----|
| **Market ops** | `sales_coordinator` | Admin → Users. Mobile shell: Desk · Market · Leads · Verify · Pay. |
| **Platform** | `superuser` | Same market powers on full manager chrome. |
| **Farmer** | `company_admin` / `manager` | Signup as farmer → company `verification_status=pending` → after verify: **My market listings** (shows live public ref). |
| **Buyer** | `buyer` | Signup as buyer → `pipeline_buyers` linked + pending → after verify: Market · Orders. |
| **Scout** | `vet` (+ managers) | Scout lots; **Commissions** strip (could earn / unpaid / paid MTD). |
| **CRM-only butcher** | — | Still addable in Buyer CRM without login (legacy); also via lead convert. |

## Roles (product surfaces)

| Role | App job |
|------|---------|
| Guest | Public `/market*`; request birds |
| `buyer` | Browse market; book; plan handover; confirm their side |
| `company_admin` / `manager` (verified) | List own lots; jobs inbox; confirm farm side |
| `vet` / scout | First-contact scout; **weigh queue**; visit fee + trade commissions |
| `sales_coordinator` / `superuser` | Leads; Verify; fulfillment jobs; payout ledger |

## APIs

### Public (`/api/market`)

See [Public market surface](#public-market-surface) above.

### Authenticated (`/api/pipeline`)

**Market**

- `GET /market/lots`, `GET /market/lots/:id`
- `POST /market/bookings` — atomic remaining birds; server-locks buyer + farm-gate (client price ignored unless ops)
- `GET /market/my-listings/rank-preview` — farmer rail + rank hint
- `GET/POST/PATCH /market/rates` — weekly card: bands, quantity tiers, dual take
- `GET /market/my-orders`, `POST /matches/:id/confirm` (one side), `POST /matches/:id/confirm-delivered` (legacy: buyer/farmer confirm their side; ops settles)
- `PATCH /matches/:id/logistics`, `POST /matches/:id/exception`, `POST /matches/:id/resolve-exception`, `POST /matches/:id/settle`
- `GET /market/jobs` — buyer/farmer own trades; ops open-exception queue
- `GET/POST /market/my-listings` — farmer self-serve list (placement / chicks-in → selling week; `rank_eligible` false until weigh)
- `GET /market/scout/weigh-queue` — booked lots due for a weigh visit
- `POST /market/lots/:id/weigh` — scout count + kg + outcome (`ready` / `slip_week` / `problem`)
- `PATCH /market/visit-fee` — ops-set visit fee
- `GET /market/my-listings/:lotId/bookings` — bookings on a farmer lot
- `PATCH /market/my-listings/:lotId` — edit (material changes → `pending_review` again)
- `POST /market/my-listings/:lotId/cancel` — cancel if no committed/delivered matches
- `GET /market/me` — verification gate status
- `GET /market/ops-summary` — desk: open birds, booked this week, unpaid commissions, new leads, **open exceptions**

**Ops**

- `GET /leads`, `PATCH /leads/:id`, `POST /leads/:id/convert`
- `GET /verify/queue`, `POST /verify/company|buyer|lot/:id`
- `GET /commissions/mine`, `GET /commissions`, `POST /commissions/:matchId/pay|void`
- `GET /forward-summary` — nation birds by week/district (buyers + ops; may include non-public lots — do not reuse for public)

**Legacy desk** (still available): buyers, demands, manual matches, scout/opt-in.

## Notifications & seller loop

Transactional email uses the same SMTP env as password reset (`SMTP_HOST`, `SMTP_USER`, `SMTP_PASSWORD`, `SMTP_FROM`). Best-effort: missing SMTP or send failures never fail the API.

| Event | Recipient |
|-------|-----------|
| Guest public request | Sales coordinators + superusers |
| Buyer books a lot | Lot `listed_by` and/or company admin/manager |
| Farm / buyer / lot verified | Farm admins, buyer user, or lot owners |
| Match delivered (commission accrued) | Scout (`commission_vet_user_id`) |
| Commission marked paid | Scout |

Farmers on **My listings** see **Live on public market · LOT-…** (shareable) or **Not public yet — awaiting review**, plus Bookings / Edit / Cancel.

Scout commission rate is editable in **Admin → Type settings** as `pipeline_scout_commission_rate_pct` (default 2). Public browse/request rate limits: `rate_limit_public_market_*`, `rate_limit_public_request_*`.

Coordinator desk strip shows open market birds, bookings this week, unpaid commission total, and **new leads**.

## Schema

- `061_poultry_supply_pipeline.sql` — lots, buyers, demands, matches
- `062_pipeline_lot_lifecycle.sql` — flock/lot cascade
- `063_marketplace_accounts.sql` — company/buyer/lot verification + `listed_by`
- `064_market_bookings_commissions.sql` — commission ledger + `pipeline_commission_payouts`
- `065_public_market.sql` — `pipeline_lots.public_ref`, `market_leads`
- `066_market_storefronts.sql` — farm profiles, media, visibility
- `067_market_fulfillment.sql` — logistics, dual confirm, exceptions
- `070_offer_pricing.sql` — quantity tiers, Cleva-run take, `rank_eligible`, two-sided book lock

## Commission rules (v1)

- Accrues only when **both sides confirm** or **ops settles** (match status `delivered`). A single Confirm tap does not pay scouts.
- Amount = `birds × weightKg × pricePerKg × rate%` (default rate from `app_settings.pipeline_scout_commission_rate_pct`, usually **2%**).
- Attribute to `commission_vet_user_id` (= lot `scouted_by` when set).
- Ops mark paid → payout history row; void with note.

## Smoke checklist

1. `curl /api/market/lots` unauthenticated → 200, no `companyId` / exact ask.
2. Guest **Request birds** → appears under **Leads**; email if SMTP set; rate limit → 429.
3. Ops **Convert** lead → buyer + demand.
4. Farmer signup → Verify queue → verify farm (farmer gets email if SMTP set).
5. Farmer **List birds** → ops approve lot → public ref live on `/market`.
6. Buyer signup → verify buyer → **Market → Book**.
7. Buyer and farm each confirm actuals (or ops settle on `/market/jobs`) → scout unpaid; ops **Mark paid**.

## Explicit non-goals

Guest checkout / cart / MoMo or card payment, named farm compare, per-lot custom 3-ask schedule, live-count requirement, auto-match engine, buyer-to-buyer messaging, WhatsApp bots, SMS/push, separate marketing domain.
