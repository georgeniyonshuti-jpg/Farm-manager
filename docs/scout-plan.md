# Nearby unconfirmed flocks — plan

Phase 1 plan. No feature code is written by this file. Later phases follow it.

## Decisions already made

1. **Placement.** Add the section on the person page, route `/farm/pipeline/people/:contactId`, file `web/src/pages/market/PersonPage.tsx`. Mount it only when `contact.want === "scout"`. The page edit is one import and one component mount.
2. **No account.** If `contact.userId` is missing, do not hide the section. Show this note and no list: "This scout has no user account yet, so flocks cannot be assigned." Do not call the list API.
3. **Permissions.** The nearby-flocks server function uses `canAccessPipelineDesk` (superuser or sales coordinator). That is the same helper as `POST /lots/:id/assign-scout`. Show the Assign button only when that helper is true. A sales officer can open the person page and can see the no-account note. A sales officer does not see the list or the button, because the server will not send them the rows.
4. **Scout location.** A scout has one district and one sector on `scout_applications`. Use that pair as the scout's single sector. `bestBandForScout` still accepts a list. Today the list has one item.
5. **Name matching.** The sector-center lookup trims names, lowercases them, and collapses repeated spaces. This happens only inside the lookup. Stored names are not changed. A flock whose sector is not on the map stays in the list with no center. See section 7.
6. **Identity.** See section 10.

## 1. Files to create

- `server/src/services/pipeline/sectorDistance.js` — pure band, km, sort, and overdue helpers. No database calls and no file reads.
- `server/tests/sector-distance.test.js` — the distance tests. `npm test` already runs `server/tests/*.test.js`.
- `server/src/services/pipeline/nearbyFlocks.js` — staff check, scout lookup, flock query, center lookup, sort, and the allow-listed response.
- `server/tests/nearby-flocks.test.js` — permission and shape tests with a fake `dbQuery`.
- `web/src/pages/market/people/NearbyUnconfirmedFlocks.tsx` — the section. Uses `SectionCard`, `DataTable`, `StatusPill`, `Button`, and `ConfirmDialog`.

## 2. Files to edit

- `server/src/routes/pipelineWeighExtras.js` — add `GET /scouts/:id/nearby-flocks`. This file cannot be avoided because the staff check has to run on the server before any flock row is read, and this file already owns that desk's routes (`/lots/:id/assign-scout` and the weigh queue). `registerPipelineWeighRoutes` is already mounted at `/api/pipeline`, so `server/src/routes/pipeline.routes.js` stays unchanged.
- `web/src/api/pipeline.api.ts` — add one fetch function next to `assignFlockScout`, calling `/scouts/:id/nearby-flocks`. This file cannot be avoided because every pipeline call from the browser goes through this wrapper (`pipelineFetch` to `/api/pipeline`). There is no other client for that API.
- `web/src/pages/market/PersonPage.tsx` — one import and one mount when `contact.want === "scout"`. This file cannot be avoided because it is the person page you chose, and the section does not appear there unless this page mounts it. Pass `contact.userId`, `canAccessPipelineDesk(user)`, and the existing `assignFlockScout`. Do not rewrite the page.

Insights, Recruitment analytics, and CRM files stay unchanged.

## 3. Data flow

The person page sees a scout. If there is no `userId`, it shows the no-account note and stops. If the viewer is not desk staff, it does not ask for the list. Otherwise it asks `GET /api/pipeline/scouts/:id/nearby-flocks` with the scout's `userId` (`users.id`), never the person-page `contactId`. The server checks `canAccessPipelineDesk` before any query. It loads that user's one sector from `scout_applications` (section 5). It queries unconfirmed, unassigned flocks in SQL. It attaches a sector center when the names match. The distance module adds a band and a hidden km value. Ready dates go through `kigaliDay` before overdue and before sorting (section 8). The server sorts, keeps 25, and returns only the allow-listed fields. The section renders the table. Assign calls the existing `assignFlockScout(token, flock.flockId, contact.userId)`.

## 4. Response shape

```ts
{
  scoutId: string
  totalCount: number
  sectorRecorded: boolean
  flocks: Array<{
    flockId: string
    sectorName: string
    districtName: string
    birdCount: number
    readyDate: string | null
    isOverdue: boolean
    band: "SAME_SECTOR" | "NEIGHBORING_SECTOR" | "SAME_DISTRICT" | "OTHER_DISTRICT"
  }>
}
```

`sectorRecorded` is false when this user has no usable sector (section 5). The UI then shows "No sector recorded for this scout" and no table. No km, phone, email, owner contact, or raw row. `flockId` is `pipeline_lots.id`. The Flock column and the confirmation text use that same id.

## 5. How the scout's sectors are determined

`GET /api/pipeline/scouts/:id/nearby-flocks` takes `userId` (`users.id`). It does not take `contactId` (`recruitment_contacts.id`).

Why: `scout_applications.user_id` is `users.id`, and `POST /lots/:id/assign-scout` also needs that same `users.id` as `scoutUserId`. A person-page contact id is not on `scout_applications`. Both ids are UUIDs, so the route must not treat a contact id as a user id.

After the staff check, and only if `:id` is a UUID, the sector query is:

```sql
SELECT district, sector
  FROM scout_applications
 WHERE user_id = $1::uuid
```

`$1` is the route `userId`. There is no join through `recruitment_contacts`.

If that query returns no row, or both `district` and `sector` are blank after trim, the server does not query flocks. It returns `200` with `{ scoutId, totalCount: 0, flocks: [], sectorRecorded: false }`. The UI shows "No sector recorded for this scout".

If the row exists but `status` is not `approved`, or the user is not an active `vet` or `vet_manager`, return `400` and "That scout is not ready." and do not list flocks.

When a sector is present, pass one object `{ sectorId, districtId, center }` into `bestBandForScout`. `sectorId` is the district, `|`, and the sector, after `sectorCenterKey`. Busasamana in Nyanza is not the same sector as Busasamana in Rubavu. `districtId` is the district name after that same helper.

Required test: two scouts, A and B, with different sectors. A's `contactId` is not A's `userId` and is not B's `userId`. `GET` with A's `contactId` returns `sectorRecorded: false` and `flocks: []`. It must not include any flock that a request with B's `userId` would return.

## 6. How "still needs a visit" is defined

Reuse the weigh-queue visit lines, and also require that no scout is assigned. Do not apply the 7-day line from the scout's own queue.

```sql
WHERE l.scout_confirmed_at IS NULL
  AND l.status IN ('draft', 'open', 'partial')
  AND l.assigned_scout_user_id IS NULL
```

Select only `id`, `bird_count`, `ready_from`, `sector`, `district`. Do not select `contact_phone`.

## 7. How sector centers are joined

Centers stay in `web/src/data/sectorCenters.json`. Each row is `{ district, sector, lng, lat }`. `nearbyFlocks.js` reads that file with `readFileSync`, the same style as `server/src/services/pipeline/rwandaLocations.js`. The distance module does not read the file.

The lookup uses one helper, `sectorCenterKey`, and nothing else. It runs on the JSON names when the map is built, and on each flock and scout name when a center is sought. It does not write back to the database. The names sent to the page stay as they are stored.

```js
function sectorCenterKey(district, sector) {
  const norm = (value) => String(value ?? "").trim().toLowerCase().replace(/\s+/g, " ");
  const districtName = norm(district);
  const sectorName = norm(sector);
  if (!districtName || !sectorName) return null;
  return `${districtName}|${sectorName}`;
}
```

So `Gasabo` and ` gasabo ` both become `gasabo`. `Kacyiru` and `Kacyiru  ` both become `kacyiru`. `Nyarugenge   ` becomes `nyarugenge`. A blank district or sector returns null, and that place has no center.

When the key is missing, the flock is still included. `center` is omitted, km is null, and the band is `SAME_DISTRICT` or `OTHER_DISTRICT` from the district names only.

Count of current flocks that do not match a center: not available. `server/.env` has no `DATABASE_URL`, and there is no local database file. Do not invent a number. Missing centers do not drop flocks.

## 8. How overdue is computed

The column is `pipeline_lots.ready_from`, type `DATE NOT NULL` (`database/migrations/061_poultry_supply_pipeline.sql`). This repo never calls `pg.types.setTypeParser`. `pg` 8 (declared as `"pg": "^8.20.0"` in `server/package.json`) therefore uses node-postgres' default and returns a PostgreSQL `date` as a JavaScript `Date`. `node_modules` is not installed here, so the parser file itself was not opened. A bare `YYYY-MM-DD` string can still appear in tests.

One helper, `kigaliDay`, is the only conversion used for `isOverdue` and for sorting. It is called once for "today" at the top of the nearby-flocks function, and once per flock on `ready_from`. `isOverdue` and `compareFlocks` see only the resulting `YYYY-MM-DD` strings.

```js
function kigaliDay(value) {
  if (value == null || value === "") return null;
  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value.trim())) return value.trim();
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Africa/Kigali",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

const today = kigaliDay(now);
const readyDate = kigaliDay(row.ready_from);
const isOverdue = readyDate != null && readyDate < today;
```

A date-only string is kept as written, because it has no clock to move. A `Date` from `pg` is shown on the Kigali calendar. Africa/Kigali is UTC+2. Midnight in Kigali is 22:00 UTC the evening before.

Tests use a fixed `now`, not the real clock:

- `2026-10-28T21:30:00.000Z` is 23:30 in Kigali, so `kigaliDay(now)` is `2026-10-28`.
- `2026-10-28T22:30:00.000Z` is 00:30 the next morning in Kigali, so `kigaliDay(now)` is `2026-10-29`.
- A flock whose `kigaliDay(ready_from)` is `2026-10-29` is not overdue at either of those two times. It is overdue when `now` is `2026-10-29T22:30:00.000Z` (Kigali `2026-10-30`).
- `kigaliDay(new Date("2026-10-29T00:00:00.000Z"))` is `2026-10-29`.
- Two flocks sort by `kigaliDay(ready_from)`, not by the raw `Date`.

## 9. Database changes

No. No new table, no new column, and no migration.

## 10. Identity

- **(a) How the app knows a person is a scout.** `recruitment_contacts.want` is `scout`. The person page already has `contact.want === "scout"`.
- **(b) How a scout is linked to a user account.** `recruitment_contacts.user_id` is exposed as `contact.userId`. That value is `users.id`. `scout_applications.user_id` is the same `users.id`. Approval sets `scout_applications.status = 'approved'` for that user.
- **(c) Which ID assign needs.** The button calls the real function `assignFlockScout` in `web/src/api/pipeline.api.ts`. Its signature is `assignFlockScout(token, lotId, scoutUserId)`. `flock.flockId` is `pipeline_lots.id`, which is the `:id` in `POST /lots/:id/assign-scout` (`WHERE id = $1::uuid` uses `req.params.id`). `scoutUserId` is `contact.userId`, not `contact.id`.
- **Required test.** The test calls that real `assignFlockScout` (fetch is mocked). It must see URL `/lots/{flock.flockId}/assign-scout` and body `scoutUserId` equal to `contact.userId` and not equal to `contact.id`. See section 12.

## Permissions

The assign route uses the server helper in `server/src/services/pipeline/pipeline.js`:

```js
export function canAccessPipelineDesk(user) {
  const role = user?.role;
  return role === "superuser" || role === "sales_coordinator";
}
```

The page uses the web function in `web/src/auth/permissions.ts`:

```ts
export function canAccessPipelineDesk(user: SessionUser | null): boolean {
  if (!user) return false;
  return user.role === "superuser" || user.role === "sales_coordinator";
}
```

They allow exactly the same roles: `superuser` and `sales_coordinator`. A missing user is rejected by both (the server helper is false for no user; the web helper returns false for null). No fix. The nearby-flocks route uses the server helper. The Assign button is shown only when the web function is true.

## 11. Distance bands and sorting

Copied word for word from the rules:

DISTANCE

5. Never show kilometers in the UI. Show BANDS: "Same sector", "Neighboring sector", "Same district", "Other district".

6. Approximate km (from sector centers) is used ONLY for sorting, internally.

SORTING (exact order)

7. Ready date soonest first (overdue first, no date last) -> then band rank -> then approx km (unknown last) -> then flock ID.

Band steps the module must follow:

- Same non-empty `sectorId` means `SAME_SECTOR` and km 0.
- Else, if km is not null and km is less than or equal to `NEIGHBOR_KM` (10), the band is `NEIGHBORING_SECTOR`. Neighboring can cross a district border.
- Else, the same `districtId` means `SAME_DISTRICT`.
- Else the band is `OTHER_DISTRICT`.

There is no adjacency table. Band rank is `SAME_SECTOR` 0, `NEIGHBORING_SECTOR` 1, `SAME_DISTRICT` 2, `OTHER_DISTRICT` 3.

`NEIGHBOR_KM = 10` lives at the top of `sectorDistance.js`, with the comment "Tune this after seeing real data."

Required test, recorded here so it is not dropped: the test calls the real `assignFlockScout` in `web/src/api/pipeline.api.ts`. The lot id it sends is `flock.flockId` (`pipeline_lots.id`). The scout id it sends is `contact.userId`, not `contact.id`. The test in section 12 has to fail if those two ids are swapped.

## 12. Test plan

Distance unit tests:

- Same sector returns `SAME_SECTOR` and km 0.
- Different sectors about 6 km apart, in different districts, return `NEIGHBORING_SECTOR`.
- Different sectors about 25 km apart, in the same district, return `SAME_DISTRICT`.
- Different sectors about 25 km apart, in different districts, return `OTHER_DISTRICT`.
- Distance exactly `NEIGHBOR_KM` returns `NEIGHBORING_SECTOR`.
- A missing center in the same district returns `SAME_DISTRICT` and km null.
- A missing center in a different district returns `OTHER_DISTRICT` and km null.
- `approxKm` returns null when a center is missing, and about 111 for 1 degree of latitude.
- A scout with 3 sectors picks the closest band. A tie on band keeps the smaller km.
- A scout with no sectors returns `OTHER_DISTRICT` and km null.
- Ready in 3 days plus `SAME_DISTRICT` sorts before ready in 10 days plus `SAME_SECTOR`.
- An overdue flock sorts first. A flock with no ready date sorts last.
- Same date and same band: smaller km first, null km last.
- When everything else is equal, the smaller `flockId` comes first.
- `isOverdue`: yesterday is true, today is false, tomorrow is false, null is false.

Server tests:

- A non-desk role is rejected before any query.
- The JSON keys are only the allow-list. No `phone`, `km`, `email`, or owner contact.
- Assigned flocks and confirmed flocks are outside the SQL filter.
- More than 25 matches return exactly 25 rows, and `totalCount` is the full number.
- An earlier ready date beats a closer band.

Wrong-route-id test (required):

- Scout A has `contactId` `contact-a` and `userId` `user-a`. Scout B has `userId` `user-b` and a different sector. `contact-a` is not `user-a` or `user-b`.
- Request nearby flocks with `contact-a`. The body is `sectorRecorded: false` and `flocks: []`.
- None of those flocks are the flocks returned for `user-b`.

Ready-date tests (required): the fixed `now` values in section 8, including both sides of midnight in Kigali.

Assign-id test (required). This calls the real `assignFlockScout` from `web/src/api/pipeline.api.ts`. Fetch is mocked so no server runs.

- Person `{ id: "contact-1", userId: "user-1" }`, flock `{ flockId: "lot-1" }`.
- The button's call is `assignFlockScout(token, "lot-1", "user-1")`.
- The mocked request URL contains `/lots/lot-1/assign-scout`.
- The JSON body `scoutUserId` is `"user-1"` and is not `"contact-1"`.
- The web test file is listed in the `web/package.json` `test` script, because that script names each file.

Phase 4 UI check list:

1. A coordinator opens a scout who has a user account and a sector and sees the table.
2. A scout with no user account sees "This scout has no user account yet, so flocks cannot be assigned." and no list.
3. A scout user with no sector row sees "No sector recorded for this scout" and no table.
4. The Assign button calls the real `assignFlockScout(token, flock.flockId, contact.userId)` in `web/src/api/pipeline.api.ts`. `flock.flockId` is the lot id that route expects.
5. The assign-id test above passes.
6. The wrong-route-id test above passes.
7. A sales officer does not see the list or the Assign button.

## 13. Risks

- The person page is the People desk. The edit stays a single mount. Do not change Insights or Recruitment analytics.
- Assign still requires an approved vet. A linked user who is not approved gets the existing "That scout is not ready." message, not a flock list.
- Sorting by km cannot be done in SQL. The SQL filters the rows. JavaScript sorts that filtered set and then keeps 25.
- The Flock column is the lot id, because the allow-list has `flockId` and not the farm name.

## 14. Rollback

Work stays on a branch. Before any commit, `git status` shows the new files. To undo uncommitted work, restore edited files with `git checkout --` and delete the new files. After a commit, `git revert` that commit, or delete the unmerged branch. Do not rewrite published history.

## 15. Open questions

1. The unmatched-flock count could not be run here. Recommendation: proceed. A missing center does not remove the flock. Count them later on a database that has `DATABASE_URL`.
2. The Flock column will show the lot id. Recommendation: keep the allow-list exactly as specified. Add a farm name only if you ask for it later.
