# Butcher shop — plan

Households order chicken on market.cleva.rw. Partner butchers fill and deliver the order. Cleva takes the payment, keeps a commission, and pays the butcher. Cleva owns no stock.

No feature code is written by this file. Later phases follow it.

## Decisions already made

1. **Cleva collects the money.** The customer pays Cleva's MoMo number. Cleva pays the butcher after delivery, minus the commission. Butchers never take payment for shop orders.
2. **One price list.** Cleva sets every retail price. A butcher cannot change a price. Each butcher signs a contract that says the commission and when payouts happen.
3. **Sell by size, not by exact weight.** Items are fixed: for example, whole dressed chicken small, medium and large, each with a weight range and a fixed price. No re-weighing after the order, so no price changes at the door.
4. **No customer account.** Checkout asks for name, phone, sector and a delivery note. The customer gets an order reference and a private tracking link.
5. **Butchers log in.** There are few butchers and they are vetted, so each gets a user account with a new role `butcher`. Ops creates the account after the contract is signed.
6. **Delivery.** The customer pays a delivery fee for their zone. When the order total reaches the zone's free-delivery threshold, the customer pays no fee and Cleva pays the delivery cost out of its commission. In v1 the butcher delivers, by themselves or with a moto they arrange.
7. **Payment is confirmed by hand in v1.** This is the same flow as market bookings today (`POST /market/bookings/:id/pay` and `confirm-payment` in `server/src/routes/pipelineSettlementExtras.js`). The customer pays the number in the `market_cleva_momo` app setting and types the MoMo transaction ID. Ops checks it and confirms. A payment gateway comes later.
8. **Separate tables.** Shop orders do not go into `pipeline_lots` or `pipeline_matches`. Those are built for bird lots, business buyers and KYC-gated trading. `market_settlements.match_id` is `NOT NULL`, so shop money gets its own table too.

## Business numbers to set before launch

These are settings, not code. The values below are placeholders so the screens can be built.

| Setting | Placeholder | Who decides |
|---|---|---|
| Commission % | 12% | Founders |
| Minimum order | 2 chickens or 10,000 RWF | Founders |
| Free-delivery threshold per zone | 25,000 RWF | Founders |
| Delivery fee per zone | 1,500–2,500 RWF | Ops, after asking butchers and riders |
| Pay unpaid order within | 30 minutes | Ops |
| Butcher must accept within | 20 minutes | Ops |
| Payout timing | Daily, by MoMo | Founders and butchers |
| First zones | One area of Kigali | Founders |

Worked example with the placeholders: a customer orders 2 medium chickens at 8,000 RWF each. Subtotal 16,000 RWF, below the 25,000 threshold, so the customer pays 2,000 RWF delivery. Total 18,000 RWF. Cleva keeps 12% of 16,000 = 1,920 RWF. The butcher gets 14,080 RWF for the chicken plus the 2,000 RWF delivery fee. Commission is never taken on the delivery fee.

For a free-delivery order, the delivery cost Cleva pays comes out of Cleva's commission. Set the threshold so the commission at the threshold covers one trip: 12% of 25,000 = 3,000 RWF, which covers a 2,000–2,500 RWF trip.

## Phase 0 — manual pilot (no code, start now)

Run this while Phase 1 is built. It tests the price, the minimum, the threshold and butcher reliability with real customers.

1. Sign 2–3 butchers in one zone. Use a paper or PDF version of the butcher agreement (see section 7).
2. Publish a short price list (3–5 items) on WhatsApp Business and as a pinned post.
3. Orders come in on WhatsApp. Ops writes each one in a shared sheet: ref, customer, phone, sector, items, total, MoMo ID, butcher, status, delivered time, problem.
4. The customer pays the Cleva MoMo number. Ops confirms the payment, then sends the order to the butcher on WhatsApp.
5. Pay butchers at the end of each day from the sheet.
6. After 2 weeks, review: orders per day, average basket, share above the free-delivery threshold, late or wrong orders per butcher, and real delivery cost.

The sheet columns are the same fields as `shop_orders` below, so the pilot data can be imported later.

## 1. Data model

One migration, `database/migrations/095_butcher_shop.sql`. Same style as the others: `CREATE TABLE IF NOT EXISTS`, an undo note at the top, nothing existing is changed except the role and contract checks in step 7.

**`shop_settings`** — one row (`id = 1`, like `seller_contract_settings`).
`commission_pct`, `min_order_rwf`, `min_order_items`, `pay_within_minutes`, `accept_within_minutes`, `is_open` (a switch to pause the shop), `closed_message`, `order_hours` (JSON, for example open 8:00–18:00 Kigali time).

**`shop_products`**
`id`, `sku` (unique), `name`, `name_rw`, `description`, `description_rw`, `weight_min_kg`, `weight_max_kg`, `price_rwf` (integer), `photo_url` (Cloudinary, already used through `services/pipeline/cloudinary.js`), `active`, `sort_order`, timestamps.
A price change edits the row. Orders keep their own copy of the price (see order lines), so old orders do not change.

**`shop_zones`**
`id`, `name` (for example "Kicukiro centre"), `district`, `sectors` (TEXT[] of sector names, checked against `rwandaLocations`), `delivery_fee_rwf`, `free_delivery_over_rwf`, `active`.
A sector belongs to at most one active zone. The server checks this when a zone is saved.

**`shop_butchers`**
`id`, `user_id` (unique, `users.id`), `shop_name`, `owner_name`, `phone`, `whatsapp`, `district`, `sector`, `address_note`, `licence_ref`, `licence_photo_url`, `momo_payout_phone`, `momo_payout_name`, `contract_id` (signed contract), `status` (`pending`, `active`, `paused`, `ended`), `notes`, timestamps.

**`shop_butcher_zones`** — which zones a butcher serves.
`butcher_id`, `zone_id`, `priority` (lower number is asked first). Primary key on the pair.

**`shop_orders`**
- `id`, `ref` (short public code, for example `CK-4F7Q`, unique)
- `track_token_hash` (hash of the private tracking token; the token itself is only in the customer's link)
- Customer: `customer_name`, `customer_phone`, `district`, `sector`, `address_note`
- `zone_id`, `butcher_id` (null until assigned)
- Money, all integer RWF and copied at order time: `subtotal_rwf`, `delivery_fee_rwf` (what the customer pays), `total_rwf`, `commission_pct`, `commission_rwf`, `butcher_payout_rwf` (subtotal minus commission, plus the delivery fee when the customer paid it), `delivery_paid_by` (`customer` or `cleva`), `cleva_delivery_cost_rwf` (what Cleva pays when delivery is free; filled in by ops)
- Payment: `payment_status` (`unpaid`, `pending`, `paid`, `refunded`), `payer_phone`, `momo_txn_id`, `paid_confirmed_by`, `paid_confirmed_at`
- `status` (see section 2), `problem_kind`, `problem_note`, `cancel_reason`
- Times: `placed_at`, `accepted_at`, `ready_at`, `out_at`, `delivered_at`, `cancelled_at`, `updated_at`
- Attribution: `source` and click ids, using `signupAttribution` the same way signups do

**`shop_order_lines`**
`order_id`, `product_id`, `sku`, `name`, `weight_min_kg`, `weight_max_kg`, `unit_price_rwf`, `qty`, `line_total_rwf`. The name, weights and price are copies, so a later product edit does not change the order.

**`shop_settlements`** — every money movement, like `market_settlements` but tied to an order.
`id`, `order_id`, `side` (`customer_in`, `butcher_out`, `delivery_out`, `refund`), `status` (`pending`, `paid`, `failed`, `cancelled`), `amount_rwf`, `method` (`momo`), `phone`, `reference`, `note`, `created_by`, `created_at`, `confirmed_by`, `confirmed_at`.

**`shop_order_events`** — audit trail: `order_id`, `actor_user_id` (null for the customer), `kind`, `from_status`, `to_status`, `note`, `created_at`. Every status change writes one row.

## 2. Order status

```
placed ──pay sent──► payment_pending ──ops confirms──► paid ──butcher accepts──► accepted
   │                       │                             │                           │
   └──timeout──► expired   └──ops rejects──► placed      └──no accept──► (ops reassigns)
                                                                                     ▼
                     delivered ◄── out_for_delivery ◄── ready ◄─────────────────── accepted

Any status before delivered ──► cancelled (ops only, with reason; refund if paid)
delivered ──► problem (customer or ops reports short, wrong or late) ──► resolved
```

Rules:
- An order is sent to a butcher only after it is `paid`. The butcher never sees unpaid orders.
- `placed` orders expire after `pay_within_minutes`.
- A `paid` order not accepted within `accept_within_minutes` shows as late on the ops page. Ops reassigns it.
- Only ops can cancel. A paid cancelled order creates a `refund` settlement that ops marks paid once the MoMo refund is sent.
- The status helper is a pure function in `server/src/services/shop/orderStatus.js` that takes the order, the actor and the action, and returns the next status or an error. All routes go through it.

## 3. Butcher assignment

v1 is simple and predictable:
1. Find the zone for the customer's sector. No zone means the sector is not served yet. Checkout says so and offers to leave a phone number for when it opens (stored as a `market_leads` row so it shows on the existing leads desk).
2. When the order is paid, take the zone's `active` butchers by `priority`. If there is exactly one, assign it. If there are several, assign the first one, and ops can change it.
3. Ops can reassign any order before `out_for_delivery`.

Later: rotate between butchers, skip a butcher who has too many open orders, and score butchers on late or problem orders.

## 4. Screens

All public pages live under `/market/shop`, which `isPublicMarketPath` in `web/src/lib/marketHost.ts` already treats as market pages. On market.cleva.rw, the market home (`PublicMarketPage`) gets a clear "Order chicken for home" entry.

**Customer (no login)**
- `/market/shop` — products, quantity, sector picker, running total, delivery fee or "free delivery" line, minimum order message. Kinyarwanda and English, using the same copy approach as `publicStoreCopy.ts`.
- `/market/shop/checkout` — name, phone (checked with `rwandaPhone`), sector, address note, review, place order.
- `/market/shop/order/:ref?t=token` — pay instructions (MoMo number and amount, as on the booking payment page), a field for the MoMo transaction ID, then live status. The token in the link is the only way to see the order.

**Butcher (login, role `butcher`)**
- `/market/butcher` — today's orders: new (accept), accepted (mark ready), ready (mark out), out (mark delivered). Each order shows items, sector, address note, customer phone and a WhatsApp button (`normalizeWhatsapp`).
- `/market/butcher/payouts` — delivered orders, what is owed, what was paid.
- Mobile first. Large buttons. The existing field-shell layout is the model.

**Ops (superuser, sales coordinator; `canAccessPipelineDesk`)**
- `/market/shop-desk` — tabs: payments to confirm, late to accept, in progress, problems, today's totals.
- `/market/shop-desk/order/:id` — full order, events, reassign, cancel, refund, record Cleva delivery cost.
- `/market/shop-desk/payouts` — per butcher: delivered and unpaid totals, "mark paid" with MoMo reference (creates `butcher_out` rows).
- `/market/shop-desk/settings` — products, zones, butchers and zone links, shop settings.

## 5. API

Public, in a new `server/src/routes/shopPublic.routes.js`, mounted under `/api/market/shop` next to `createPublicMarketRouter`. It uses the same `ipWindowRateLimitMiddleware`, with its own settings `rate_limit_shop_order_max` and `rate_limit_shop_order_window_ms`.
- `GET /catalog` — active products, zones (name, sectors, fee, threshold), minimums, open or closed.
- `POST /quote` — items and sector in, totals out. The same function prices the checkout, so the page and the server never disagree.
- `POST /orders` — creates the order, returns `ref` and the tracking link.
- `GET /orders/:ref?t=` — status and pay instructions. Returns only that order's customer-safe fields.
- `POST /orders/:ref/pay?t=` — records the MoMo transaction ID and moves the order to `payment_pending`.

Staff and butcher, in `server/src/routes/shop.routes.js`, mounted under `/api/shop` behind `requireAuth`:
- Butcher: `GET /butcher/orders`, `POST /butcher/orders/:id/accept|ready|out|delivered`, `GET /butcher/payouts`.
- Ops: `GET /desk/orders`, `GET /desk/orders/:id`, `POST /desk/orders/:id/confirm-payment|reject-payment|assign|cancel|refund|delivery-cost|resolve`, `GET /desk/payouts`, `POST /desk/payouts/:butcherId/pay`, and CRUD for products, zones, butchers and settings.

Every handler checks the role on the server before reading rows. A butcher can only read and change orders where `butcher_id` is their own `shop_butchers.id`.

Pricing lives in `server/src/services/shop/shopQuote.js` as a pure function: products, quantities, zone and settings in; subtotal, fee, total, commission and payout out. All integer RWF. Commission rounds to the nearest franc. This is the most important file to test.

## 6. Notifications

Today `marketNotify.js` only sends email, and most customers and butchers here use phones. v1:
- The ops desk refreshes every 30 seconds and shows a count of payments waiting and orders late.
- The butcher page refreshes every 30 seconds and plays a sound on a new order.
- Order pages have one-tap WhatsApp buttons with a pre-filled message (customer to Cleva, ops to butcher, butcher to customer).
- Ops email for each new paid order through `sendMarketMail`, as a backup.

Later: SMS or the WhatsApp Business API from the CRM plan (`docs/crm/MASTER_PLAN.md`).

## 7. Butcher onboarding and contract

- Butchers come in through the existing recruitment desk. In the new migration, add `butcher` to the `want` check on `recruitment_contacts`, `seller_contract_templates` and `seller_contracts` (the last two come from `094_seller_contracts.sql`).
- Write `docs/butcher-contract-v1.md` next to the seller, buyer and scout agreements. It needs: Cleva sets retail prices; commission %; payout timing and method; butcher takes no payment for shop orders; size ranges must be met; hygiene and licence duties; handling of short or wrong orders and refunds; customer data used only to deliver that order; how either side ends the agreement. **A lawyer reads it before use.**
- KYC requires a trading or hygiene licence photo before `status` can be set to `active`.
- After signing, ops creates the user with role `butcher` (`AddUserForm`) and the `shop_butchers` row, then links zones.

## 8. Privacy

- A butcher sees the customer's name, phone and address note only for orders assigned to them, and only until 7 days after delivery.
- Customer phone and address are not shown on any public page. The tracking link shows the first name and sector only.
- Add a shop section to `PrivacyPage.tsx`: what is collected, why, who sees it, how long it is kept.
- Choose a retention period for customer details on old orders. Until then, nothing is deleted on a timer, as with contracts.

## 9. Files

Create:
- `database/migrations/095_butcher_shop.sql`
- `server/src/services/shop/shopQuote.js`, `orderStatus.js`, `assignButcher.js`, `orderRef.js` (ref and token)
- `server/src/routes/shopPublic.routes.js`, `server/src/routes/shop.routes.js`
- `server/tests/shop-quote.test.js`, `shop-order-status.test.js`, `shop-assign.test.js`, `shop-routes.test.js`
- `web/src/api/shop.api.ts`
- `web/src/pages/shop/` — `ShopPage.tsx`, `CheckoutPage.tsx`, `OrderTrackPage.tsx`
- `web/src/pages/butcher/` — `ButcherOrdersPage.tsx`, `ButcherPayoutsPage.tsx`
- `web/src/pages/market/shop/` — `ShopDeskPage.tsx`, `ShopOrderPage.tsx`, `ShopPayoutsPage.tsx`, `ShopSettingsPage.tsx`
- `web/src/lib/shopQuote.ts` (mirror of the server function for live totals) and `shopQuote.test.ts`
- `docs/butcher-contract-v1.md`

Edit:
- `server/server.js` — mount the two routers.
- `server/src/services/pipeline/pipeline.js` — add `isButcherRole`.
- `server/src/services/tenant/companyAdmin.js` — add `butcher` to `ALL_ASSIGNABLE_ROLES` so ops can create butcher users.
- `web/src/App.tsx` — routes. `web/src/auth/permissions.ts` and `types.ts` — the `butcher` role and what it may open.
- `web/src/lib/marketHost.ts` — butcher pages count as market pages on market.cleva.rw.
- `web/src/pages/public/PublicMarketPage.tsx` — entry to the shop.
- `web/src/lib/publicStoreCopy.ts` — shop copy. The unused `clevaDelivers`, `faqDeliveryQ` and `faqDeliveryA` keys can be reused here for delivery copy, which also fixes the failing copy test.
- `web/src/pages/public/PrivacyPage.tsx` — shop section.
- `web/package.json` and `server` test list — add the new tests.

## 10. Tests that must exist

Quote:
- Below the threshold the customer pays the zone fee; at or above it, the fee is 0 and `delivery_paid_by = cleva`.
- Commission is taken on the subtotal only, never on the delivery fee.
- Below the minimum order, the quote returns an error and no order is created.
- A sector with no active zone returns "not served".
- The web and server quote functions give the same result for the same input.

Status:
- A butcher cannot accept an unpaid order.
- A butcher cannot act on another butcher's order (server returns 404).
- Only ops can cancel; cancelling a paid order creates a pending refund.
- Every change writes one `shop_order_events` row.
- An unpaid order expires after `pay_within_minutes`.

Public:
- `GET /orders/:ref` without the right token returns 404, not 403, so refs cannot be checked by guessing.
- The public order response has no phone, no address note, and no butcher payout amount.
- Order creation is rate limited.

Money:
- For a delivered order: `customer_in` = `total_rwf`, and `butcher_out` = `butcher_payout_rwf`.
- A product price change after an order does not change that order's lines or totals.

## 11. Build order

1. Migration, quote, status and assignment helpers, with their tests.
2. Ops settings pages: products, zones, butchers. Load the pilot's real prices and zones.
3. Customer shop, checkout and tracking page, with manual payment confirmation on the ops desk.
4. Butcher page.
5. Payouts and the today's totals view.
6. Import the Phase 0 sheet so pilot orders are in the reports.

Steps 1–3 are enough to take real orders with ops calling the butcher. Step 4 removes that phone call.

## 12. Later, not in v1

- MoMo payment gateway so payments confirm themselves.
- SMS or WhatsApp Business notifications.
- Customer accounts, saved addresses, repeat orders.
- Scheduled delivery days for lower delivery cost.
- Butcher ratings and smarter assignment.
- Cleva-sourced chicken from the farm side (`pipeline_lots`) going to butchers, which joins this shop to the existing market.
- More products: eggs first, then other farm produce.
- Superset pack for shop numbers (orders, basket size, delivery cost share, butcher performance).
