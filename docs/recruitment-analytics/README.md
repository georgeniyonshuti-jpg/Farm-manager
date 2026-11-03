# Recruitment analytics

The command centre is the Insights page at `/dashboard/market/recruitment`. It reads one snapshot from `GET /api/analytics/recruitment/snapshot?view=all`. The previous page is still available at `/dashboard/market/recruitment-legacy`, linked as “Previous version”. `/dashboard/market/recruitment-v2` redirects to the command centre. There is no `VITE_RECRUITMENT_ANALYTICS_V2` flag.

Five views: Overview, Pipeline, Sources, Scouts, Weekly. People lists open in a drawer. The list uses the same filter as the count.

A local preview that does not need a login is `http://localhost:5173/dev/recruitment-preview?state=demo`. Other states: `loading`, `empty`, `error`, `stale`, `unavailable`. That route exists only in a dev build and is labelled “Demo data”.

## Where the numbers live

All formulas are in `server/src/services/recruitmentAnalytics/`. A widget must not calculate its own rate. Definitions are in `definitions.js`. The version string is `DEFINITIONS_VERSION`.

The command tiles (sellers live, buyers active, scouts producing, passed probation), the worklist, and the short headline are built in `command.js`. The page reads `snapshot.command`, not the longer `snapshot.headline`.

To change a definition: edit the text and formula in `definitions.js`, add or adjust a test in `server/tests/recruitment-analytics-metrics.test.js`, and bump `DEFINITIONS_VERSION`. Do not copy the formula into a React component.

To add a metric: add an id in `definitions.js`, compute it inside `buildSnapshot`, and show `definitionId` and `n` in the component.

## Database

Migrations are not applied by this document. Read them before running `npm run migrate`:

- `database/migrations/087_analytics_person_facts.sql` creates a read-only view. Already applied in production.
- `database/migrations/088_recruitment_analytics_capture.sql` adds links, spend, versioned targets, and an event ledger. Already applied in production.
- `database/migrations/089_interview_facts.sql` adds interview answers on contacts. Already applied.
- `database/migrations/090_recruitment_target_tiers.sql` adds `recruitment_targets.tier` (`t1` or `t2`). **Not applied.** Until it is, every saved target is treated as T1 and the stretch tick stays hidden. Saving a tier returns an error until this migration runs. The undo steps are at the top of the file.

## Checks

```
npm test --prefix server -- tests/recruitment-analytics-metrics.test.js
npm test --prefix web
npm run build --prefix web
```

There is no ESLint or Prettier in this repo.

## Speed

The snapshot is still the live `analytics.person_facts` view, with a 60 second cache. Each SQL module runs on one connection with a 3 second statement timeout. A failed module shows “Unavailable” and does not blank the page. If the whole snapshot fails, the last good snapshot is served with `stale: true`. `meta.durationMs` is the measurement. An in-memory build of 40 people stays under 2 seconds in the metrics test, so serving tables were not added.

## Privacy

Phone numbers are masked. Reveal writes an audit event and is limited to the pipeline desk (`superuser`, `sales_coordinator`). Briefing text, weekly notes, and the WhatsApp summary do not include phone numbers. A WhatsApp link is only returned to the pipeline desk, and the number is not written in the visible row. Click-to-WhatsApp ads cannot be attributed until the official WhatsApp Business API is installed. Tracked links still work for links the team sends.

## Seed

`node server/scripts/seedRecruitmentAnalytics.js` refuses to run unless the database host is localhost. It is not required for the page.
