# Cleva bridge report

1. What was built

Cleva can now receive a signed request from a future CRM, turn a WhatsApp contact into a market lead or a scout assignment, and send milestones back when signup, verification, a visit, a flock, or a trade actually happens. Staff get a Messages button that will open the CRM inbox once that server exists. Scouts see only sellers assigned to them. Nothing here publishes a listing or changes ERPNext accounting. The inbox itself is not installed in this repo.

2. Files

- `docs/crm/MASTER_PLAN.md` — the source plan
- `docs/crm/00-repo-audit.md` — how this repo differs from that plan
- `infra/crm/README.md` — human steps to install a staging CRM later
- `.cursor/rules/cleva-crm.mdc` — rules for later CRM work
- `database/migrations/080_crm_bridge.sql` — new tables, with rollback SQL in the file header
- `server/src/services/pipeline/crmBridge.js` — rules, signatures, convert, outbox
- `server/src/routes/crmBridge.routes.js` — internal and staff HTTP
- `server/tests/crm-bridge.test.js`
- Signup, scout home, Messages page, and the milestone hooks in the existing pipeline routes

3. How to run

```
cd server && npm test -- tests/crm-bridge.test.js
```

Leave `CRM_INTEGRATION_ENABLED` unset or `false` until a staging CRM URL and secrets exist. The migration runs with the API's normal startup migrator. Do not apply it by hand to production until you have read `080_crm_bridge.sql`.

4. Tests

See the command above. The suite covers phones, signatures, replay, token reuse, convert decisions, launch roles, scout isolation rules, and outbox retry. It does not call Meta or Frappe.

5. Deviations

- Signup links use `/signup?t=`, not `/join`.
- A new buyer becomes a `market_leads` row. A demand is not created until a buyer record exists, because `pipeline_demands` requires one.
- A scout with no account is `scout_pending`, not a `scout_applications` row.
- District coverage uses the scout application's district when it is set. There is no coverage table.
- `seller.contacted` and `seller.assigned` are extra event names so the CRM timeline can show those steps. Unknown events can be ignored.

6. Decisions still needed

The open questions in MASTER_PLAN.md section 15: business hours, languages, pilot staff, budget, and whether scouts ever get a CRM login.

7. Risks

Frappe CRM is not running. Messages shows an explanation until `CRM_BASE_URL` and `CRM_SSO_PRIVATE_KEY` are set. Outbox rows stay pending until `CRM_OUTBOX_SECRET` is set too. They are not lost.

8. What the next phase needs

A staging bench at `crm-staging.cleva.rw`, the Meta test number, and answers to spikes S1–S8 before `cleva_bridge` (the Frappe app) is written.
