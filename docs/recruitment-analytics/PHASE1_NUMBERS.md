# Phase 1 numbers

Written 2026-10-22. This file compares the old Recruitment counts with the new definitions. It does not invent a live total. A side-by-side against production needs the database after migration 087 is applied. The unit tests use made-up people and say so.

## What the old page counts

From the audit, for a selected day window:

| Old label | What it actually counts |
|---|---|
| Link opens | `market_reach` rows with `event_type = 'opened'` |
| “started joining” | `market_reach` rows with `event_type = 'join_started'` in the same window. Not a step after an open. |
| Accounts | Succeeded `signup_attempts` |
| Fail rate | Failed signup attempts divided by all attempts. Not KYC. |
| Sellers activated | Farmers created in the window who have any lot in the window |
| Sellers live and verified (new) | First lot that is `open` or `partial` and `verification_status = 'verified'` |
| Sellers live, not verified (new) | Same live statuses, verification `pending_review` or `rejected` |
| Scouts activated (old) | New scout onboarding rows who also scouted a lot in the window |
| Scouts activated (new) | Approved scout application and at least one verified lot |
| People in recruitment | Current `recruitment_contacts` stages, not limited to the date picker |
| Channel rate | Accounts divided by opens after both were grouped by a source string. This can exceed 100%. |

## Why the new numbers differ

1. **Two seller numbers.** The old “activated” count is “any lot in the window”. The new target uses live and verified only. Live but not verified is shown beside it and is not a second target.
2. **Opens and accounts are not divided into each other.** A channel conversion uses people attributed to that channel. If the channel has no link opens, the Opens cell is `n/a`.
3. **Cohort versus activity.** Funnels count people who joined in the range and reached a step within 14 days. Target cards count events in the current Monday–Sunday week in Africa/Kigali. The 7d/14d/30d control does not scale the weekly target.
4. **No negative days.** A listing dated before the account is counted under DQ-4 and left out of the median.
5. **Dead is not 0% in a 7-day window.** People younger than 14 days are “too early”.
6. **One person per phone.** Duplicate phones keep the earliest account. Extras are DQ-6.
7. **Internal and test accounts** matched by the demo email and name rules are excluded.
8. **Buyers are included.** Activation is a profile plus a first demand, lead, or match. The weekly buyer target is 8, which is already `newBuyersPerWeek` in the old settings. Until a row is saved in `recruitment_targets`, the page says it is using that recorded default.

## Worked example (synthetic, not production)

Two sellers join in the week of 19 Oct 2026. One has a verified live listing on 21 Oct. One is still at Applied since 18 Oct. One internal account is excluded.

The snapshot test expects: sellers live and verified = 1 of target 10, the click-through list length = 1, and reconciliation with no failed invariant. That example is in `server/tests/recruitment-analytics-metrics.test.js`. It is not a report of the live database.

## Not queried here

This phase did not run the view against a live database, so today’s old-versus-new row counts are not printed. After `087` is applied, the comparison query is:

```sql
SELECT role,
       COUNT(*) FILTER (WHERE activated_at IS NOT NULL) AS live_verified_people,
       COUNT(*) FILTER (WHERE live_unverified_at IS NOT NULL) AS live_not_verified_people
  FROM analytics.person_facts
 WHERE NOT is_internal
 GROUP BY role;
```
