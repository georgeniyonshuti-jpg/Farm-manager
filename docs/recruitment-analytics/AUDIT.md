# Recruitment analytics audit

Phase 0, read-only. Written 2026-10-22.

This file records what the Insights → Recruitment page actually counts, why the numbers on the screenshot disagree, and how later phases should be built in this repo. It follows [SPEC.md](SPEC.md). No application code was changed to produce it.

The screenshot file named in the spec (`reference/current-recruitment-page.png`) was not in the repo. Findings use the numbers printed in SPEC section 4 and the current source. Those formulas explain the screenshot arithmetic. This audit did not re-query a live database, so today's row counts are not restated here.

## 1. Stack and commands

| Piece | What this repo uses |
|---|---|
| Layout | `web/` (React app), `server/` (API), `database/migrations/` (SQL). Root `package.json` calls into those folders with `npm run … --prefix`. Not an npm workspace. |
| Web | React 18.3, TypeScript 5.6, Vite 6, React Router 7.14, Tailwind 3.4 with CSS variables, custom components (no component kit), Recharts 2.15, TanStack Query 5, lucide icons. |
| API | Node.js, Express 4.21, plain JavaScript (ES modules), `pg` against PostgreSQL. No ORM. |
| Migrations | Numbered SQL files in `database/migrations/`, applied by `server/migrate.js`, tracked in `schema_migrations`. Latest at audit time: `086`. |
| Tests | Node's built-in test runner. No Jest or Vitest. |
| Lint / format | None. No ESLint, no Prettier. The web build runs `web/scripts/verify-design.mjs` and `tsc --noEmit`. |
| Auth | Bearer token in `localStorage`, server session. Recruitment page roles: `superuser` and `sales_coordinator`. |
| Feature flags | No flag table. Env vars only (`CRM_INTEGRATION_ENABLED`, `CLEVA_SSO_ENABLED`, `ENABLE_DEMO_USERS`, `VITE_API_MODE`). |
| Deploy | API on Render (`render.yaml`, service rooted at `server/`). Web served by nginx (`deploy/farm-web.nginx.conf`). No Dockerfile in the repo. |
| Charts elsewhere | Optional Superset embed at `production/superset/market/`. Recruitment today is native SQL, not a Superset chart. |

Commands:

| Job | Command |
|---|---|
| Web dev server | `npm run dev` |
| API dev server | `npm run dev:api` |
| Both | `npm run dev:all` |
| Apply migrations | `npm run migrate` |
| Server tests | `npm test` |
| Web tests | `npm test --prefix web` |
| Typecheck and production build | `npm run build --prefix web` |
| Lint | No command. Do not add a linter in an analytics phase unless asked. |

## 2. Where the page lives

| Concern | Path |
|---|---|
| Page | `web/src/pages/dashboards/MarketRecruitmentPage.tsx` |
| Route | `web/src/routes/PersistentAppPages.tsx` mounts it at `/dashboard/market/recruitment` for `superuser` and `sales_coordinator`. `web/src/App.tsx` also has a null stub route for the same path. |
| Nav | Insights lane in `web/src/components/layout/LaneNav.tsx` (Overview / Recruitment / Trends). |
| Client | `fetchRecruitmentSummary` and `fetchRecruitmentQueue` in `web/src/api/marketInsights.api.ts`. |
| API | `GET /api/insights/market/recruitment?days=` and `GET /api/insights/market/recruitment/contacts` in `server/src/routes/insights.routes.js`. |
| KPI SQL | `buildRecruitmentAnalytics` in `server/src/services/pipeline/marketRecruitment.js`. |
| Stage board | `listRecruitmentQueue` in `server/src/services/pipeline/recruitmentContacts.js`. |
| Targets | JSON blob `app_settings.setting_key = 'market_expectations'`. Defaults in `server/src/services/marketInsightsPacks.js` (`DEFAULT_MARKET_EXPECTATIONS`). Saved by `PUT /api/insights/market/expectations`. |

There is no child-component folder. Cards, the channel table, the scout board, and the targets modal are all inside `MarketRecruitmentPage.tsx`.

Access is not a dedicated analytics flag. The page is shown to pipeline-desk roles. `GET /market/recruitment` also allows manager-or-above. The contacts endpoint allows pipeline desk only.

## 3. Widget → query → tables

The range picker (7, 14, 30 days) is sent as `days`. Inside `buildRecruitmentAnalytics` it is clamped to 7–90. Almost every KPI uses `now() - (days || ' days')`. Link-open days use `CURRENT_DATE`, which is the database session's date, not an explicit `Africa/Kigali` date. Reach rows themselves are stored with a Kigali day (`marketReach.js`).

| Widget | What the screen shows | Where it is computed | Tables and fields |
|---|---|---|---|
| Link opens | Count, subtitle "N started joining" | `marketRecruitment.js` scorecard: `event_type = 'opened'` and `event_type = 'join_started'` | `market_reach` (`event_type`, `source`, `day`, `visitor_hash`) |
| Accounts | Succeeded signups, hint is fail rate | Same scorecard: `signup_attempts.outcome` | `signup_attempts` (`outcome`, `source`, `created_at`, `visitor_hash`, `utm_*`) |
| Sellers activated | `activated / target`, plus "N new" | Farmers in `people_onboarding` created in the window who also have a `pipeline_lots` row in the window, linked by farm owner, `created_by`, or `listed_by` | `people_onboarding`, `pipeline_lots`, `farm_profiles` |
| Scouts activated | `activated / target`, plus "N new" | Distinct `pipeline_lots.scouted_by` in the window, and that user is a new `people_onboarding` scout in the same window | `pipeline_lots`, `people_onboarding` |
| People in recruitment | Counts per stage | Second request. The page groups `queue.contacts` in the browser. The request does not send `days`. | `recruitment_contacts.stage` |
| Alerts | Stuck sellers, scouts below 40%, worst dead channel | Stuck sellers: all-time `people_onboarding` farmers in stages `new`, `contacted`, `call_booked`. Scout alert: leaderboard rows whose lots-vs-target tone is `danger`. | `people_onboarding`; scout query below |
| Channels table | Opens, accounts, sellers activated, dead %, days to list, first paid, scouts | One SQL statement joins six aggregates on the lowercased `source` string | `market_reach`, `signup_attempts`, `people_onboarding`, `pipeline_lots`, `farm_profiles`, `pipeline_matches` |
| Scout board | Lots, sellers, birds, vs target | All users with scout department, a scout application, or scout onboarding. Lots limited to the window. "Sellers" is `COUNT(DISTINCT contact_phone)`, not people. | `users`, `people_onboarding`, `scout_applications`, `pipeline_lots` |
| Apps pending / approved | Counts | `scout_applications.status`, all time, not the selected range | `scout_applications` |
| Unpaid | Count and RWF | `pipeline_matches` where `commission_status = 'accrued'` | `pipeline_matches` |
| Coverage gaps | Districts with demand and no scout lots | Open `pipeline_demands` vs scout lots in the last 30 days | `pipeline_demands`, `pipeline_lots` |
| Targets button | Modal | Reads and writes the one JSON setting. Does not keep history. | `app_settings` |

Buyers are computed (`newBuyers`, `buyersActivated`, per-channel `buyers`) and are not rendered, except as "New buyers / week" inside the targets modal.

`safeQuery` in `marketRecruitment.js` catches SQL errors, logs a warning, and returns no rows. A broken query can show zeros instead of an error.

## 4. Schema map (real names only)

Roles on `users.role` are staff roles (`superuser`, `sales_coordinator`, and others). Seller, buyer, and scout are not values of that column. Scout identity is `users.department_keys` containing `scout`, or a `scout_applications` row, or `people_onboarding.account_type = 'scout'`.

| Idea | Real place | Missing? |
|---|---|---|
| Staff user | `users` | Present |
| Seller / buyer / scout account | `people_onboarding.account_type` (`farmer`, `buyer`, `scout`) | Present. Source column defaults to `'unknown'`. |
| Signup attempt and UTM | `signup_attempts` (`source`, `utm_source`, `utm_medium`, `utm_campaign`, `click_id_kind` of `gclid` or `fbclid`, `visitor_hash`, `outcome`) | Present. No `ctwa_clid`. |
| Link open | `market_reach` (`opened`, `join_started`, `account_created`). Visitor id is SHA-256 hashed and not stored raw. Unique per visitor, event, source, and day. | Present |
| Recruitment work queue | `recruitment_contacts` plus `recruitment_touches`. Stage set: `application`, `call_scheduled`, `called`, `follow_up`, `kyc`, `active`, `unreachable`, `not_a_fit`. Phone stored as `phone_e164`. | Present |
| Signup desk stages | `people_onboarding.stage`: `new`, `contacted`, `call_booked`, `onboarded`, `active`, `unreachable`, `not_a_fit`. Touches in `onboarding_touches`. | Present. A different pipeline from `recruitment_contacts`. |
| KYC | Columns on `recruitment_contacts` (`kyc_contract_status`, `kyc_location_status`, `kyc_payment_status`, `kyc_identity_status`, and related fields). Not a separate table. | Present |
| Listing / lot | `pipeline_lots`. People columns: `created_by`, `listed_by`, `scouted_by`, `assigned_scout_user_id`, `verified_by`. `verification_status` is `pending_review`, `verified`, or `rejected` (default `verified`). Lifecycle `status` includes `draft`, `open`, `partial`, `matched`, `expired`, `cancelled`. | No `assisted` column. Assisted has to be derived. |
| Farm | `farm_profiles.owner_user_id` | Present |
| Order and payment | `pipeline_matches` (`buyer_payment_status`, `buyer_paid_at`, `farmer_payout_status`, `commission_status`, `commission_amount_rwf`) and `market_settlements` | "First paid" is not a column. |
| Flock | `poultry_flocks` (`placement_date`, `status`, `breed_code`, counts) | Present. Not used by the recruitment page. |
| Buyer demand | `pipeline_buyers`, `pipeline_demands`, `market_leads` | Present. Not shown on the page. |
| Scout approval | `scout_applications.status`: `pending`, `approved`, `rejected` | Present |
| Scout pay | `pipeline_matches.commission_*`, `pipeline_commission_payouts`, `farm_visits.fee_rwf` / `fee_status` | Present |
| Weekly targets | One JSON value in `app_settings` | No versioned table |
| Ad spend | — | Missing |
| Districts | Free-text `district` / `sector` on many tables. Allowed names live in `server/src/data/rwandaLocations.json` (and a web copy). | No districts table |
| Internal or test flag | — | Missing. `server/src/services/pipeline/demoCleanupClassifier.js` matches demo emails and names in code. |
| Person event ledger | `recruitment_touches` and `onboarding_touches` only | No append-only ledger of the spec's event types |
| Analytics view | — | No `CREATE VIEW` in the repo |
| Marketing tracked links | `signup_tracking_links` in `080_crm_bridge.sql` | That table is a CRM lead token (hashed token, lead name, expiry). It is not a channel / campaign link. |

Phone helpers already exist: `server/src/services/pipeline/rwandaPhone.js` and `web/src/lib/rwandaPhone.ts`. Recruitment contacts are the only table with a normalised `phone_e164` column.

## 5. How a channel is assigned today

Opens and signups do not share one rule, and the channel table does not join them by visitor.

1. **Opens** fire only when the public market page loads (`web/src/pages/public/PublicMarketPage.tsx` calls `recordMarketReach("opened")`). The source is whatever was in the URL or already stored in the browser (`web/src/lib/marketReach.ts`). An empty source is stored as `direct`.
2. **"Started joining"** fires when the signup page loads (`web/src/pages/SignupPage.tsx` calls `recordMarketReach("join_started")`). Same storage table, different event.
3. **Accounts** store `signup_attempts.source` from `resolveSignupSource` in `server/src/services/pipeline/signupAttribution.js`. `utm_source` wins, then `source`, then `from`, then click ids. If nothing matches, the value is `direct`.
4. **Sellers and scouts** use `people_onboarding.source`. The column default is `'unknown'` (`database/migrations/079_signups_crm.sql`). A row inserted without an explicit source stays `unknown`, even when the signup attempt was `direct`.
5. The channel SQL lowercases `source`, turns blanks into `direct`, and left-joins the aggregates on that string. `visitor_hash` is never used. Dividing accounts by opens can exceed 100% because they are different sets of rows.

Campaign links built for ads (`campaignSignupLinks`) point at `/signup?from=market&utm_source=…`, not at the public market page. A WhatsApp or Facebook click on those links counts as "started joining", not as an open.

## 6. Screenshot cross-checks (SPEC 4.2)

Not re-run on a database. The code makes the published arithmetic inevitable:

| Check | Why it adds up, and why it still misleads |
|---|---|
| Opens 40+1+3+3+2+0 = 49 | Channel opens are a split of the same `market_reach` opened count. |
| Accounts 3+11+2+0+0+0 = 16 | Same for succeeded `signup_attempts`. |
| Sellers activated 1+3+0+0+0+1 = 5 | Same for the lot-exists count, split by `people_onboarding.source`. |
| Scouts 1+2+1+0+0+0 = 4 | Those are new scout rows in `people_onboarding`, not "activated". |
| Seller percentages imply 2 + 8 + 6 = 16 sellers, and the card says 17 new | `accountToActivatedPct` divides activated sellers by that channel's farmer count when the farmer count is above zero (`sellers \|\| accounts` in `marketRecruitment.js`). The card's "17 new" is `people_onboarding` farmers in the window. 16 of them sit on Direct, WhatsApp, and unknown; the rest can sit on a channel whose activated count is 0, so they do not show up in that back-calculation. |
| Application 16 + Not a fit 1 = 17 | That is `recruitment_contacts`, current stock, all time. It is not the 17 new sellers. Matching 17 is a coincidence of two populations. |
| Accounts card is 16, not 17 | Accounts are succeeded signup attempts. Sellers are onboarding rows. They are not the same set. |

## 7. Findings F1–F12

| ID | Verdict | Cause in this code |
|---|---|---|
| F1 | Refuted as "all-time vs 7 days". Confirmed as two different events. | Both counts use the same day window (`marketRecruitment.js` scorecard). "49" is `opened` on the public market. "1019 started joining" is `join_started` on the signup page. They are not steps of one visit. Fix: label each event, and stop printing join-started as a subtitle of opens. |
| F2 | Confirmed. | Opens, accounts, and people are aggregated separately and joined on the source string (section 5). WhatsApp signup links do not create an "opened" row. Visitor hashes exist and are unused. Fix: one first-touch channel per person, carried from the tracked open into the account. Rates only inside that population. Channels with no opens show "n/a". |
| F3 | Confirmed as possible in the query. Row-level proof was not run. | Days to list is `AVG(first lot created_at − people_onboarding.created_at)` with no lower bound (`seller_act` in `marketRecruitment.js`). The first lot is the earliest lot linked by owner, `created_by`, or `listed_by`, including lots from before the account. A negative average is shown as-is (`-1.6d` on the screenshot). The `unknown` row has sellers and zero accounts because `people_onboarding.source` defaults to `unknown` while signup attempts default to `direct`. Fix: drop negative durations from the average, count them in data quality, and report assisted listings apart from self-serve. |
| F4 | Confirmed, and the two sides are different tables. | "5 sellers activated" means a lot exists. It does not read a stage. "16 at Application" is `recruitment_contacts`, unfiltered by the date picker. "16 sellers stuck early" is all-time `people_onboarding` stages `new`, `contacted`, `call_booked` (`stuckSellers` query). Creating a lot does not update either stage. KYC approval can move a recruitment contact to `active` (`recruitmentContacts.js`); a live listing cannot. Fix: derive the analytics stage from events, and auto-advance when a listing is live. |
| F5 | Confirmed for a 7-day range. | Dead requires `created_at` inside the selected window and older than `deadAfterDays` (default 14). Both cannot be true when the window is 7 days, so every dead % is 0. The flag is not "never set"; the filter makes it impossible. Fix: cohort age, and show "too early" when the window is shorter than the dead threshold. |
| F6 | Confirmed. Not one bug; three unlabelled states. | "4 new" = new scout onboarding rows. "0 / 2 activated" = those same new scouts who also `scouted_by` a lot in the window. "Approved 4" = all-time `scout_applications.status = 'approved'`. The board can show 0 lots because lots are windowed and the scout list is not. Fix: a scout funnel with plain labels (applied, approved, activated, productive). |
| F7 | Confirmed on the page. Data exists. | `pipeline_buyers`, `pipeline_demands`, and `market_leads` are real. The API returns buyer counts. The page never renders them. Fix: a buyer funnel and a supply-vs-demand view in later phases. |
| F8 | Resolved. | Fail rate is `failed signup_attempts / all signup_attempts` in the window (`pct(sc.failed, sc.attempts)`). It is not KYC. The label on the card does not say that. Fix: rename to "signup failed" and show "x of n", or drop it from the recruitment story. |
| F9 | Confirmed. | `accountToActivatedPct` uses that channel's farmer count as the denominator when it is non-zero, otherwise the account count. The cell prints `3 (37.5%)` and hides the 8. Fix: always print "x of n". |
| F10 | Confirmed in code. The screenshot was a 7-day range, so the scale factor was 1 and the card looked like a calendar week. | `weekScale = days / 7`, then `sellerTarget = newSellersPerWeek * weekScale`. Switching to 30 days multiplies the weekly target by about 4.3. The target is also not pinned to Monday–Sunday Africa/Kigali. Fix (decision D5): target cards always show the current calendar week. The picker does not change them. |
| F11 | Partly confirmed from code. Not checked in a browser. | The 7d/14d/30d control sits in the page header next to the Insights tabs (`MarketRecruitmentPage.tsx` header actions). The channel table sets `min-w-[720px]` inside a horizontal scroller, so a narrow screen scrolls the table. This page has no toast; a failed target save fails silently (`catch { /* keep open */ }`). A blue focus outline around the whole page was not found in this component. Re-check at 1440px and 390px in Phase 3. |
| F12 | Confirmed as a product fact. | At the screenshot's volume (about 17 new sellers), a percentage is a small sample. The page has no "small sample" state. Fix: names and counts first, rates second, with n and a Wilson interval once the metrics module exists. |

## 8. What is missing, and the smallest capture

| Gap | Smallest capture | When |
|---|---|---|
| One person across the two pipelines | Read-only view `analytics.person_facts`, one row per normalised phone and role. Stage from `recruitment_contacts`. Signup time and channel from `people_onboarding` and `signup_attempts`. Do not merge the tables in Phase 1. | Phase 1 |
| Opens stitched to accounts | The visitor hash already exists on both `market_reach` and `signup_attempts`. Phase 1 can report how often they match. Phase 2 copies first touch onto the account at signup. | Phase 1 report, Phase 2 write |
| Honest channel for WhatsApp shares | New `tracked_links` (code, channel, campaign, creative, role, destination). Do not reuse `signup_tracking_links`; that table is a CRM lead token. | Phase 2 |
| Scout referral | A code on the scout, stored as `referred_by_scout_id` when an account is created with it. | Phase 2 |
| "How did you hear about us?" | Optional `self_reported_source`. Never overwrites first touch. | Phase 2 |
| Ad spend | `ad_spend` (date, channel, optional campaign, amount RWF, who entered it, when). Manual weekly form. No Meta import yet. | Phase 2 |
| Targets that do not rewrite history | `targets` rows with `effective_from`. The existing Targets button writes a new row instead of replacing JSON. Keep reading the old JSON until the new table has a row. | Phase 2 |
| Stage history | Append-only `person_events`. Backfill timestamps that already exist (`created_at`, KYC reviewed times, `pipeline_lots.created_at`, `verified_at`, `buyer_paid_at`). Do not delete old rows. | Phase 2 |
| Auto-advance when a listing goes live | Analytics view derives it in Phase 1. Phase 2 writes an event so `recruitment_contacts.stage` moves forward and never backward automatically. | Phase 1 view, Phase 2 write |
| District spelling | Normalise free text through `rwandaLocations.json`. Unknowns stay "District unknown". A districts table is optional; the JSON file is already the list. | Phase 2 |
| Internal / test people | No column today. Phase 1 excludes rows the demo classifier would exclude, and says so. A real `is_internal` column can wait until someone needs to flag a person who does not match those patterns. | Phase 1 rule, column only if a person is wrongly included |
| Click-to-WhatsApp ad ids | Not possible yet. See section 9. | Do not build |
| Buyer weekly target | Already in code as `newBuyersPerWeek: 8`. Use 8. | Recorded, not a new table |

## 9. WhatsApp

The running app sends people to `https://wa.me/…` (`web/src/lib/marketWhatsapp.ts`, plus the same pattern in the signups desk and scout handoff). The official WhatsApp Business API is described in `docs/crm/MASTER_PLAN.md` and is not installed in this repo. Grep finds `ctwa_clid` only in docs and rules, not in tables or application code.

Consequence: a click-to-WhatsApp ad from Meta will not carry its referral id into Cleva until the official API is live. Do not scrape WhatsApp to work around that. Tracked links still work for messages and posts the team sends itself, because those links land on our signup page.

## 10. Decisions recorded

The owner answered two questions during planning. Everything else uses the spec default, or the value already in code when that value is more specific.

| ID | Decision | Recorded value |
|---|---|---|
| D1 | Seller activated | Show **two** numbers, never one blended number. **Live verified:** `pipeline_lots.status` is `open` or `partial`, and `verification_status = 'verified'`. **Live not verified:** same statuses, and `verification_status` is `pending_review` or `rejected`. `matched`, `expired`, `cancelled`, and `draft` are not "live". The schema comment says only verified lots in `open` or `partial` appear on the market. Today's "any lot in the window" count stays in the old-vs-new report so the difference is visible. |
| D2 | Buyer activated | Buyer profile exists (`pipeline_buyers`) and there is a first `pipeline_demands` row, a first `market_leads` row, or a first `pipeline_matches` row. Signup alone does not count. |
| D3 | Scout activated | `scout_applications.status = 'approved'` and at least one lot with `scouted_by` set and `verification_status = 'verified'`. "Approved" alone is not activated. |
| D4 | Week | Monday 00:00 through Sunday 23:59:59, Africa/Kigali. |
| D5 | Target cards vs the range picker | Target cards always show the current calendar week. The 7d/14d/30d picker does not scale them. |
| D6 | Stuck | Spec section 6.5 thresholds, editable later: seller 2 days at Applied without contact, 5 days at Contacted without KYC, 5 days at KYC without a live listing; buyer 3 days at Profile without contact; scout 3 days at Applied, 7 days at Approved without a first lot. |
| D7 | Dead | No activity for 14 days and not activated, or stage Unreachable / Not a fit. If the cohort is younger than 14 days, show "too early", not 0%. |
| D8 | Weekly targets | Sellers live-verified: 10. Scouts activated: 2. Buyers activated: 8 (already `newBuyersPerWeek` in code). Per scout: 8 lots, 4 sellers, 400 birds. The live-not-verified count is shown beside the seller target; it is not a second target unless the owner adds one. |
| D9 | Scout target scope | Per scout. |
| D10 | Who sees phone numbers | Pipeline desk (`superuser`, `sales_coordinator`) can reveal. Everyone else sees a mask. Reveal writes an audit event. There is no separate "recruiter" role; sales coordinator is that job in this app. |
| D11 | Ad spend entry | Ops lead, weekly, form on the dashboard. |
| D12 | Staff-created listings | Treat a lot as assisted when `created_by` or `listed_by` is set and is not `farm_profiles.owner_user_id`. Assisted durations stay out of "days to list" and are counted in data quality. |
| D13 | "11.1% fail rate" | Signup attempts that failed, divided by all signup attempts in the window. Not KYC. |
| D14 | Channel conversion window | 14 days from account creation. |
| D15 | Broiler cycle for forecasts | Leave forecasting off until Phase 6 checks real `poultry_flocks.placement_date` values. Do not invent a 5–7 week cycle in a chart. |
| People | Which row is the person | One fact row per normalised phone and role. Stage from `recruitment_contacts`. Signup time and channel from `people_onboarding` / `signup_attempts`. Owner confirmed this. |

## 11. Phase map (do not start these in the Phase 0 chat)

Metrics are pure functions in `server/src/services/recruitmentAnalytics/` (JavaScript, tested with `node --test`), because the API is not TypeScript. The new UI, when it comes, is `web/src/pages/dashboards/recruitment/` and reads one snapshot. Keep Recharts. Keep Tailwind tokens. Do not add a second chart library or a second styling system.

The new page stays off until Phase 8. Suggested switch: env `RECRUITMENT_ANALYTICS_V2` (default off), same pattern as `CRM_INTEGRATION_ENABLED`, plus a new route. Leave `MarketRecruitmentPage.tsx` mounted.

| Phase | What changes | Files to expect | Stop when |
|---|---|---|---|
| 1. Trust the numbers | Read-only `analytics.person_facts` over tables that already exist. Metrics module with definitions. Tests first. No UI. | New migration `database/migrations/087_…sql` (view only, reversible). `server/src/services/recruitmentAnalytics/` (`definitions`, funnel, stats, pace, stuck, channels). `server/tests/recruitment-analytics-metrics.test.js`. `docs/recruitment-analytics/PHASE1_NUMBERS.md`. | Tests pass. Old vs new for 7 days is explained, including any-lot vs live-verified vs live-not-verified. No negative duration in outputs. Rates cannot exceed 100%. |
| 2. Capture and snapshot | Tracked links, visitor stitch, scout codes, self-reported source, versioned targets, ad spend, `person_events`, district normalisation, one snapshot endpoint, people list using the same filter, `reconcile()`. | Next reversible migrations. Extend signup and reach write paths (`marketReach.js`, `signupAttribution.js`). New routes beside the old ones in `insights.routes.js`. Wire the existing Targets button to append a target row. | A tracked link survives into the account. Changing a target does not change past weeks. A live listing advances the derived seller stage. `reconcile()` reports pass or names the broken invariant. WhatsApp ads stay documented as unavailable. |
| 3. Command Center | New flagged route only. Shell, filter bar, headline, three target cards, two alerts, stage track, supply-vs-demand card (or a "not tracked yet" state), channel strip. | `web/src/pages/dashboards/recruitment/`, existing Tailwind tokens, route in `PersistentAppPages.tsx` behind the flag. Do not edit `MarketRecruitmentPage.tsx`. | Screenshots at 1440px and 390px. Every number has a definition and n. Live verified and live not verified are both visible. |
| 4. Funnels and Channels | Funnels per role, channel table with Unattributed pinned, Wilson intervals, spend form, link builder. | Same UI folder plus snapshot fields. | No rate over 100%. Opens are "n/a" when that channel has no link opens. Channel rows sum to the total. |
| 5. People and Scouts | Work queue, board, table, on the existing People desk's actions. Scout table normalised by tenure. Masked phones. | `recruitment_contacts` write paths and `web/src/pages/market/people/`. Server checks the role. | An action writes an event and the other tabs change with it. Reveal is audited. New scouts show "Ramping", not "Behind". |
| 6. Supply, demand, trends | Liquidity from `pipeline_lots`, `pipeline_demands`, and flocks if the dates support a forecast. Cohort triangle as a custom component, not a new chart library. | Snapshot extensions and tab components. | Below the sample thresholds, show counts and a reason. Forecast is labelled, or absent with a banner. |
| 7. Briefing | Slides from the same snapshot, frozen weekly JSON, PDF, WhatsApp text with no personal data. | Briefing route, print stylesheet. `jspdf` is already a web dependency; prefer a print stylesheet first, as the spec says. | Last week's numbers stay frozen. Slide numbers match the Command Center for that week. |
| 8. Launch | Speed, accessibility, mobile, privacy checklist, docs, then flip the flag. Old route stays as a fallback. | Indexes, cache, the flag default. | Measurements before and after. Rollback is flipping the flag off. |

Uncommitted work already in the tree (`web/src/pages/market/PersonPage.tsx`, `web/src/pages/market/people/peopleWork.ts`, `web/src/pages/market/people/peopleWork.test.ts`) is not part of this audit and was not changed.

## 12. Five things that matter most

1. The page adds up because each column is internally consistent. It contradicts itself because opens, accounts, sellers, and the stage board are four different sets of rows.
2. WhatsApp can show 1100% because accounts are divided by opens after the two have been grouped by a channel name, not by the same visitor.
3. "Activated" today means "some lot exists in the window". The owner wants two separate counts from here on: live and verified, and live but not verified.
4. The stage board (`recruitment_contacts`) and the "stuck sellers" alert (`people_onboarding`) are different pipelines. A live listing moves neither one.
5. Click-to-WhatsApp ads cannot be attributed until the official WhatsApp Business API is installed. Shares the team sends can be attributed with tracked links.

## 13. PRD v2 addendum (23 Oct 2026)

The command centre is now the page at `/dashboard/market/recruitment`. The old `MarketRecruitmentPage.tsx` was not edited. It is mounted at `/dashboard/market/recruitment-legacy`, and the header links there as “Previous version”. `recruitment-v2` redirects to the new page. The build flag `VITE_RECRUITMENT_ANALYTICS_V2` is gone. This reverses the Phase 8 line “the new page stays off until launch”, on purpose.

Facts that override the PRD where they disagreed:

- Buyers are a real count from `pipeline_buyers`, `pipeline_demands`, and `market_leads`. The Buyers tile says Unavailable only when that module’s query fails.
- “Sellers live” is the verified count. “+N not verified” is the context line, so both AUDIT D1 numbers fit in four tiles.
- The info drawer shows the definition, formula, source view, and as-of time. Superusers also see `SELECT * FROM analytics.person_facts`. Metric math stays in JavaScript.

New numbers:

- M3 Scouts producing: at least one verified lot in the current Kigali week. This is not the same as first-ever activation.
- M4 Passed probation, rolling 3 weeks: a seller whose first paid sale is within 21 days of going live, or a scout with at least 8 verified lots within 21 days of approval.
- T1 / T2 live in `recruitment_targets.tier` via migration `090_recruitment_target_tiers.sql`. That file is written and **not applied**. Until it runs, every existing row is treated as T1 and T2 stays hidden.

Reliability: each module uses a 3 second statement timeout on its own connection. One failure becomes Unavailable. A failed refresh keeps the last good snapshot and sets `stale: true`. `meta.durationMs` records how long the snapshot took. Serving tables were not built: the metrics test builds 40 people in under 2 seconds, and SQL is capped at 3 seconds. Build them only if a real view measures over 2 seconds.

Privacy: names and phones stay masked for anyone who is not the pipeline desk. Reveal is audited. Weekly notes reject text that looks like a phone number. WhatsApp copy uses the short headline and does not include a number.

