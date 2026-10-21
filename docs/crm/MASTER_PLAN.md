# Cleva CRM + WhatsApp Shared Inbox: Master Implementation Plan

**Version 1.0 · 21 October 2026**
**Audience:** Cursor AI (agent) and the project owner (a beginner who wants to learn while building)

---

## 0. How to use this file (for the human)

1. Put this file in your Cleva repo at `docs/crm/MASTER_PLAN.md`.
2. Create the Cursor rule from **Appendix A** at `.cursor/rules/cleva-crm.mdc`. This makes Cursor follow the ground rules in every chat.
3. Work **one phase at a time** (Section 9). For each phase:
   - Create a git branch (`git checkout -b crm/phase-1-...`).
   - Open a new Cursor chat. Use **Plan mode** first so Cursor shows you its plan before editing files. Then switch to **Agent mode** to build.
   - Paste the phase's **Cursor prompt** (the code block at the end of the phase).
   - Review the diff. Run the tests. Commit. Only then start the next phase.
4. Phases 1 and 8 contain **human-only tasks** (Meta account setup, real-world pilot). Cursor cannot do these for you. Start the Meta business verification **now**, because it can take days.
5. If Cursor says it is unsure about something, answer it. Never let it guess about security or money.

---

## 1. Glossary (plain language)

| Term | Meaning |
|---|---|
| **WhatsApp Business Platform / Cloud API** | Meta's official way for software (not a phone) to send and receive WhatsApp messages. |
| **WABA** | WhatsApp Business Account, the container in Meta's system that owns your number and templates. |
| **Webhook** | A URL on our server that Meta calls whenever a customer sends a message. |
| **Template** | A pre-approved message. It is the only way to start a chat, or restart one after 24 hours of silence. |
| **Customer service window (24h)** | After a customer messages you, you can send free-form replies for 24 hours. |
| **WhatsApp Flow** | An in-chat mini form (dropdowns, buttons). The customer fills it without leaving WhatsApp. |
| **Frappe CRM** | Open-source CRM built on the same Frappe framework as ERPNext. |
| **Frappe WhatsApp** | Community app that connects Frappe to Meta's Cloud API. Frappe CRM uses it for chat. |
| **SSO** | Single sign-on. Click "Messages" in Cleva and land in the CRM already logged in. |
| **Idempotent** | Safe to run twice. Meta and networks retry things, so everything must tolerate duplicates. |
| **Outbox** | A database table of "events to send." A worker retries them until they succeed. It prevents lost updates. |
| **HMAC signature** | A cryptographic stamp proving a request came from us and was not altered. |
| **E.164** | Standard phone format: `+250788123456`. We store every phone number this way. |

---

## 2. Goal and scope

**Goal:** One Cleva WhatsApp number that many employees work at the same time, from a shared inbox inside Frappe CRM. Qualified contacts convert into Cleva Market sellers, buyers or scouts. Cleva reports progress back to the CRM so we can see the full funnel:

```
Ad → WhatsApp → claimed → qualified → called → signed up
   → verified → first flock → first listing → first transaction
```

**In scope:** CRM install, WhatsApp connection, lead fields and pipeline, claim/assignment/SLA, WhatsApp Flow qualification, SSO from Cleva, tracked signup links, Cleva↔CRM event sync, conversion into Cleva records, scout queue in Cleva, security, backups, pilot.

**Out of scope (for now):** call audio recording (Phase 9, optional), rebuilding a WhatsApp inbox, ERPNext accounting changes, public listings created from chat answers.

---

## 3. Verified facts and known unknowns

Research was done on 21 Oct 2026. Items marked **UNKNOWN** are tested in the Phase 1 spikes. Do not assume them.

| # | Claim | Status |
|---|---|---|
| 1 | Frappe CRM supports sending/receiving WhatsApp from Lead and Deal pages, via the separate **Frappe WhatsApp** app. | **Confirmed** (Frappe CRM docs). |
| 2 | Frappe WhatsApp connects directly to Meta's Cloud API, with no third-party provider. Install uses `bench get-app` and `install-app`. Webhook path is `/api/method/frappe_whatsapp.utils.webhook.webhook`. | **Confirmed** (project README). |
| 3 | Frappe WhatsApp is **community-maintained** (by an individual developer), not a first-party Frappe product. | **Confirmed.** This is a real risk. See Section 14. |
| 4 | Starting a conversation requires a pre-approved template. | **Confirmed** (Frappe CRM docs and Meta rules). |
| 5 | **An unknown inbound number automatically creates a CRM Lead.** | **UNKNOWN.** The docs describe chatting from existing lead pages. They do not clearly state auto-creation. Spike S1. The plan therefore makes our bridge app own lead creation. |
| 6 | **Restricted ("Sales User") roles only see own/assigned leads.** | Plausible but **UNKNOWN** at API level. Spike S6. It also creates a design conflict: a user who cannot see unassigned leads cannot claim from a shared queue. See Decision D4. |
| 7 | WhatsApp Flows are supported by Frappe WhatsApp. | Partly confirmed (README mentions Flow messages). Whether we can *send* Flows or interactive buttons is **UNKNOWN**. Spike S4. |
| 8 | Frappe can log users in via a custom OIDC provider using "Social Login Key". | **Confirmed**, but it creates users with no roles and requires Cleva to act as an OIDC server. We use a lighter signed-token approach instead (Decision D3). |
| 9 | **"Replies inside the 24h window are free."** | **OUTDATED as of 1 Oct 2026.** Several sources report that from 1 Oct 2026 service replies and in-window utility templates become billable. Reported terms: the first 1,000 delivered service messages per business number per month stay free, then the utility rate applies. Messages inside a 72h "free entry point" window (Click-to-WhatsApp ads) remain free. Incoming customer messages stay free. **Confirm the Rwanda (+250) rate on Meta's official rate card before budgeting.** |
| 10 | Telephony (Twilio/Exotel) and Rwandan number support and call recording. | **UNKNOWN.** Separate project (Phase 9). |

**Correction to the earlier notes:** "Frappe CRM, Frappe WhatsApp and the app are free" is true for **software and per-seat fees**. WhatsApp **messages** are not guaranteed free. Budget for them (Section 13).

---

## 4. Ground rules for Cursor (non-negotiable)

1. **Inspect before you build.** Never assume the Cleva stack, folder layout, table names or conventions. Phase 0 discovers them. Follow existing patterns.
2. **Never touch ERPNext accounting, inventory or payments.**
3. **Never create a public listing from WhatsApp answers.** A seller always enters the scout/verification queue first.
4. **No secrets in code or git.** Use the repo's existing environment/secret pattern. Provide a `.env.example` with placeholder values only.
5. **Every inbound request (webhook, event, SSO, convert) is authenticated, replay-protected and idempotent.**
6. **Never log personal data** (phone numbers, names, message text) at INFO level or above. Mask phones (`+25078*****56`).
7. **Never trust role data from a token or request body.** Map roles from a server-side allowlist.
8. **Database changes:** migrations only, reversible, and shown to the human before applying. Never edit production data directly.
9. **Small, reviewable commits.** One concern per commit. Write tests with the code, not later.
10. **Feature flag everything** behind `CRM_INTEGRATION_ENABLED` (Cleva side) so we can switch it off instantly.
11. **Stop at the end of each phase.** Produce the phase report (Appendix B) and wait. Do not start the next phase.
12. **Explain for a beginner.** Each phase report includes a short "what we built and why" in plain language.
13. If something in this plan conflicts with the actual codebase or with a verified fact, **stop and ask**. Do not silently improvise.

---

## 5. Architecture

```
 Customer's WhatsApp
        │  (messages)
        ▼
 Meta WhatsApp Cloud API ──webhook──▶  CRM site (crm.cleva.rw)
                                       ├─ Frappe CRM          (leads, inbox, pipeline)
                                       ├─ Frappe WhatsApp     (Meta connector)
                                       └─ cleva_bridge (OURS) (lead ingest, Flow mapping,
                                                              claim lock, SLA, SSO,
                                                              events in/out, convert)
                                              ▲   │
                       signed events (HMAC)   │   │  signed calls (HMAC)
                                              │   ▼
                                       Cleva Market (market.cleva.rw)
                                       ├─ crm_bridge module (OURS): outbox, links,
                                       │   signup tokens, convert endpoints, SSO launcher
                                       ├─ market_leads / people_onboarding /
                                       │   scout_applications / buyers / scout lots
                                       └─ Scout queue ("My sellers")

 ERPNext (accounting) ── untouched, separate
```

**Ownership boundaries (the most important rule in the design):**

| System | Owns |
|---|---|
| **Frappe CRM** | Prospects, conversations, assignments, follow-ups, qualification, marketing source. |
| **Cleva Market** | Seller visits, flocks, buyer demand, listings, verification, trades, scout commissions, and real user identity/roles. |
| **ERPNext** | Accounting, inventory, invoices, payments. |

Data crosses the boundary only through the two signed APIs in Section 8.

---

## 6. Key decisions (chosen, with reasons)

| ID | Decision | Why | Alternative, and when to use it |
|---|---|---|---|
| **D1** | **Frappe CRM + Frappe WhatsApp**, with a custom `cleva_bridge` app. | Closest fit for lead qualification, ownership and conversion. Same stack as the existing ERPNext. No per-seat cost. | **Chatwoot** if the Phase 8 pilot fails the go/no-go. It is stronger as a pure support inbox but needs a separate stack plus its own CRM sync. Never a custom-built inbox (webhook retries, ordering, media, statuses, 24h rules, concurrency all become our problem). |
| **D2** | **CRM runs on its own bench/containers and its own subdomain** (`crm.cleva.rw`), separate from the ERPNext bench. | Frappe apps share one framework version. Putting CRM beside production ERPNext couples upgrades and risks breaking accounting. | Same bench only if infrastructure forces it. Then take a full backup first and pin versions. |
| **D3** | **SSO via short-lived signed token** (asymmetric JWT) that Cleva issues and `cleva_bridge` verifies. | Simple, secure, no OIDC server to build, and we control role mapping. | **Cleva as a full OIDC provider + Frappe Social Login Key.** Standard, but heavier, and Frappe creates role-less users that we would need to fix up anyway. Use it if we later add more apps. |
| **D4** | **Two custom CRM roles.** `Cleva Marketer` sees the shared queue and all WhatsApp leads, but has no Settings access, cannot delete or export. `Cleva Scout` is restricted to its assigned leads. **Pilot: scouts do NOT get CRM accounts**, and staff do all WhatsApp replying. | A restricted role cannot see unassigned leads, so it cannot claim from a shared queue. Giving scouts CRM access adds permission risk before we have proven isolation. | Give selected scouts `Cleva Scout` CRM accounts after Spike S6 proves isolation, if they must reply on WhatsApp themselves. |
| **D5** | **Staff-first flow in the pilot.** All new contacts go to the qualification team's claim queue. After qualification, sellers are assigned to a district scout who works in Cleva. | Smaller blast radius, easier to measure, matches the "staff work in the CRM, scouts work in Cleva" model. | Automatic district routing straight to scouts (feature-flagged in Phase 5) once scouts have CRM accounts. |
| **D6** | **Native Frappe Assignment Rules** for routing, generated by script from Cleva's scout↔district data. | Least custom code. | A custom routing table in the bridge if rules become too complex to maintain. |
| **D7** | **Outbox pattern** on the Cleva side for all events to the CRM. | Survives CRM downtime. No lost milestones. | Direct synchronous calls are simpler but lose events during outages. |
| **D8** | **Signup tracking by opaque token, never by phone alone.** The WhatsApp number and the signup number can differ. | Prevents linking the wrong person's record. | None. |
| **D9** | **One owner per conversation**, enforced on the server with a row lock. | Prevents two people replying to the same customer. | None. |
| **D10** | **Qualification through one WhatsApp Flow** (one screen with the five questions) instead of five chat messages. | Fewer billed messages, better completion, structured data. | Plain-text numbered menu if Flows cannot be sent (Spike S4). |

---

## 7. Data model

### 7.1 CRM Lead custom fields (in `cleva_bridge` fixtures)

| Field | Type | Notes |
|---|---|---|
| `phone_e164` | Data, indexed | Normalised `+250…`. Deduplication key. |
| `contact_type` | Select | Unknown, Seller, Buyer, Scout Candidate, Other |
| `district` | Link → `Cleva District` | Seed from Cleva's district data. Never free text. |
| `bird_count` | Int | Birds available or needed |
| `bird_type` | Select | **Use the values from Cleva's flock types.** Confirm in Phase 0. |
| `availability_date` | Date | |
| `campaign`, `ad_id`, `ad_source` | Data | From Click-to-WhatsApp referral data if available (Spike S5), otherwise manual |
| `assigned_scout` | Link → User | |
| `cleva_record_type`, `cleva_record_id` | Data | Set on conversion |
| `qualification_status` | Select | Not Started, In Progress, Qualified, Not Qualified |
| `qualification_notes` | Small Text | |
| `next_follow_up` | Datetime | |
| `claimed_at`, `first_response_at` | Datetime | For SLA reporting |
| `signup_link_sent_at`, `signed_up_at`, `verified_at`, `first_flock_at`, `first_listing_at`, `first_transaction_at` | Datetime | Milestones from Cleva |
| `consent_whatsapp`, `consent_at`, `opted_out` | Check / Datetime / Check | Respect opt-outs (e.g. "STOP") |
| `language` | Select | Kinyarwanda, English, French |

> Field names are targets. Verify them against the installed Frappe CRM version (the Lead doctype is `CRM Lead`) before creating them.

### 7.2 Pipeline (CRM Lead Status values)

```
New WhatsApp → Claimed → Classified → Qualified → Call Scheduled
→ Signup Pending → Signed Up → Activated → Selling/Buying
```

Terminal: `Unreachable`, `Not Qualified`, `Rejected`, `Duplicate`, `Spam`.

Rules:
- Milestone events from Cleva **advance** status automatically but **never move it backwards**.
- Only a Supervisor can reopen a terminal status.
- `Duplicate` requires a link to the surviving lead.

### 7.3 Cleva-side tables (adapt names and types to the repo's ORM and migration tool)

```
crm_links
  id, cleva_entity_type, cleva_entity_id, crm_lead_name,
  phone_e164, created_at, UNIQUE(cleva_entity_type, cleva_entity_id), INDEX(crm_lead_name)

crm_user_links
  id, cleva_user_id (UNIQUE), crm_user_email, crm_role, disabled_at, last_sync_at

signup_tracking_links
  id, token_hash (UNIQUE, store a hash, never the raw token), crm_lead_name,
  contact_type, prefill_json, expires_at, used_at, used_by_user_id, created_by_crm_user

crm_sync_outbox
  id, event_id (UUID, UNIQUE), event_type, payload_json, status (pending|sent|failed|dead),
  attempts, next_attempt_at, last_error, created_at, sent_at

crm_inbound_requests            -- replay/idempotency log for calls CRM → Cleva
  id, request_id (UNIQUE), received_at, result
```

---

## 8. Integration contracts

All machine-to-machine calls use **HMAC-SHA256**, with different secrets for each direction.

**Headers:**
- `X-Cleva-Timestamp`: unix seconds. Reject if more than 5 minutes off.
- `X-Cleva-Signature: v1=<hex>` where the value is `HMAC(secret, timestamp + "." + rawBody)`.
- `X-Cleva-Event-Id` (or `X-Cleva-Request-Id`): unique per request, stored 7+ days for dedup.

Compare signatures in **constant time**. Reject on any mismatch with a generic 401, with no detail leaked.

### 8.1 Cleva → CRM: `POST /api/method/cleva_bridge.events.ingest`

```json
{
  "event_id": "b3f1…uuid",
  "event_type": "seller.verified",
  "occurred_at": "2026-10-21T09:30:00Z",
  "crm_lead": "CRM-LEAD-2026-00042",
  "cleva": { "entity_type": "seller", "entity_id": "123", "phone_e164": "+250788123456" },
  "data": {}
}
```

Event types: `signup.completed`, `scout.application_submitted`, `scout.approved`, `buyer.demand_created`, `visit.scheduled`, `visit.completed`, `seller.verified`, `flock.first_captured`, `listing.first_published`, `trade.first_completed`, `user.deactivated`.

Responses: `200 {"status":"applied|duplicate|ignored"}`. `4xx` means permanent failure (do not retry). `5xx` means retry.
Outbox retry backoff: 30s, 2m, 10m, 1h, 6h. After 8 attempts the event goes to `dead` and raises an alert.

### 8.2 CRM → Cleva (paths adapt to repo conventions)

- `POST /api/internal/crm/signup-links` → `{ "crm_lead", "contact_type", "prefill": {…} }` returns `{ "url": "https://market.cleva.rw/join?t=<opaque>", "expires_at" }`. Tokens are 128-bit random, single use, and expire (default 7 days).
- `POST /api/internal/crm/convert` → creates the right Cleva record (seller lead or scout visit, buyer demand, or scout application). **Idempotent on `crm_lead`.** Returns `{ "cleva_record_type", "cleva_record_id" }`.
- `POST /api/internal/crm/assign` → assigns a seller lead to a scout. Validates the scout covers the district.

### 8.3 SSO launch (Cleva → CRM)

1. The user clicks **Messages** in Cleva.
2. Cleva backend checks that the user is authorised (staff or scout role, active account).
3. Cleva signs a JWT with its **private key** (EdDSA or RS256) with claims:
   `iss="cleva-market"`, `aud="cleva-crm"`, `sub=<cleva_user_id>`, `email`, `name`, `crm_role ∈ {marketer, supervisor, scout}`, `jti` (unique), `iat`, `exp` (at most 60 seconds).
4. The browser **POSTs** the token to `https://crm.cleva.rw/api/method/cleva_bridge.sso.login` (use an auto-submitting form so the token never appears in URLs or logs).
5. `cleva_bridge` verifies the signature (public key in site config), `aud`, `exp` and that `jti` has never been used. It then creates or updates the Frappe User, sets **only** the Cleva-managed roles from a server-side map, logs the user in, and redirects to `/crm`.
6. **Administrators never log in via SSO.** Admin accounts are native Frappe accounts with 2FA.
7. Because both apps sit on `*.cleva.rw`, same-site cookies work. This is why we launch CRM as a full page rather than in an iframe (iframes break on third-party cookie rules).

**Deprovisioning:** when a Cleva user is deactivated or loses their role, Cleva emits `user.deactivated`. The CRM disables the Frappe user and reassigns their open leads to the supervisor queue.

---

## 9. Phases

### Phase 0: Repo audit (read-only)

**Goal:** Learn the real Cleva codebase before designing anything specific.

**Cursor does:** Reads the repo only. Writes `docs/crm/00-repo-audit.md`. **No code changes.**

**Acceptance:** The report answers every question in the prompt, with file paths as evidence, and lists any place where this plan does not match reality.

````text
Read docs/crm/MASTER_PLAN.md fully, especially sections 4 to 8. This is Phase 0: a READ-ONLY audit.
Do NOT modify any code. Create only the file docs/crm/00-repo-audit.md.

Investigate the repository and answer each question with file paths as evidence:
1. Language, framework, runtime versions, package manager, how to run it locally, how to run tests.
2. Database engine, ORM, and migration tool. How are migrations created and applied?
3. Authentication: how are users, sessions and roles implemented? List all roles that exist (staff, marketer, scout, ops, buyer, seller, admin, etc.).
4. Where are these defined: market_leads, people_onboarding, scout_applications, buyers, scout lots, flocks, listings, visits, verification, trades, commissions? Show the key columns of each.
5. How are scouts linked to districts? How are districts stored? How are phone numbers stored and in what format?
6. The existing ERPNext integration and the ERPNext desk iframe: which files, how it authenticates, what it is used for.
7. The existing signup/onboarding flow (seller, buyer, scout): which files and endpoints. Where could a signup token be consumed?
8. Background job or queue mechanism (cron, worker, queue library), if any.
9. Conventions: folder structure, API route style, error handling, logging, config/env/secret handling, feature flags, test style, lint/format rules, CI.
10. Where does the UI show navigation, so I can later add a "Messages" entry visible only to staff and scouts?
11. Hosting hints: how is the app deployed (Docker, PaaS, VM)? Where is ERPNext hosted (self-hosted or Frappe Cloud)? Say "unknown" if the repo does not reveal it.

Then add sections:
- "Mismatches with the plan": anything in MASTER_PLAN.md that conflicts with what you found.
- "Proposed locations": exact folders/files where the new crm_bridge module, migrations, endpoints, outbox worker and tests should live, following existing conventions.
- "Questions for the owner": anything you could not determine.

Finish with the phase report format from Appendix B of the plan. Then STOP.
````

---

### Phase 1: Meta setup, CRM install, and spikes

**Goal:** A working staging CRM that receives and sends real WhatsApp messages on a Meta **test** number, plus answers to every UNKNOWN in Section 3.

**You (human) do. Cursor cannot do these:**

1. **Meta business verification (start immediately; it can take days).** Create or confirm your Meta Business portfolio and submit business verification.
2. Create a **WhatsApp Business Account** and a developer app. In staging use Meta's free **test number** (it can message only recipients you add to an allow-list).
3. Decide the production number. It must not be actively registered on the regular WhatsApp app, unless you follow Meta's migration steps. Check Meta's current docs first.
4. Create a **System User** and a **permanent access token** with WhatsApp permissions. Store it in your secret manager, not in chat or git.
5. Attach a payment method to the WABA (needed for template and billable messages).
6. Provision a **staging server** (separate from production ERPNext) with HTTPS on `crm-staging.cleva.rw`.
7. Decide hosting (self-hosted vs Frappe Cloud) for the CRM. Self-hosting is cheaper and is the plan's default.

**Cursor does:** Writes a runbook and scripts under `infra/crm/`: installation commands, config, backup scripts, a `SPIKES.md` test script. Cursor writes instructions for you to run on the server. It cannot access the server.

**Install outline (verify exact commands against current Frappe docs):**

```
bench get-app crm
bench new-site crm-staging.cleva.rw --install-app crm
bench get-app https://github.com/shridarpatil/frappe_whatsapp   # pin to a specific commit/tag
bench --site crm-staging.cleva.rw install-app frappe_whatsapp
```

Then in **WhatsApp Settings/Account** enter the credentials, set a **Webhook Verify Token**, and register this webhook URL in Meta (subscribe to the `messages` field):

```
https://crm-staging.cleva.rw/api/method/frappe_whatsapp.utils.webhook.webhook
```

**Spikes (must all be answered, with evidence, before Phase 3 starts):**

| Spike | Question |
|---|---|
| **S1** | Does a message from an unknown number create a CRM Lead automatically? If not, what exactly happens to it? |
| **S2** | How does a stored WhatsApp Message link to a Lead (which fields)? What makes the chat appear on the lead page? |
| **S3** | Does the webhook handler verify Meta's `X-Hub-Signature-256` header with the app secret? Does it ignore a re-delivered message with the same message ID? If either is missing, document the fix (our bridge or an nginx rule). |
| **S4** | Can Frappe WhatsApp send interactive buttons and WhatsApp Flows? How is a Flow submission stored when received? |
| **S5** | For Click-to-WhatsApp ad messages, does the stored message keep Meta's `referral` data (ad ID, source URL, click ID)? If not, can our bridge capture it? |
| **S6** | With a restricted role, can a user see or fetch **other users'** leads or messages **by calling the API directly** (not just via the UI)? |
| **S7** | Where are media files (images, voice notes, documents) stored? What are the size limits and are they access-controlled? |
| **S8** | Does a template message sent outside the 24h window work end-to-end, and is delivery/read status recorded? |

**Acceptance:** A staging CRM, a test message in and out, and `docs/crm/01-spike-report.md` answering S1–S8 with screenshots or logs. For each spike where the answer is "no," a recommended fix.

````text
Read docs/crm/MASTER_PLAN.md (sections 3, 4, 6, 9 Phase 1) and docs/crm/00-repo-audit.md.
This is Phase 1. I (the human) will do the Meta account steps and server provisioning myself.
Your job, without touching production:
1. Create infra/crm/README.md: a beginner-friendly step-by-step runbook to install Frappe CRM and Frappe WhatsApp on a separate staging server (decision D2), pin versions, enable HTTPS, configure the webhook URL, and store secrets safely. Mark any command you are not 100% sure about as "VERIFY against current Frappe docs".
2. Create infra/crm/backup.md and a simple backup/restore script plan (daily database and files, tested restore).
3. Create infra/crm/SPIKES.md: an exact, numbered test script for spikes S1 to S8 from the plan, with what to click, what to send from a phone, what to look at in the database or logs, and a table to record results.
4. Create docs/crm/01-spike-report.md as an empty template with one section per spike (question, how tested, evidence, result, recommended fix).
Do NOT write application code yet. Do NOT guess spike answers. Finish with the Appendix B phase report and STOP.
````

---

### Phase 2: CRM configuration as code

**Goal:** Every CRM setting is reproducible from the repo (fixtures and patches in the `cleva_bridge` Frappe app), never hand-clicked.

**Cursor does:** Creates the `cleva_bridge` Frappe app skeleton, and fixtures for:

- Custom fields (7.1), lead statuses (7.2), the `Cleva District` doctype with seeded districts.
- Roles `Cleva Marketer`, `Cleva Scout`, `Cleva Supervisor`, with permissions matching Decision D4. **No Settings access, no delete, no export** for marketers/scouts.
- Saved public list views: **New WhatsApp Leads** (status New WhatsApp, unassigned), **My Leads**, **Follow-ups Due**, **Unreachable/Not Qualified**.
- WhatsApp template drafts as seed data. Include English and Kinyarwanda versions (check Meta's template language list for the Kinyarwanda code): `welcome_qualification`, `signup_link`, `follow_up_reminder`, `visit_scheduled`.
- Assignment Rule scripts (Decision D6).

**Acceptance:**
- A fresh site installs the app and gets all of the above with one command.
- Re-running the install changes nothing (idempotent).
- Tests prove roles cannot open Settings or delete leads.

````text
Read docs/crm/MASTER_PLAN.md sections 4, 6, 7 and Phase 2, plus docs/crm/00-repo-audit.md and docs/crm/01-spike-report.md.
This is Phase 2. Build the Frappe app skeleton "cleva_bridge" (in the folder chosen in the audit) with fixtures/patches that create:
- the CRM Lead custom fields from section 7.1 (first verify actual field names and doctype names in the installed Frappe CRM version; list differences);
- the lead statuses from section 7.2, with a server-side rule that automatic updates never move status backwards;
- a "Cleva District" doctype seeded from Cleva's districts;
- roles Cleva Marketer, Cleva Scout, Cleva Supervisor with permissions per decision D4 (no Settings access, no delete, no export);
- the saved list views and the WhatsApp template seed data described in Phase 2;
- a script that generates Assignment Rules from Cleva's scout-district data (feature-flagged off by default).
Everything must be idempotent. Write tests (Frappe test runner) proving: re-install is a no-op, roles cannot delete or open Settings, status never regresses automatically.
Explain each file for a beginner in the phase report. Finish with the Appendix B report and STOP.
````

---

### Phase 3: `cleva_bridge` behaviour (CRM side)

**Goal:** The custom logic that makes the CRM work for Cleva.

**Cursor builds, in `cleva_bridge`:**

1. **`phone.py`:** normalise any input to E.164 (`+250…`), including `wa_id` (no plus) and local `07…` format. Heavy unit tests.
2. **`lead_ingest.py`:** hook on incoming WhatsApp Message. If no Lead exists for that `phone_e164`, create one with status **New WhatsApp**. If one exists, link to it. **Race-safe** (two messages arriving at the same instant must not create two leads). Handles Spike S1/S2 findings. Captures ad referral data if S5 showed it is available.
3. **`flow_mapper.py`:** when a WhatsApp Flow response arrives, validate it and write answers to Lead fields (`contact_type`, `district`, `bird_count`, `availability_date`, `name`). Reject unknown districts. Unknown answers go to `qualification_notes`.
4. **Welcome automation:** on a new lead's first inbound message (inside business hours config), send the welcome Flow once. If Flows are unavailable (S4), send a plain numbered menu. Never send automated messages repeatedly: one welcome per lead per 24h window. Opt-outs ("STOP") are honoured immediately: set `opted_out`, stop all automation.
5. **`claim.py`:** server-side `claim_lead(lead)`. Uses a database row lock (`for_update`) and checks that no owner exists. Returns a clear error if someone else claimed it first. A validate hook blocks silent reassignment except by Supervisors. Sets `claimed_at`, advances status to **Claimed**, records `first_response_at` on the first outbound human message.
6. **`sla.py`:** scheduled job (every minute). Finds leads in **New WhatsApp** with no owner older than N minutes (default **2**, configurable). Sends a CRM notification to Supervisors. After 2×N, applies the fallback assignment. Business hours (default 07:00–19:00 Africa/Kigali, Mon–Sat, **confirm with the owner**) pause escalation, and out-of-hours first contact gets an "we'll reply at 07:00" message.
7. **`security.py`:** HMAC verification, timestamp window, replay log (Redis or DB).
8. **`events.py`:** `ingest` endpoint (8.1). Maps each event to field updates + a Lead timeline comment. Idempotent by `event_id`. Monotonic status.
9. **`convert.py`:** "Send to Cleva" action: validates required fields (type, district, name, phone), calls Cleva `convert`, stores `cleva_record_*`. Idempotent (button double-click safe). Includes "Send signup link" (calls `signup-links`, sends the WhatsApp message using a template if outside the 24h window).
10. **`sso.py`:** exactly as in 8.3. Includes role map, user provisioning, replay protection, deactivation handler.
11. **Tests** for all of the above, including: duplicate webhook, two simultaneous claims, expired token, replayed token, forged signature, role escalation attempt via token, opt-out.

**Acceptance:** All tests pass. A staging demo script shows: message in → lead created → welcome Flow → answers mapped → claim → reply → convert → signup link.

````text
Read docs/crm/MASTER_PLAN.md (sections 4 to 8 and Phase 3), docs/crm/00-repo-audit.md and docs/crm/01-spike-report.md. Follow the spike findings over any assumption in the plan; if they conflict, tell me.
This is Phase 3. Inside the cleva_bridge Frappe app implement the modules listed in Phase 3 of the plan: phone, lead_ingest, flow_mapper, welcome automation, claim, sla, security, events, convert, sso, plus tests.
Requirements: follow ground rules 4 to 13 strictly. Never trust role data in tokens; map roles server-side. Mask phone numbers in logs. All endpoints must be idempotent and authenticated. Business hours, SLA minutes and feature switches must be settings, not constants.
Work in this order and commit after each module with its tests: phone -> security -> lead_ingest -> claim -> flow_mapper/welcome -> sla -> events -> convert -> sso.
If any module needs something the spike report marked unknown or failed, stop and ask me before improvising. Finish with the Appendix B report (include a beginner explanation of each module) and STOP.
````

---

### Phase 4: Cleva Market side (`crm_bridge` module)

**Goal:** Cleva can issue signup links, launch the CRM via SSO, receive conversions, and report milestones.

**Cursor builds in the Cleva repo (locations per audit):**

1. **Migrations** for the tables in 7.3 (reversible; show SQL to the human before applying).
2. **Feature flag** `CRM_INTEGRATION_ENABLED` (default off) and config for URLs, keys, and secrets (`.env.example` only).
3. **HMAC middleware** for `/api/internal/crm/*` with replay protection.
4. **Endpoints:** `signup-links`, `convert`, `assign` per 8.2. `convert` maps contact type to the existing Cleva structures:
   - Seller → seller lead / scout visit queue (**never a public listing**)
   - Buyer → market lead / demand
   - Scout candidate → scout application
   Deduplicate by phone against existing Cleva records. If a match exists, **link** rather than duplicate, and flag for human review when the match is ambiguous.
5. **Signup token consumption:** on `/join?t=…`, validate token (exists, unexpired, unused), prefill the form (editable), and on completed signup mark used, create `crm_links`, and enqueue `signup.completed`.
6. **Outbox worker:** sends events per 8.1 with the backoff rules, dead-letter alerting, and an admin page or CLI to retry dead events.
7. **Milestone emitters** at the real code points: visit scheduled/completed, seller verified, first flock captured, first listing published, first trade completed, scout application submitted/approved, buyer demand created. They must be **after-commit** hooks, so an event is only sent if the data really saved.
8. **"Messages" doorway:** nav entry visible only to authorised staff/scout roles. Backend launch route implements 8.3 and keeps `crm_user_links` current. Emits `user.deactivated` when a user is deactivated or loses their role.
9. **Tests:** signature/replay, token reuse/expiry, dedupe linking, outbox retry and idempotency, authorisation of the launch route (a buyer or seller must never get a launch token), and that disabling the feature flag disables everything.

**Acceptance:** End-to-end on staging: CRM lead → signup link → signup in Cleva → CRM lead shows **Signed Up** with the timeline entry; CRM down for 10 minutes → events still arrive afterward, exactly once.

````text
Read docs/crm/MASTER_PLAN.md (sections 4 to 8 and Phase 4), docs/crm/00-repo-audit.md, and the Phase 3 code in the cleva_bridge app so both sides match exactly.
This is Phase 4: the Cleva Market side. Implement everything in Phase 4 of the plan following the repo's existing conventions (see audit). Order: migrations (show me the SQL/migration files and wait for my OK before applying) -> config + feature flag -> HMAC middleware -> signup-links -> convert -> assign -> signup token consumption -> outbox + worker -> milestone emitters (after-commit only) -> Messages doorway + SSO launch -> deactivation event -> tests.
Rules: never create a public listing from CRM data; never issue SSO tokens to buyers or sellers; store only hashed signup tokens; mask personal data in logs; everything behind CRM_INTEGRATION_ENABLED. If an existing Cleva table or flow does not fit, stop and ask me rather than restructuring it.
Finish with the Appendix B report with a beginner explanation, and STOP.
````

---

### Phase 5: Routing, SLA and scout assignment

**Goal:** Contacts reach the right people quickly.

**Cursor builds:**
- A sync job that updates `Cleva District` and scout↔district coverage from Cleva (nightly + on change).
- Assignment on **Qualified** for sellers: "Assign to scout" action picks the district scout (round-robin or least-loaded among scouts covering the district; fallback to the supervisor if none). It calls Cleva `assign`. The seller appears in the scout's Cleva queue (Phase 6).
- Optional, **feature-flagged off**: automatic routing at first contact (Sellers → scout team by district, Buyers → market sales, Scout candidates → recruitment, Unknown → central qualification). Only enable once scouts have CRM accounts (D4/D5).
- Supervisor tools: reassign, bulk reassign when a person is away, "unclaimed longer than N minutes" saved view.
- Dashboards (CRM reports/dashboard): new leads/day by source and campaign, time-to-first-response, claim time, funnel conversion by stage, per-agent load, unclaimed breaches.

**Acceptance:** Tests with seeded districts and scouts: right scout chosen, no scout covers district → supervisor, reassignment emits an event, SLA breach alerts fire once (not repeatedly).

````text
Read docs/crm/MASTER_PLAN.md (sections 6 and 9 Phase 5) and the existing cleva_bridge and Cleva crm_bridge code.
This is Phase 5. Implement the district/scout sync, the "Assign to scout" action (round-robin among scouts covering the district, supervisor fallback), the supervisor reassignment tools, the funnel/SLA dashboards, and the optional feature-flagged automatic first-contact routing (OFF by default). Include tests with seeded districts and scouts. Make sure SLA alerts fire once per breach, not on every scheduler tick. Finish with the Appendix B report and STOP.
````

---

### Phase 6: Scout experience in Cleva

**Goal:** Scouts work only in Cleva Market and see only what they need.

**Cursor builds a "My sellers" queue in Cleva showing:** contact name, phone, district, bird count, expected selling date, qualification notes, visit status and next action, and a short **handoff summary** written by staff (not the raw chat). Scouts can: mark contacted, schedule a visit, record outcome, and capture the flock using the existing flows. Each action emits a milestone event to the CRM.

**Scouts must NOT see:** buyer conversations, unassigned contacts, other scouts' contacts, marketing analytics, the full CRM, or ERPNext.

**Acceptance:** Authorisation tests prove a scout cannot read another scout's seller by changing an ID in the URL or API call (IDOR test). Reassigning a seller removes it from the old scout's queue immediately.

````text
Read docs/crm/MASTER_PLAN.md (sections 4, 7, 8 and Phase 6) and the audit's UI and role findings.
This is Phase 6. Build the "My sellers" queue and detail page for scouts in Cleva using existing UI conventions. Show exactly the fields listed in Phase 6 and nothing more. Every query and endpoint must filter by the logged-in scout's assignments on the server side. Add tests proving a scout cannot access another scout's seller, any buyer data, or unassigned contacts, including by modifying IDs in requests. Emit milestone events for contacted/visit scheduled/visit completed. Finish with the Appendix B report and STOP.
````

---

### Phase 7: Hardening (security, privacy, operations)

**Cursor builds / documents:**

- **Webhook protection** (apply the S3 fix): verify `X-Hub-Signature-256` if the connector does not, rate limit, size limits.
- **Privacy:** consent capture (`consent_whatsapp`, `consent_at`), opt-out honoured everywhere, data retention policy (configurable) with a purge job, an export/delete-by-request procedure, restricted media access, call/chat access audit trail. Have the owner confirm requirements under Rwanda's personal data protection law (Law No. 058/2021, **verify current requirements with a local lawyer**).
- **Observability:** health endpoint, alerts for webhook failures, queue/outbox backlog, dead-letter events, and failed outbound messages; structured logs with masked PII.
- **Message cost dashboard:** count outbound messages per month by category (service / utility / marketing / authentication) per number, with an alert at 80% of the free service allowance and a monthly cost estimate (Section 13).
- **Backups and restore test** (documented, rehearsed). Secret rotation runbook (HMAC secrets, SSO keys, Meta token).
- **Security review checklist** (Section 10), completed with evidence.
- **Runbook:** "WhatsApp stopped arriving," "agent replied from the wrong lead," "token expired," "dead-letter events," "Meta template rejected."

**Acceptance:** Section 10 checklist all ticked with evidence; restore test performed once; alerts proven by deliberately breaking things on staging.

````text
Read docs/crm/MASTER_PLAN.md (sections 10, 13 and Phase 7) and all existing code.
This is Phase 7: hardening. Implement or document each item in Phase 7. Produce docs/crm/security-checklist.md with every item from section 10, each marked pass/fail/not-applicable with file paths or test names as evidence. Produce docs/crm/runbook.md covering the scenarios listed. Add the message-cost counters and alerts. Do not mark anything "pass" without evidence. Anything legal (data protection law) must be listed as an "owner to confirm with counsel" item, not decided by you. Finish with the Appendix B report and STOP.
````

---

### Phase 8: Pilot, then go/no-go (mostly human)

**Setup:** One production WhatsApp number, 2–3 marketers, real Facebook/Google campaigns (ideally Click-to-WhatsApp ads), a duration of 2 weeks, and daily check-ins.

**Pilot test list:**
inbound creation and duplicates, welcome Flow completion rate, claim races, reassignment, photos/voice notes/documents, template outside 24h, opt-out, out-of-hours behaviour, SLA alerts, SSO for each role, deactivated user lockout, conversion into Cleva, milestone sync back, and reporting accuracy against Meta's own message counts.

**Go criteria (all must hold):**

| Measure | Target |
|---|---|
| Inbound messages appear in CRM | ≥ 99.5% of Meta-delivered messages, p95 under 10 seconds |
| Duplicate leads per phone number | 0 |
| Lost or duplicated messages vs Meta's own records | 0 over 7 days |
| Double-claim incidents | 0 |
| Restricted-role isolation breaches | 0 |
| Flow answers mapped correctly | ≥ 99% |
| Median time to first human response | Agreed target set by the owner (e.g. under 5 minutes in business hours) |
| Agent verdict | Majority say the workflow is usable daily |
| Measured WhatsApp cost per qualified lead | Within the owner's budget |

**No-go:** Missing any hard criterion above that cannot be fixed in the bridge → switch to **Chatwoot** as the inbox, keeping our Cleva bridge contracts (Section 8) so the integration work is reused. Do not build a custom inbox.

---

### Phase 9 (optional, later): Calls and recording

Logging calls (time, outcome, notes, next action) already works inside the CRM. **Recording audio** needs an integrated telephony provider that supports Rwandan numbers and recording, plus consent/legal review. This is a separate project, to be scoped only after validating the providers. A normal mobile call cannot be reliably recorded by the CRM.

---

## 10. Security and privacy checklist

- [ ] All secrets in a secret manager or environment, none in git, rotation runbook exists
- [ ] Meta webhook signature verified; replayed messages ignored
- [ ] HMAC between systems: constant-time compare, 5-minute window, nonce/event-ID replay log
- [ ] SSO tokens: asymmetric, ≤ 60 s, single use, audience-checked, roles from a server-side map only
- [ ] No admin SSO; admin accounts native + 2FA
- [ ] Marketer/Scout roles: no Settings, no delete, no export (tested via API, not only UI)
- [ ] Scouts isolated (IDOR tests pass)
- [ ] Buyers/sellers can never obtain a launch token
- [ ] Signup tokens random (≥ 128 bits), stored hashed, single use, expiring
- [ ] Logs: no message text or full phone numbers at INFO+
- [ ] Media files access-controlled, not publicly guessable
- [ ] HTTPS everywhere; HSTS; CRM firewall allows only needed ports
- [ ] Automated backups + one successful restore rehearsal
- [ ] Opt-out honoured; consent recorded; retention/purge job; delete-on-request procedure
- [ ] Deactivated Cleva user → CRM user disabled and leads reassigned
- [ ] Rate limits on webhook and internal endpoints
- [ ] Dependencies pinned; Frappe WhatsApp pinned to a reviewed commit (and forked under the company account)
- [ ] Owner has confirmed legal/data-protection requirements with local counsel

---

## 11. Test matrix (minimum)

| Area | Cases |
|---|---|
| Phones | `07…`, `+250…`, `250…` (wa_id), spaces/dashes, invalid, foreign numbers |
| Ingest | first message; second message; two simultaneous messages; webhook retry (same ID); out-of-order; media only; emoji/Kinyarwanda text |
| Flow | complete, partial, unknown district, wrong type, replayed |
| Claim | single claim; two simultaneous claims; claim after assignment; Supervisor override |
| SLA | breach once; business-hours pause; fallback assignment |
| Events | duplicate event; unknown lead; backward status attempt; CRM down then recovered; dead-letter after 8 failures |
| SSO | valid; expired; replayed; wrong audience; forged signature; role escalation attempt; deactivated user; buyer/seller attempt |
| Convert | double-click; existing Cleva phone match; ambiguous match; missing fields; each contact type |
| Signup | valid token; reused; expired; edited prefill; phone differs from WhatsApp phone |
| Scout | own sellers only; ID tampering; reassign removes access immediately |
| Flag | `CRM_INTEGRATION_ENABLED=false` disables launcher, endpoints, emitters |

---

## 12. Definition of done (per phase)

1. Code merged only after tests pass and the diff is reviewed by the human.
2. Phase report written (Appendix B).
3. Any new setting documented in `.env.example` / site config docs.
4. Migrations reversible and applied to staging successfully.
5. No ground rule from Section 4 violated.

---

## 13. Cost model

| Item | Cost |
|---|---|
| Frappe CRM, Frappe WhatsApp, `cleva_bridge`, Cleva integration | Software is free (open source). **You pay for server capacity, backups, and engineering time.** |
| CRM seats | No per-seat licence when self-hosted |
| WhatsApp customer messages **received** | Free |
| WhatsApp replies in the 24h window | **As of 1 Oct 2026, reportedly billable beyond the first 1,000 delivered service messages per business number per month.** Verify on Meta's rate card for +250. |
| Utility / marketing / authentication templates | Billed per delivered message, by destination country. |
| Click-to-WhatsApp ad conversations | Messages free for 72 hours from the ad click (free entry point). |
| Telephony and call recording | Separate paid provider (Phase 9) |

**Budget formula (fill in after confirming rates):**
`monthly_cost = (service_messages − 1000 free) × service_rate + utility_templates × utility_rate + marketing_templates × marketing_rate`

**Ways to keep message volume down:** one welcome Flow instead of five chat messages, short agent replies, a signup link in one template, and never auto-replying twice per window. Click-to-WhatsApp ads lower cost further, thanks to the free-entry-point window.

---

## 14. Risks

| Risk | Mitigation |
|---|---|
| **Frappe WhatsApp is community-maintained** and may lack features or stall | Pin and fork it, review its code (spikes S1–S8), keep Cleva logic in our bridge, keep Chatwoot as the fallback |
| Restricted roles cannot see unassigned leads, so cannot claim | Decision D4 (Marketer role); scouts not in CRM during the pilot |
| Meta pricing changes again | Message cost counters + alerts; budget reviewed monthly |
| Meta account/business verification delays | Start now |
| Number migration/ban risk | Follow Meta's policies; avoid bulk unsolicited messaging; honour opt-outs; template quality |
| Wrong person matched on signup | Token-based linking only (D8) |
| Outages cause lost milestones | Outbox + retries + dead-letter alerts |
| Staff misuse of data | Role limits, no export, audit trail, privacy policy, retention |
| Frappe/CRM upgrades break our bridge | Pinned versions, staging upgrades, bridge tests |

---

## 15. Open questions for the owner

1. Where is ERPNext hosted: self-hosted server or Frappe Cloud? (Affects where the CRM runs.)
2. Is the production WhatsApp number already used on a phone app? If so, do you need to migrate it?
3. What are the real **business hours** and the target time to first response?
4. Which languages must the welcome Flow and templates support (Kinyarwanda, English, French)?
5. What bird/flock types and districts must appear in the Flow? (Phase 0 will propose them from the Cleva data.)
6. Who are the supervisors and the first 2–3 pilot marketers?
7. Monthly WhatsApp budget ceiling?
8. Should scouts ever reply on WhatsApp themselves, or only call from their own phones? (Decides whether D4's second stage is needed.)
9. Is there a lawyer or compliance contact to confirm data-protection and call-recording requirements?

---

## Appendix A: `.cursor/rules/cleva-crm.mdc`

```
---
description: Rules for the Cleva CRM + WhatsApp integration project
alwaysApply: true
---

Project: integrate Frappe CRM + Frappe WhatsApp with Cleva Market. Source of truth: docs/crm/MASTER_PLAN.md.

- Read MASTER_PLAN.md sections 4 (ground rules), 6 (decisions), 7 (data model) and 8 (contracts) before changing any CRM-related code.
- Inspect the existing code and follow its conventions; never assume file paths, table names or frameworks.
- Work on one phase at a time. Stop after each phase with the Appendix B report.
- Never touch ERPNext accounting. Never create public listings from WhatsApp data.
- No secrets in code. Mask personal data in logs. All internal endpoints must be HMAC-authenticated, replay-protected and idempotent.
- Never trust roles from tokens or request bodies.
- Migrations must be reversible and shown to the user before applying.
- Everything behind CRM_INTEGRATION_ENABLED. Write tests with the code.
- If the plan conflicts with the codebase or a verified fact, stop and ask.
- Explain changes in plain language for a beginner.
```

## Appendix B: Phase report template

```
# Phase N report
1. What was built (plain-language, for a beginner)
2. Files created/changed (path: one-line purpose)
3. How to run it and the tests (exact commands)
4. Test results (pass/fail counts, any failures explained)
5. Deviations from MASTER_PLAN.md and why
6. Decisions I need from the owner
7. Risks or things I am unsure about
8. What the next phase needs from the human
```
