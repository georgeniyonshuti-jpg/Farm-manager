# Recruitment Analytics: Master Build Spec

> **Audience:** Cursor's coding agent, and the human who reviews its work.
> **Owner:** Ops / recruitment team · **Revised:** 2026-10-22 · **Version:** 2 (research-backed)
>
> **Goal in one line:** Turn *Insights → Recruitment* from a page of numbers that contradict each other into a credible, beautiful, decision-ready system that tells the team **who to call today, where to spend ad money, which scouts to coach, where recruits get stuck, and whether supply and demand are growing together.**

---

## Table of contents

0. How to use this file (start here)
1. Mission, users, and the decisions the page must support
2. Decisions to confirm before building (with recommended defaults)
3. What the best teams do (research digest)
4. Forensic review of today's page
5. Data foundation (do this before any chart)
6. Metric dictionary (definitions are law)
7. Product spec: every tab and screen
8. Design system and chart rules
9. Engineering architecture and quality
10. Privacy and security
11. Build phases, acceptance checks, and per-phase prompts
12. Master prompt (paste this first)
13. Cursor operating manual for beginners
14. Alternatives considered
- Appendix A: SQL patterns
- Appendix B: TypeScript helpers (statistics)
- Appendix C: Snapshot JSON contract
- Appendix D: Recommended-action rules
- Appendix E: Headline sentence templates
- Appendix F: `/verify-analytics` command and the `.mdc` rule
- Appendix G: Seed-data spec
- Appendix H: Glossary
- Appendix I: Sources

---

## 0. How to use this file (start here)

### 0.1 Where to save things

```
your-project/
├─ docs/recruitment-analytics/
│  ├─ SPEC.md                                  ← this file (rename it to SPEC.md)
│  ├─ reference/current-recruitment-page.png   ← screenshot of today's page
│  └─ AUDIT.md                                 ← Cursor creates this in Phase 0
└─ .cursor/rules/recruitment-analytics.mdc     ← the short rule file (delivered with this spec)
```

**Why the rule file ends in `.mdc`:** Cursor only recognises project rules with the `.mdc` extension. A plain `.md` file inside `.cursor/rules/` is ignored. This spec is plain `.md` on purpose, because it lives in `docs/` and Cursor reads it when you `@`-mention it.

### 0.2 The workflow, step by step

1. **Open your project in Cursor** and make sure it uses git. In the terminal run `git status`. If it works, create a safe branch: `git switch -c feature/recruitment-analytics`. A branch means you can always throw the work away without hurting the live app.
2. **Open the Agent chat** (`Cmd+L` on Mac, `Ctrl+L` on Windows/Linux).
3. **Turn on Plan Mode** with `Shift+Tab` in the chat box. In Plan Mode Cursor researches your code, asks you questions, writes a plan you can edit, and waits for your approval before changing anything.
4. **Paste the Master Prompt** from section 12. It points Cursor to this file and the screenshot.
5. **Read the plan.** It opens as a Markdown file. Delete steps you don't want. Add notes. Then approve.
6. **After every phase:** type `/verify-analytics` (Appendix F), check the acceptance list for that phase (section 11), then commit: `git add -A` then `git commit -m "Phase N: short description"`.
7. **Start a new chat for each new phase.** Cursor's own guidance is that long conversations make the agent lose focus. In the new chat, `@`-mention `SPEC.md` and `AUDIT.md` so nothing is lost.
8. **If Cursor builds something wrong**, do not argue with it in chat. Undo the changes (`git restore .` for uncommitted work), make the plan more specific, and run it again. That is faster and cleaner than patching a confused agent.

### 0.3 Why this is a file and not one giant chat message

- Cursor's best-practice guide says to plan first, write specific prompts, and give the agent **verifiable goals** (tests, linters, checks). This spec is full of those.
- Long chats accumulate noise. A file the agent re-reads on demand stays sharp.
- Rules (always-on context) should stay short. So the always-on part is a ~40-line `.mdc`, and the heavy detail lives here.
- You can edit this file as the business changes, and every future chat gets the update.

### 0.4 How to read the spec

- **Sections 1-4** explain *why*. Read them once.
- **Sections 5-10** are the *what*. Cursor will keep returning to them.
- **Section 11** is the *order of work*, with a ready-to-paste prompt per phase.
- Anything marked **MUST** is a hard requirement. **SHOULD** is a strong default. **MAY** is optional.
- Anything marked **Hypothesis** is an educated guess from the screenshot. Cursor must verify it against the real code and data in Phase 0. **Never trust a hypothesis as a fact.**

### 0.5 Ground rules for the agent (applies to every phase)

1. **Never invent data, fields, tables, or numbers.** If something is missing, say so and propose how to capture it.
2. **Never show a metric without its definition and its sample size (n).**
3. **Reuse the existing stack** (framework, styling, chart library, API layer). Do not add a second styling system or a second charting library without asking.
4. **Do not break existing pages or routes.** Build the new dashboard beside the old one behind a flag; swap only after sign-off.
5. **Explain in plain language** what you are doing. The reviewer is a beginner.
6. **Small, reviewable steps.** After each task list the files changed and why.
7. **No real personal data in tests, screenshots, seeds, logs, or exports.**
8. **Stop and ask** when a definition is ambiguous. Do not guess silently.

---

## 1. Mission, users, and the decisions the page must support

### 1.1 Business context

We run a B2B marketplace in Rwanda for **live broiler chickens sold as a commodity in bulk**. Supply, demand, and the field network are recruited through Facebook and Instagram ads, WhatsApp, direct links, markets, and word of mouth.

| Role | Who they are | Why they matter |
|---|---|---|
| **Seller** | Farmers who raise broilers and want market access. They create listings (lots) of chickens. | Without supply, buyers find nothing and leave. |
| **Buyer** | Butcheries, restaurants, hotels, caterers, traders buying in bulk. | The hardest and most valuable side. Without demand, sellers lose faith. |
| **Scout** | Field agents who find buyers and sellers (mostly buyers), verify that chickens really exist and are available, and get paid in RWF. | They make supply credible and demand reachable. |

The platform publishes available chickens online so anyone can access and buy them. The analytics exist to **manage recruitment**, not to decorate it.

### 1.2 Who uses this page

- **Ops lead** (primary): opens it Monday morning on a laptop for the weekly review, and on a phone during the week.
- **Recruitment callers**: use the people queue every day.
- **Managers**: want the 30-second story and the weekly briefing.

### 1.3 The eight decisions the page must answer

| # | Decision the team makes | Where the page answers it |
|---|---|---|
| 1 | Are we on pace for this week's targets (sellers, buyers, scouts)? | Command Center target cards |
| 2 | Who should we call or WhatsApp today? | People tab, work queue |
| 3 | Which channel is wasting money and which deserves more? | Channels tab |
| 4 | Where do recruits get stuck, and for how long? | Funnels tab and stage track |
| 5 | Which scouts need help, payment, or recognition? | Scouts tab |
| 6 | Is supply growing in step with demand, and where are the gaps? | Supply vs Demand and district coverage |
| 7 | Can we trust these numbers today? | Data confidence badge and Data Quality panel |
| 8 | What do we tell the team on Monday? | Weekly Briefing |

### 1.4 Success criteria (testable)

| ID | Criterion | How we check it |
|---|---|---|
| S1 | **30-second test:** a new manager can state the page's main message in 30 seconds. | Show a colleague the Command Center for 30 seconds, then ask. |
| S2 | **Zero contradictions:** every invariant in section 6.9 passes. | `/verify-analytics` reports all green. |
| S3 | **Every number has a definition and an n.** | Visual review plus a test that scans metric components for a definition id. |
| S4 | **Mobile is usable** at 390 px width with no horizontal page scroll. | Browser screenshots at 390 px. |
| S5 | **Fast:** skeleton shows in under 100 ms; data is ready within 2 s at the 75th percentile on a mid-range Android phone on a normal mobile connection. | Performance check in Phase 8. |
| S6 | **Actionable:** every alert opens a list of the actual people or records behind it. | Click-through test. |
| S7 | **Adopted:** the team opens the Weekly Briefing every Monday for four weeks running. | Internal usage log (Phase 8). |
| S8 | **Honest:** unattributed, invalid, and imputed data are visible, never hidden. | Data Quality panel shows counts. |

---

## 2. Decisions to confirm before building

Some definitions are business choices, not technical ones. **If the owner does not answer, Cursor uses the recommended default and records it in `AUDIT.md`.** Change them here later and every metric updates, because definitions live in one module (section 9).

| ID | Question | Recommended default | Why |
|---|---|---|---|
| D1 | What makes a **seller activated**? | First listing is **live and verified** (by a scout or admin). | The screenshot's channel header says "activated listing", and an unverified listing does not give buyers anything trustworthy. |
| D2 | What makes a **buyer activated**? | Profile complete **and** first inquiry or order request on a listing. | Signing up alone proves nothing about intent. |
| D3 | What makes a **scout activated**? | Approved **and** at least one verified lot or lead submitted. | "Approved" is a paperwork state, not productivity. |
| D4 | What is a "week"? | Monday 00:00 to Sunday 23:59:59 in **Africa/Kigali** time. | Weekly targets need a fixed calendar; Rwanda has no daylight saving. |
| D5 | Do target cards follow the 7d/14d/30d picker? | **No.** Target cards always show the **current calendar week**. | A weekly target compared against a 30-day count is meaningless. The picker controls trends and funnels only. |
| D6 | When is someone "stuck"? | Seller: 2 days at Applied without contact, 5 days at Contacted without KYC, 5 days at KYC without a live listing. Buyer: 3 days at Profile without contact. Scout: 3 days at Applied, 7 days at Approved without a first lot. | Thresholds come from section 6.5 and are editable. |
| D7 | When is someone "dead"? | No activity for **14 days** and not activated, or marked Unreachable / Not a fit. | Matches the screenshot's "Dead %" column intent. |
| D8 | What are the weekly targets? | Sellers activated: 10. Scouts activated: 2. Buyers activated: **owner to set** (not visible in the screenshot). Per scout: 8 lots, 4 sellers, 400 birds per week, **if** that is per scout. | Screenshot shows 10 and 2, and "Target 8 lots · 4 sellers · 400 birds / week". |
| D9 | Is the scout target per scout or for the whole team? | **Per scout** (the table shows "vs target" per scout). | Confirm. |
| D10 | Who may see phone numbers? | Admin and recruiter roles only; masked by default (+250 78•• ••• 12), reveal-on-click is logged. | Privacy (section 10). |
| D11 | Who enters ad spend, and how often? | Ops lead, weekly, through a simple form in the dashboard. | Cost per activation is impossible without spend. |
| D12 | Do staff create listings on behalf of sellers? | **Owner to confirm.** If yes, track `created_by` and `assisted` on every listing. | This is the leading explanation for a negative "Days to list" (section 4). |
| D13 | What does "fail rate 11.1%" in the Accounts card mean? | **Owner to confirm.** | It is undefined on screen. Cursor must find how it is computed. |
| D14 | Time horizon for channel conversion windows | **14 days** from account creation. | Seller activation usually happens within days; adjust after Phase 1 data review. |
| D15 | Typical broiler cycle used for supply forecasts | About 5 to 7 weeks from chick placement to market. **Owner to confirm with real flock data.** | Supply is perishable, so forecasting from flocks beats counting only today's listings. |

---

## 3. What the best teams do (research digest)

Each row is a principle found in published guidance, plus what it means for this build. Full links are in Appendix I.

| # | Principle | Source type | What it means here |
|---|---|---|---|
| P1 | **Plan before code, write specific prompts, give the agent verifiable goals, start new chats when it drifts, keep always-on rules short.** | Cursor's agent best-practices guide and rules docs | Phased build, tests first, a short `.mdc`, one chat per phase. |
| P2 | **In a two-sided marketplace, liquidity is the real health metric. Activation on one side depends on the other side. Onboard the harder side where the other side already has density. Track supply and demand balance by geography.** | Marketplace metrics and onboarding guides | Supply-vs-demand widget, district coverage, buyer funnel as a first-class citizen. |
| P3 | **Funnel hygiene:** count unique people, define step order, use an explicit conversion window, cohort by entry date, report **median** time to convert (first conversion per user). | Amplitude funnel documentation | Cohort mode vs Activity mode (section 6.2); this is the structural fix for the 1100% problem. |
| P4 | **Small samples need honesty:** use Wilson intervals (never the naive Wald, which collapses to [0,0] at zero conversions), and print the n next to every rate. | Statistics and A/B-testing references | `wilson()` helper, low-sample badges, names-and-counts view when n is tiny. |
| P5 | **Cohort triangles:** one row per cohort, one column per age; a dash means "not reached that age yet", not zero; show cohort size; tiny cohorts are noisy. | Metabase glossary and cohort tools | Cohort heatmap spec in section 7.6. |
| P6 | **Dashboard design:** the most important element is the largest and most prominent; group related items; limit notifications (Few suggests no more than two); use colour sparingly; red and green alone fail colour-blind users; encode quantities with **length and 2D position**; treemaps are unsuitable for simple dashboards; use tabular numerals. | Stephen Few (via published summaries), Nielsen Norman Group | Design system (section 8): top two alerts only, icons plus text with colour, bars and lines over exotic charts. |
| P7 | **Agent and field-force boards are for supporting people, not shaming them.** Raw per-agent counts get gamed the moment they become a scoreboard; normalise before comparing. | Metabase agent-performance guidance | Scouts tab normalises by tenure and ramp period; language is "needs support". |
| P8 | **Dark social:** links shared in WhatsApp arrive with no referrer and are filed as "direct"; tag every link you control. **Click-to-WhatsApp ads** pass a referral id (`ctwa_clid`) only through the official WhatsApp Business API. | Attribution guides and WhatsApp-ads tooling docs | Tracked links, scout referral codes, self-reported source, honest "Unattributed" row. |
| P9 | **Weekly Business Review:** same metrics, same order, every week; recent six weeks beside a twelve-month trend; separate **input metrics** (what you control) from **output metrics**. | Amazon WBR as documented by practitioners | Weekly Briefing slides and the inputs-vs-outputs trend view. |
| P10 | **Charts:** Recharts is the default for React dashboards (and shadcn/ui charts wrap it); Apache ECharts is for Sankey, geo, or very large data. | Chart-library comparisons | Use what the project already has; build the cohort heatmap and stage track as custom components. |
| P11 | **Rwanda privacy law (Law No. 058/2021):** controllers must register; breaches are reportable within 48 hours; storing personal data outside Rwanda needs authorisation. | Law-firm summaries | Keep analytics in-house, mask phone numbers, no personal data in exports or third-party SDKs. **This is not legal advice; confirm with counsel.** |
| P12 | **Our addition: the dashboard checks itself.** Automated reconciliation (parts must equal totals) runs on every load and surfaces failures. | Engineering judgement | Section 9.4. |


---

## 4. Forensic review of today's page

This section is based **only on the screenshot** of *Insights → Recruitment* (range = 7d). Everything here is evidence or **hypothesis**. Cursor MUST verify each item against the real code and database in Phase 0.

### 4.1 What the screenshot shows

| Widget | Values on screen |
|---|---|
| Link opens | 49, with the subtitle "1019 started joining" |
| Accounts | 16, with "11.1% fail rate" |
| Sellers activated | 5 / 10 ("BELOW"), "50% of weekly target · 17 new" |
| Scouts activated | 0 / 2, "0% of weekly target · 4 new" |
| People in recruitment | Application 16, Not a fit 1, all other stages 0 |
| Alerts (green links) | "16 sellers stuck early", "4 scouts below 40% target" |
| Scout management | "Target 8 lots · 4 sellers · 400 birds / week", Apps pending 0, Approved 4, Unpaid 0 · 0 RWF |

**Channels table** (columns: Opens / Accounts / Sellers act. / Dead % / Days to list / First paid / Scouts):

| Source | Opens | Accounts | Sellers act. | Dead % | Days to list | First paid | Scouts |
|---|---|---|---|---|---|---|---|
| Direct | 40 | 3 (7.5%) | 1 (50%) | 0% | 0d | 0 | 1 |
| WhatsApp | 1 | 11 (**1100%**) | 3 (37.5%) | 0% | 0d | 0 | 2 |
| Facebook | 3 | 2 (66.7%) | 0 (0%) | 0% | n/a | 0 | 1 |
| market | 3 | 0 (0%) | 0 (0%) | 0% | n/a | 0 | 0 |
| Instagram | 2 | 0 (0%) | 0 (0%) | 0% | n/a | 0 | 0 |
| unknown | 0 | 0 (0%) | 1 (16.7%) | 0% | **-1.6d** | 0 | 0 |

### 4.2 Arithmetic cross-checks (what reconciles and what doesn't)

| Check | Result |
|---|---|
| Sum of Opens: 40+1+3+3+2+0 | **49** ✓ matches the card |
| Sum of Accounts: 3+11+2+0+0+0 | **16** ✓ matches the card |
| Sum of Sellers act.: 1+3+0+0+0+1 | **5** ✓ matches "5 / 10" |
| Sum of Scouts: 1+2+1+0+0+0 | **4** ✓ matches "4 new" |
| Implied seller base from the percentages: 1 (50%) means 2 sellers; 3 (37.5%) means 8; 1 (16.7%) means 6 | 2 + 8 + 6 = 16 across three rows, plus a Facebook seller or more, consistent with **"17 new" sellers** |
| Pipeline: Application 16 + Not a fit 1 | **17** ✓ equals the 17 new sellers |
| Accounts card says | **16**, not 17 or 21 |

**Reading:** the totals add up, so the page is *internally consistent in places*. The real problem is that **three different populations are used without being named**: 16 "accounts", 17 new sellers, and 4 new scouts (plus an unknown number of buyers). The `unknown` row holds about 6 sellers but 0 accounts, so those sellers are counted as people but not as accounts. A manager cannot tell how these relate.

### 4.3 Findings, with hypotheses and the checks that settle them

| ID | Finding | Hypothesis (verify!) | How Cursor verifies | Fix direction |
|---|---|---|---|---|
| F1 | Two top-of-funnel numbers: 49 opens vs "1019 started joining". | Different scope: 49 is link-open events in the selected 7 days; 1019 may be all-time, or non-unique "signup started" events. | Run both queries with identical filters; compare `count(*)` and `count(distinct visitor)`; compare date ranges. | One named definition per number; show scope in the label. |
| F2 | WhatsApp: 1 open → 11 accounts = 1100%. Direct: 40 opens → 3 accounts. | **Attribution is assigned at two different moments with two different rules.** Opens are classed by HTTP referrer at click time. WhatsApp strips the referrer, so its clicks land in "Direct" (40 opens, weak conversion). Accounts are classed by a stored `source` or `utm` value at signup, where WhatsApp wins (11). | Inspect how `channel` is set in the open-tracking code and in the signup code; compare. | **One first-touch channel per visitor**, set once from a tracked link code and carried into the account (section 5.5). Rates computed within a single population (section 6.2). |
| F3 | "Days to list" = **-1.6d** for `unknown`. | (a) **Staff created the listing before the seller's account existed** (the `unknown` row has sellers but no accounts); (b) imported or migrated records; (c) UTC vs local time mix-up; (d) wrong timestamp columns. Rank (a) first. | Query listings whose `created_at` is earlier than the owner's `created_at`; inspect `created_by`. | Store `created_by` / `assisted`; report **assisted vs self-serve** separately; exclude invalid durations and count them in Data Quality (never display negatives). |
| F4 | Pipeline shows 16 at Application while 5 sellers are already activated. | The pipeline stage is a manually maintained field that is **not reconciled with real events** (a live listing does not advance the stage). Therefore "16 sellers stuck early" overstates the problem. | Compare `stage` with `first_listing_at` per person. | Derive stage from events; manual overrides allowed but logged; auto-advance rules (section 5.8). |
| F5 | "Dead %" is 0% on every row. | Dead needs ~14 days of inactivity, so it **cannot** occur inside a 7-day window; or the flag is never set. | Check how the column is computed and whether any record has the flag. | Define dead on cohort age; show "too early" instead of 0%. |
| F6 | Scouts: "0 / 2 activated", "4 new", "Approved 4", every visible scout has 0 lots. | Not necessarily a bug: three different states (new, approved, activated) are unlabeled. The real story is **"4 approved scouts, 0 lots"**. | Confirm the three definitions in code. | Scout funnel (Applied, Approved, Activated, Productive) with plain labels; alert "approved but no first lot". |
| F7 | **Buyers are absent** from every widget. | Buyer data may exist but is not queried; or buyers are not captured as a role yet. | Search the schema for buyer/demand tables. | Buyer funnel and demand metrics as first-class (sections 6 and 7). |
| F8 | "11.1% fail rate" is undefined. | Could be signup errors, failed KYC, or something else. | Trace the calculation. | Rename and define, or remove. |
| F9 | "Sellers act." percentages have a different hidden denominator in every row. | Row-level share of that channel's sellers. | Read the query. | Always print "x of N". |
| F10 | Card says "50% of weekly target" while the picker offers 14d and 30d. | The target is not scaled or isolated when the range changes. | Switch range and read the card. | Decision D5: target cards always show the current calendar week. |
| F11 | Layout defects: section text touches the left edge; the 7d/14d/30d control overlaps the header; the API-status toast covers table content; a blue outline surrounds the main area. | Missing container padding or a negative margin; an absolutely positioned control; a toast without safe offsets; a focus ring applied to a container. | Inspect the DOM and CSS in the browser tool at 1440 px and 390 px. | Design-system layout (section 8). |
| F12 | Almost everything is single digits. | At about 17 new sellers per week, **percentages are noise**. | n/a | "Small-numbers mode": show names and counts first, rates second (section 7.1). |

### 4.4 Why this matters for the design

Because volumes are small today but will grow, the dashboard MUST work in two regimes:

- **Small-numbers regime (now):** person-level views (stage track, work queue, named lists) beat aggregate charts. Rates carry a "small sample" badge and a range.
- **Scale regime (later):** funnels, cohorts, and channel quality scores become meaningful. The same components switch automatically when n crosses the thresholds in section 6.7.

---

## 5. Data foundation (do this before any chart)

> **In plain words:** most "bad analytics" is not a charting problem. It is a *counting* problem. If people are counted differently in different places, no chart can fix it. So we first create **one trusted table of facts per person**, then every chart reads from it.

### 5.1 Principles

1. **Events are the source of truth.** A stage is *derived* from what happened (timestamps), not typed in by hand. Manual changes are allowed but are stored as events with who and when.
2. **Store UTC, display Africa/Kigali.** Weeks start Monday in Kigali time.
3. **One row per person per role** in the analytics layer (a person can be both a seller and a buyer).
4. **Exclude internal and test accounts** (`is_internal = true`) from every metric.
5. **De-duplicate people** by normalised phone number (format `+2507XXXXXXXX`, derived from numbers typed as `07X XXX XXXX`). Keep the earliest record as canonical and link duplicates.
6. **Never delete or overwrite history.** Corrections are new events. This is what lets last week's briefing stay stable.
7. **Everything is auditable:** every number can be traced to a list of people.

### 5.2 Options considered (beginner-friendly)

| Option | What it is | Pros | Cons | Verdict |
|---|---|---|---|---|
| **A. SQL views over existing tables** | Create read-only views (`analytics.person_facts`, etc.) that compute timestamps from tables you already have. | Non-destructive; fast to build; no migration risk; easy to throw away. | Only as good as the timestamps that already exist; stage history may be missing. | **Start here (Phase 1).** |
| **B. Event ledger table** | A new append-only table `person_events` that records every stage change, link open, call, and verification. | Perfect history, dwell times, auditability, replayable. | Needs code changes where events happen; history before launch is missing. | **Add going forward (Phase 2), backfilled from A where possible.** |
| **C. Third-party analytics (Mixpanel, Amplitude, PostHog cloud)** | Send events to an external service. | Great tooling out of the box. | Personal data leaves Rwanda (authorisation issue), split definitions, cost, no workflow (kanban, briefing). | **Not now.** Revisit self-hosted options only if A+B prove insufficient. |

**Recommendation: A first, then B.** A gives credible numbers within days. B gives the history that cohorts, aging, and dwell times need as the company grows.

### 5.3 The canonical table: `analytics.person_facts` (view or table)

Cursor MUST adapt names to the real schema discovered in Phase 0. Target columns:

| Column | Meaning | Notes |
|---|---|---|
| `person_id`, `role` | Identity and role (seller / buyer / scout). | One row per person per role. |
| `created_at` | Account created (UTC). | Entry event for cohort mode. |
| `first_touch_channel`, `first_touch_campaign`, `first_touch_creative`, `first_touch_at` | Where they first came from. | Section 5.5. |
| `self_reported_source` | "How did you hear about us?" | Fallback and cross-check; never overwrites first touch. |
| `link_open_at` | First tracked link open by the same visitor, if any. | Null for channels without links. |
| `signup_started_at` | Signup form opened. | Optional. |
| `application_submitted_at` | Application submitted. | |
| `contacted_at` | First successful call or message from staff. | |
| `kyc_verified_at` | Identity/business verified. | |
| `activated_at` | Role-specific activation (D1-D3). | Section 6.1. |
| `productive_at` | Role-specific first value (first paid sale/order, first commission). | |
| `last_activity_at` | Latest meaningful action. | Drives stuck/dead. |
| `current_stage`, `stage_entered_at` | Derived stage and when it began. | Section 5.8. |
| `district`, `sector` | Location, normalised to the 30 Rwandan districts. | Section 5.9. |
| `is_internal`, `is_synthetic` | Exclusion flags. | |
| `assisted` | A staff member did the key action (e.g. created the listing). | D12. |
| `dq_flags` | Array of data-quality flags (imputed step, invalid duration, unattributed...). | Section 5.10. |

### 5.4 Event types (for the ledger, option B)

`link_opened`, `signup_started`, `account_created`, `application_submitted`, `call_scheduled`, `call_attempted` (with outcome), `contacted`, `kyc_submitted`, `kyc_verified`, `listing_created`, `listing_verified`, `listing_live`, `inquiry_made`, `order_requested`, `order_paid`, `scout_approved`, `scout_lot_submitted`, `scout_lot_verified`, `payout_due`, `payout_paid`, `stage_changed_manually`, `marked_unreachable`, `marked_not_a_fit`, `note_added`.

Required fields on every event: `id`, `person_id`, `role`, `type`, `occurred_at` (UTC), `actor_id` (who did it, or `system`), `source` (`system` / `staff` / `import`), `payload` (JSON, small).

### 5.5 Attribution design (fixes F2 and the "unknown" row)

**Goal: one first-touch channel per person, assigned once, never contradicted later.**

1. **Tracked links.** Create a `tracked_links` table and a small admin "Create link" tool: `code` (short, e.g. `fb-oct-sellers-a`), `channel`, `campaign`, `creative`, `target_role`, `destination`, `created_by`. Every ad, WhatsApp post, flyer, and scout card uses one.
2. **Visitor id.** On first open, set a first-party cookie `visitor_id` and log `link_opened` with the link code. At signup, copy the visitor's first-touch into the account. This stitches "open" to "account" so both live in the same population.
3. **Scout referral codes.** Each scout has a code and QR. Accounts created with it get channel `scout_referral` and `referred_by_scout_id`. This also produces "sellers brought" and "buyers brought" without manual counting.
4. **WhatsApp specifics.** Links pasted into WhatsApp arrive **without a referrer** and look like "Direct" ("dark social"). So for WhatsApp, **always share tracked links**, never bare URLs. For **click-to-WhatsApp ads**, Meta attaches a referral object (including `ctwa_clid`) to the first inbound message **only through the official WhatsApp Business API**; if the business uses the plain WhatsApp Business app, ad attribution is not available. The audit MUST find out which one is in use.
5. **Self-reported source.** Add an optional "How did you hear about us?" question. Store it separately as `self_reported_source`. Display both; when they disagree, the dashboard says so instead of hiding it.
6. **Channel taxonomy** (normalised slugs, lower-case): `facebook_ads`, `instagram_ads`, `whatsapp_ctwa_ads`, `whatsapp_group_share`, `whatsapp_direct_share`, `scout_referral`, `market_visit`, `word_of_mouth`, `organic_search`, `direct_unknown`. The `unknown` bucket MUST be shown, with its size, labelled **"Unattributed"**.
7. **Rule for conversion:** a channel's conversion is computed **only within people attributed to that channel**. If a channel has no link-open event (offline, scouts, WhatsApp groups before tagging), its **Opens show "n/a"** and its funnel starts at *Account created*. Never divide accounts by an unrelated open count.

### 5.6 Ad spend

Table `ad_spend`: `date`, `channel`, `campaign` (optional), `amount_rwf`, `impressions` (optional), `clicks` (optional), `entered_by`, `entered_at`. Phase 1 adds a **manual entry form** (weekly). Importing from Meta's reporting is a later, optional upgrade.

### 5.7 Targets (versioned)

Table `targets`: `role`, `metric` (e.g. `sellers_activated_per_week`), `scope` (`team` / `per_scout`), `value`, `effective_from`, `created_by`. Changing a target creates a **new row**. Old weeks keep the target that applied then, so history does not rewrite itself.

### 5.8 Stages and auto-advance rules

**Stages per role** (names editable):

- **Seller:** Applied → Contacted → KYC → Listing live (= activated) → First paid. Side states: Follow-up needed, Unreachable, Not a fit.
- **Buyer:** Applied → Profile complete → Verified → First inquiry/order (= activated) → First paid. Side states as above.
- **Scout:** Applied → Interviewed → Approved → First verified lot (= activated) → Productive. Side states: Dormant, Not a fit.

**Auto-advance rules (these fix F4):**

| Event | Effect |
|---|---|
| `listing_live` (seller) | Stage becomes *Listing live*, whatever it was before. Sets `activated_at` if empty. |
| `kyc_verified` | Stage becomes at least *KYC*. |
| `contacted` | Stage becomes at least *Contacted*. |
| `scout_lot_verified` (first) | Scout becomes *Activated*. |
| `order_paid` (first) | *First paid*. |
| Manual change by staff | Allowed; stored as `stage_changed_manually` with reason. *Not a fit* and *Unreachable* REQUIRE a reason. |
| No activity for the "dead" threshold | Shown as **Dormant/Dead** in analytics; the stage itself is not overwritten. |

"At least" means a person never moves backwards automatically.

### 5.9 Geography

Rwanda has **5 provinces and 30 districts**. Keep a lookup table `districts` (`id`, `name`, `province`) and normalise all free-text districts to it (handle spelling variants and casing). Anything that does not match goes to **"District unknown"** and counts in Data Quality. For maps, use an open-licence boundary file (geoBoundaries ADM2 or NISR), simplified to well under 200 KB and bundled as a static asset. **No map-tile service and no external geo API.**

### 5.10 Data-quality checks (feed the Data Quality panel and the confidence badge)

| ID | Check | Severity |
|---|---|---|
| DQ-1 | Accounts with `first_touch_channel` unknown (Unattributed share) | Warn above 20%, bad above 40% |
| DQ-2 | Durations that would be negative (later step before earlier step) | Bad if any |
| DQ-3 | Steps **imputed** because a later step exists without an earlier one | Warn if any |
| DQ-4 | Listings created before the owner's account | Warn if any; shows `assisted` split |
| DQ-5 | People with missing or unrecognised district | Warn above 10% |
| DQ-6 | Duplicate people (same normalised phone) | Warn if any |
| DQ-7 | Stage disagrees with events (e.g. Applied but has a live listing) | Bad if any |
| DQ-8 | Internal/test accounts detected but not flagged (heuristics: staff email domain, "test" names) | Warn |
| DQ-9 | Data freshness: minutes since the last event or sync | Warn above 60 min |
| DQ-10 | Reconciliation failures (section 9.4) | Bad if any |
| DQ-11 | Opens without a visitor id | Info |
| DQ-12 | Targets missing for a role | Warn |

The **Data Confidence badge** on the Command Center is derived from these: High (no bad, at most one warn), Medium (no bad, several warns), Low (any bad). It is always clickable and opens the panel.

---

## 6. Metric dictionary (definitions are law)

> Every metric below MUST be implemented **once**, in a single module (`analytics/metrics` or the project's equivalent), and imported everywhere. No widget may compute its own version. Each metric has an **id** (e.g. `M-SELLER-ACTIVATED`), a plain-English **definition**, a **formula**, and an **edge-case rule**. The UI shows the definition in an info tooltip and in the Definitions drawer.

### 6.1 Funnel steps per role

**Seller**

| # | Step | Event / field |
|---|---|---|
| S0 | Link open (visitor) | `link_opened` (may be n/a for some channels) |
| S1 | Signup started | `signup_started_at` |
| S2 | **Account created** (entry event for cohort mode) | `created_at` |
| S3 | Application submitted | `application_submitted_at` |
| S4 | Contacted | `contacted_at` |
| S5 | KYC verified | `kyc_verified_at` |
| S6 | **Activated**: first listing live and verified (D1) | `activated_at` |
| S7 | **Productive**: first paid sale | `productive_at` |

**Buyer**

| # | Step | Event / field |
|---|---|---|
| B0 | Link open | `link_opened` |
| B1 | Signup started | `signup_started_at` |
| B2 | **Account created** | `created_at` |
| B3 | Profile complete (business type, district, typical weekly volume) | `application_submitted_at` or profile flag |
| B4 | Verified (business confirmed by scout or document) | `kyc_verified_at` |
| B5 | **Activated**: first inquiry or order request on a listing (D2) | `activated_at` |
| B6 | **Productive**: first paid order | `productive_at` |
| B7 | **Repeat**: second paid order within 30 days of the first | derived |

**Scout**

| # | Step | Event / field |
|---|---|---|
| C0 | Referral/link open | `link_opened` |
| C1 | Applied | `application_submitted_at` |
| C2 | Interviewed / called | `contacted_at` |
| C3 | **Approved** (agreement and KYC) | `kyc_verified_at` / approval event |
| C4 | **Activated**: first verified lot or lead submitted (D3) | `activated_at` |
| C5 | **Productive**: first commission paid, or target met in at least 2 of the first 4 active weeks | `productive_at` |
| C6 | **Retained**: active in at least 4 of the last 6 weeks | derived |

### 6.2 The two counting modes (this removes the contradictions)

> **In plain words:** there are two honest ways to count, and the old page mixed them. **Cohort mode** asks "of the people who joined in this period, how many got to each step?". **Activity mode** asks "how many things happened in this period, no matter when people joined?". Every widget MUST say which mode it uses.

| Mode | Population | Used for | Label shown in UI |
|---|---|---|---|
| **Cohort** | People whose **entry event (S2/B2/C1)** is inside the selected range. A person counts at a later step only if they reached it within the **conversion window** (default 14 days, D14) after entry. | Funnels, step conversion rates, time-to-step, channel quality, cohort triangle. | "Of people who joined in this period" |
| **Activity** | Events whose timestamp is inside the range; each person counted at most once per event type per range. | Target progress, weekly activations, trends of outputs, scout weekly output. | "Happened in this period" |

**Widget to mode mapping**

| Widget | Mode |
|---|---|
| Target cards (sellers, buyers, scouts activated this week) | Activity (always the current calendar week; D5) |
| Funnel bars and step conversion | Cohort |
| Channel table (opens, accounts, activation rate, median days) | Cohort (attributed people only) |
| Trend lines (activations per week) | Activity |
| Cohort triangle | Cohort |
| Scout weekly output (lots, sellers, birds) | Activity |
| Stuck and dead lists | Current state (as of now) |

**Funnel monotonicity rule (structural fix for rates above 100%):** within cohort mode a person is counted at step *k* only if they are also counted at every earlier step. If a later timestamp exists without an earlier one, the earlier step is **imputed** at the same time as the later one and the record gets the `imputed_step` data-quality flag (DQ-3). Therefore **step k count is never greater than step k-1 count**, by construction.

### 6.3 Core formulas

| ID | Metric | Formula | Edge-case rule |
|---|---|---|---|
| M-REACH | People who reached step *k* (cohort mode) | `count(distinct person)` where entry in range and step *k* reached within window | Monotonic by imputation. |
| M-STEP-RATE | Step conversion (% of previous step) | `reach(k) / reach(k-1)` | Denominator 0 gives "n/a". Result above 100% is **impossible**; if code produces it, return `null` and log DQ-10. |
| M-TOP-RATE | Conversion from top (% of entry) | `reach(k) / reach(entry)` | Same. |
| M-MEDIAN-TTS | Median time from step *a* to step *b* | `median(t_b - t_a)` over people who reached both, **only** where `t_b >= t_a` | Show **n** and the 25th to 75th percentile range. Fewer than 5 people: show the individual values instead of a median. Excluded rows are counted under DQ-2. |
| M-PERIOD-CHANGE | Change vs previous period | Compare with the immediately preceding window of equal length. Show absolute change always; show % change **only if the previous value is at least 5**. | 0 to 2 is "+2", not "+infinity %". |
| M-PACE | Pace vs target | `expected = target × elapsed_fraction_of_week`; slack = `max(0.15 × target, 1)`. **Ahead** if actual ≥ expected + slack; **Behind** if actual < expected − slack; else **On track**. | Elapsed fraction uses Kigali time. Counts are lumpy, so one unit of slack is allowed. |
| M-STUCK | Stuck count | Current stage with `now − stage_entered_at` above the stage threshold (D6) and not activated, not dead | Always clickable to the list. |
| M-DEAD | Dead / dormant | No activity for 14 days **and** not activated, or marked Unreachable / Not a fit | **Only evaluated for people at least 14 days old**; younger cohorts show "too early". |
| M-DEAD-RATE | Dead rate of a cohort | `dead / people old enough to be judged` | If nobody is old enough, "too early", never 0%. |
| M-ATTR-HEALTH | Attribution health | `attributed_by_tracked_link / all accounts`; also `self_reported_only`, `unknown` | Shown on the Channels tab and in the confidence badge. |
| M-CPA | Cost per account | `spend / accounts` for that channel | Needs spend entered; else "add spend". |
| M-CPAS | Cost per activated seller / buyer / scout | `spend / activated` | Zero activations: "no activations yet · RWF X spent" (never a division). |
| M-QUALITY | Channel quality score | Computed **only when the channel has at least 30 attributed accounts**. Otherwise "not enough data yet". Components: activation rate (Wilson lower bound), median days to activate, dead rate. | Formula is shown in a tooltip; weights are configurable. |

### 6.4 Statistical honesty rules

1. **Always show n.** A rate is printed as `x of n (p%)`.
2. **Small-sample badge** when n < 10: neutral grey "small sample", and the rate's interval is available on hover.
3. **Use the Wilson score interval** (Appendix B) for rates, never the plain normal approximation.
4. **Medians, not averages**, for times. Show the 25th to 75th percentile when n ≥ 5.
5. **Percent change is suppressed** when the baseline is under 5 (M-PERIOD-CHANGE).
6. **Never compare cohorts of very different size without flagging it.** Aggregate cohort rates are weighted by cohort size.
7. **Do not colour a small difference red or green.** Use neutral styling until the sample is large enough that the difference is meaningful. (Defaults: n ≥ 30 for rates; section 6.7.)
8. **Weekly counts are lumpy.** Use the process-behaviour (XmR) view only after at least 8 weekly points, and label the result "real change" or "normal variation" (section 7.6).

### 6.5 Stuck thresholds (editable table; D6)

| Role | Stage | Stuck after (days without progress) | Next action shown |
|---|---|---|---|
| Seller | Applied | 2 | Call or WhatsApp to start KYC |
| Seller | Contacted | 5 | Follow up; help complete KYC |
| Seller | KYC | 5 | Help create the first listing |
| Buyer | Applied / Profile | 3 | Call to complete profile |
| Buyer | Verified | 7 | Show matching listings; ask what they need |
| Scout | Applied | 3 | Interview |
| Scout | Approved | 7 | Assign first targets; check in |

Thresholds live in a config table so the owner can tune them without code.

### 6.6 Supply and demand (marketplace liquidity)

> **Why:** a marketplace only works when both sides grow together. Supply that nobody wants, or demand with nothing to buy, both cause people to leave. These metrics tell the team which side to recruit next, and where.

| ID | Metric | Definition |
|---|---|---|
| M-SUPPLY-LIVE | Live supply (birds) | Sum of birds in listings with status live and verified, whose availability window includes the date. |
| M-SUPPLY-FCST | Supply forecast, next 14 days | From flocks: placed birds minus mortality, for flocks projected to reach market age within the window (D15). Label it "forecast". Needs flock data; if absent, hide and say why. |
| M-DEMAND | Demand (birds wanted) | Sum of birds in open buyer requests; where requests do not exist, fall back to the **recent order run-rate** and label it "proxy". |
| M-COVERAGE | Coverage ratio | `supply / demand` per district per week. Starting guess for "healthy": 0.8 to 1.5, configurable, to be tuned after 8 weeks of data. |
| M-LISTING-RESPONSE | Listing response rate | Share of live listings with at least one buyer inquiry within 72 hours. |
| M-TTFI | Time to first inquiry | Median hours from listing live to first inquiry. |
| M-MATCH | Match rate | Share of buyer requests that have at least one matching listing (same or nearby district, overlapping dates). |
| M-FILL | Fill rate | Birds sold / birds listed, for listings whose window has ended. |
| M-ACTIVE-SELL | Active sellers | Sellers with a live listing in the last 14 days. |
| M-ACTIVE-BUY | Active buyers | Buyers with an inquiry or order in the last 30 days. |

If any input table does not exist yet, Cursor MUST say so in the audit and propose the **smallest capture** (for example a "buyer request" form with district, birds wanted, needed-by date).

### 6.7 Minimum-sample thresholds (so charts don't lie)

| Visualisation | Show only when | Otherwise show |
|---|---|---|
| Rate with colour semantics | n ≥ 30 | Neutral grey rate with "small sample" |
| Channel quality score | ≥ 30 attributed accounts per channel | "Not enough data yet" and the raw counts |
| Bubble chart of channels | ≥ 4 channels each with ≥ 10 accounts | Ranked bars with intervals |
| Cohort heatmap | ≥ 4 cohorts, each with ≥ 10 people | Cohort size table with counts |
| Day-by-hour heatmap | ≥ 100 signups in range | Hidden, with a note |
| XmR "signal vs noise" | ≥ 8 weekly points | Plain line |
| Percent change | previous value ≥ 5 | Absolute change only |

### 6.8 Scout metrics (normalised; D9)

> **Principle:** counts alone punish new scouts and reward gaming. Compare scouts on **active weeks and tenure**, and give new scouts a **ramp period** (first 14 days after approval) in which they are "Ramping", not "Behind".

| ID | Metric | Definition |
|---|---|---|
| M-SC-TENURE | Days since approved | `now − approved_at` |
| M-SC-ACTIVE-WEEKS | Active weeks | Weeks (Monday to Sunday, Kigali) with at least one verified lot or lead |
| M-SC-LOTS | Lots (verified) | Verified lots in the selected period |
| M-SC-SELLERS | Sellers brought | Seller accounts with `referred_by_scout_id` or a scout-verified first lot |
| M-SC-BUYERS | Buyers brought | Same for buyers |
| M-SC-BIRDS | Birds verified | Sum of birds in verified lots |
| M-SC-PASS | Verification pass rate | Verified lots / lots submitted (shown with n) |
| M-SC-ATTAIN | Target attainment | Per target dimension (lots, sellers, birds): actual / target for the week, **only for weeks after the ramp period** |
| M-SC-LAST | Last activity | Date of the latest scout event |
| M-SC-UNPAID | Unpaid commission (RWF) | Verified outcomes not yet paid |
| M-SC-PAYLAG | Payout lag | Median days from `payout_due` to `payout_paid` |

**Scout status labels** (supportive wording): **Ramping** (14 days or fewer since approval), **On track** (attainment of 80% or more of the last two active weeks), **Needs support** (below 40% or no verified lot in 10 days after ramp), **Dormant** (no activity for 14 days), **Excellent** (at or above 120% for two weeks). Thresholds are configurable.

**Anti-gaming safeguards (SHOULD):** flag duplicate lots (same seller, same flock, same week), spikes in failed verifications, lots submitted but never reachable; payouts based on **verified** outcomes only; random audit sample of verified lots.

### 6.9 Invariants (must always hold; automated checks)

These are executable assertions used in unit tests **and** in the runtime reconciliation check (section 9.4).

| ID | Invariant |
|---|---|
| I-1 | For every funnel, `reach(k) ≤ reach(k−1)`. |
| I-2 | No displayed funnel rate is above 100% or below 0%. |
| I-3 | No displayed duration is negative. |
| I-4 | The sum of channel rows equals the total (people, accounts, activated), including the **Unattributed** row. |
| I-5 | Funnel top (cohort entry) equals the "accounts/applications" KPI for the same range and filters. |
| I-6 | Activity-mode "activated this week" equals the number of people listed when the card is clicked. |
| I-7 | Pipeline stage totals equal the people total for the role, with **no person in two stages**. |
| I-8 | A person with `activated_at` is never in an "early" stage (Applied, Contacted) in the current-stage view. |
| I-9 | Sum of district rows equals the national total, including "District unknown". |
| I-10 | Scout table totals equal the Scout KPI cards. |
| I-11 | Every metric response includes `n` and a definition id. |
| I-12 | Target progress uses the target version effective for that week. |
| I-13 | Previous-period range has the same length as the current range. |
| I-14 | Every count in the UI can be clicked through to a list whose length equals that count. |
| I-15 | Data freshness timestamp is present and no older than the configured limit, or the page says so. |
| I-16 | Internal/test/synthetic people are excluded from every count. |

---

## 7. Product spec: every tab and screen

### 7.0 Global shell

**Route and rollout.** Keep the current page untouched. Build the new experience at a new route (for example `/insights/recruitment-v2`) behind a feature flag. Swap it in only after the Phase 8 sign-off.

**Tabs (in order of daily use):** Command Center · People · Funnels · Channels · Scouts · Supply & Demand · Trends · Briefing. On mobile the tab bar scrolls horizontally with the active tab always visible.

**Sticky filter bar (one bar, shared by all tabs):**

- Date range: Today, 7d, 14d, 30d, Custom. *The range does not affect the target cards (D5); the bar says so in a tooltip.*
- Role: All / Sellers / Buyers / Scouts.
- Channel (multi-select, includes "Unattributed").
- District (multi-select, 30 districts + "District unknown").
- Refresh button and "Updated 3 min ago".
- A **Definitions** link and a **Data confidence** badge.

**URL holds the state.** Filters live in the query string, so any view can be bookmarked or pasted into WhatsApp and opens exactly the same.

**Layout rules (fix F11):** the filter bar sits in normal document flow at the top of the content area, sticky with a defined z-index below modals; page padding is consistent on every section; nothing is positioned with negative margins; focus rings appear only on keyboard focus and only on interactive elements (this removes the stray blue outline); the API status indicator becomes a small icon in the header with a tooltip, and any toast sits bottom-right with safe margins and a dismiss button.

---

### 7.1 Command Center (the 30-second view)

**Purpose:** answer decisions 1, 2, 7 and 8 at a glance. If a manager cannot name the single most important message within 30 seconds, the screen is wrong.

**Content, top to bottom:**

1. **Headline sentence** (generated by templates, Appendix E, never by a language model): one or two sentences with the three outcomes and the biggest problem. Largest text on the page after the KPI numbers.
2. **Target cards (Sellers, Buyers, Scouts).** Each card: big number, "of target", a progress bar with a **pace tick**, a status chip (**Ahead / On track / Behind**, text plus icon), delta vs last week (absolute, % only when allowed), a six-week sparkline, and a one-line context ("17 new sellers · 5 activated"). If a target is missing: "Set a target" link. Always the **current calendar week**, with the dates shown ("Mon 19 to Sun 25 Oct").
3. **Needs attention.** **Top two** alerts only (a dashboard that shouts about everything gets ignored); "View all N alerts" opens a drawer. Each alert states the number, the rule, and a button to the underlying list. Alert examples: *11 sellers waiting more than 2 days at Applied*, *4 approved scouts have not submitted a first lot*, *40 link opens were filed as Direct; likely WhatsApp shares (add tracked links)*.
4. **Where people are right now (stage track).** Every person currently in recruitment shown as a dot in a lane per stage; dot colour = waiting time bucket (with icon for over-threshold). Hover: role, district, days in stage, next action (masked identity). Click opens the person drawer. If more than 200 people, switch to stacked bars by waiting bucket.
5. **Supply vs demand (this week).** Two bars (birds live, birds wanted), the gap in one sentence, and the district with the largest gap. If demand data is missing, show a clear "demand is not tracked yet" card with what to capture.
6. **Channels this week.** Top three by activations plus the one needing attention, with n.
7. **Footer strip:** Data Quality summary (counts) and Definitions link.

**Small-numbers mode.** When the week's new people are fewer than 30, the Command Center prefers counts and names to rates: target cards stay, but rate chips are neutral and carry "small sample"; the stage track and work queue move up; percent deltas are hidden.

**Wireframe, desktop (illustrative numbers only):**

```
┌───────────────────────────────────────────────────────────────────────────────────────────┐
│ Recruitment · Command Center    [Today][7d][14d][30d][Custom] Role▾ Channel▾ District▾  ↻     │
│ Updated 3 min ago · Data confidence: ◐ Medium · 6 sellers unattributed ⓘ · Definitions        │
├───────────────────────────────────────────────────────────────────────────────────────────┤
│  This week we activated 5 of 10 target sellers (on pace), 0 of 2 scouts (behind) and no       │
│  buyers yet. 16 sellers are waiting at Applied and 11 have waited over 2 days.                │
├─────────────────────────┬─────────────────────────┬───────────────────────────────────────┤
│ SELLERS · Mon 19-Sun 25 │ BUYERS                  │ SCOUTS                                │
│   5  of 10              │   0  of —               │   0  of 2                             │
│  ▓▓▓▓▓░░░░░   ┆pace     │   Set a target →        │  ░░░░░░░░░░   ┆pace                    │
│  ▲ On track  +2 vs last │                         │  ▼ Behind   same as last week         │
│  ▁▂▃▂▅▆ 6 weeks         │   ▁▁▁▁▁▁                │  ▁▁▁▁▁▁                               │
│  17 new · small sample  │                         │  4 approved · 0 first lots            │
├─────────────────────────┴─────────────────────────┴───────────────────────────────────────┤
│ Needs attention                                                      [View all 5]             │
│ ⚠ 11 sellers waiting over 2 days at Applied                         [Open call list →]        │
│ ⚠ 4 approved scouts have not submitted a first lot                  [See scouts →]            │
├───────────────────────────────────────────────┬───────────────────────────────────────────┤
│ Where people are right now                      │ Supply vs demand (this week)              │
│ Applied      ●●●●●●●●●●●●●●●●  16               │ Birds live    ████████░░  2,400           │
│ Contacted                       0               │ Birds wanted  ██████████  3,800           │
│ KYC                             0               │ 1,400 more birds wanted than listed;      │
│ Listing live ●●●●●              5               │ largest gap: Kigali                       │
├───────────────────────────────────────────────┴───────────────────────────────────────────┤
│ Channels this week · by activations                                                            │
│ WhatsApp group share   3 sellers · 11 accounts      Direct/unknown  1 seller · 3 accounts      │
│ Data quality: 2 warnings ▸                                            Definitions ▸            │
└───────────────────────────────────────────────────────────────────────────────────────────┘
```

**Mobile order (390 px):** headline → target cards (horizontal snap carousel, all three visible as peeks) → needs attention (two alerts) → work queue shortcut → stage track (collapsed to counts with "expand") → supply vs demand → channels → data quality. No horizontal page scroll.

---

### 7.2 Funnels

**Purpose:** decision 4 (where do people get stuck?). **Mode:** cohort (D14 window).

**Controls:** role (Seller / Buyer / Scout), conversion window (7 / 14 / 30 days), "Compare by channel" toggle.

**Main visual (per role):** horizontal bars, one per step, length = people count (length is the most accurate quantity encoding for humans). Each row prints: `step name · x of n · % of previous · % of top · median time from previous (25th-75th) · n`. Example row text: *KYC verified · 9 of 14 · 64% of previous · 36% of top · median 2.1 days (1.0 to 3.4), n = 9*.

**Biggest-leak marker.** The step with the largest relative drop (among steps with at least 10 people entering) gets a marker and a sentence: "Biggest leak: Applied to Contacted (only 5 of 17 reached). Median wait is 4.2 days." If no step qualifies: "Too few people to call a leak yet; here is who is waiting" and the work queue link.

**Click behaviour.** Click any bar to open a drawer with two tabs: *Reached* and *Did not reach (still waiting)*, each a list of people with days waiting.

**Stage aging chart.** For people currently in each stage: stacked horizontal bar by waiting bucket (0 to 1, 2 to 3, 4 to 7, 8+ days), single-hue sequential palette, over-threshold segments hatched and iconed. This shows backlog *shape*, not just size.

**Channel comparison.** Small multiples (max six, sorted by accounts); channels with fewer than 10 accounts are grouped as "Other (small)". Channels without link opens start at Account created.

**Minimum thresholds.** Section 6.7 applies; below them, show counts and the waiting list, not rates.

---

### 7.3 Channels

**Purpose:** decision 3. **Mode:** cohort, attributed people only.

1. **Attribution health meter** on top: stacked bar of *tracked link / self-reported only / unattributed*, with the sentence "Only 35% of accounts can be traced to a tracked link. Add tracked links to WhatsApp posts to see the real picture." (numbers computed).
2. **Channel table** (sortable, inline bars, sparklines): Channel · Opens (or **n/a**) · Accounts · Open to account % (only if opens exist) · Activated sellers (x of N) · Activated buyers (x of N) · Scouts · Dead rate (or "too early") · Median days to activate (n) · First paid · Spend (RWF) · Cost per activation. **Unattributed** row pinned at the bottom and cannot be hidden. Totals row must reconcile (I-4). Each row expands into campaigns and creatives.
3. **Chart view:** ranked bars of "activated per 100 accounts" with Wilson intervals; switches to a bubble chart (x = spend or opens, y = activation rate, size = accounts) only when thresholds in 6.7 are met.
4. **Trend:** accounts per day by channel (stacked area), max six channels plus "Other".
5. **Spend panel:** weekly spend entry form, and cost per account / per activation. If no spend is entered: "Add this week's spend to see cost per activation."
6. **Link builder:** create a tracked link (channel, campaign, creative, role), copy button, QR code, and live stats per link. This is the main fix for dark social (F2).
7. **Rule-based chips:** e.g. "Instagram: 2 opens in 14 days, 0 accounts; consider pausing" (only when thresholds are met; shows the rule).

---

### 7.4 Scouts

**Purpose:** decision 5. **Mode:** activity for weekly output, cohort for scout cohorts. **Tone:** supportive.

- **KPI strip:** Approved · Activated · Active this week · Needs support · Unpaid (RWF).
- **Spotlight cards:** *Needs support* (name, reason, last activity, one-tap WhatsApp), *Rising*, *Top this week*.
- **Table:** Scout · District · Status chip · Days since approved · Active weeks · Lots (verified/submitted) · Sellers brought · Buyers brought · Birds verified · **Target attainment** (thin bars with target tick, per dimension) · Last activity · Unpaid RWF · six-week sparkline. Rows show "Ramping" for the first 14 days.
- **Scout drawer:** timeline of activity, lots with verification outcomes, sellers and buyers brought, earnings and payouts, notes, WhatsApp button.
- **Coverage:** ranked bar by district (scouts, sellers, buyers, supply, demand) with an optional choropleth of the 30 districts (open-licence boundaries, bundled, no tile service); a **"White space"** list: districts with demand or sellers but no active scout.
- **Cohorts:** scouts by approval week versus "activated within 2 / 4 weeks".
- **Payouts:** unpaid by scout, due dates, and a link to the payment workflow; any "mark paid" action requires confirmation and writes an audit event.
- **Normalisation notes** in tooltips (tenure, ramp, active weeks).

---

### 7.5 People (work queue, board, table)

**Purpose:** decision 2. This replaces the tiny "People in recruitment" box with the page people use every day.

**Three views (default: Work queue):**

1. **Work queue.** A prioritised "who to contact today" list in three groups: *Call now (stuck)*, *Follow-ups due today*, *New today*. Priority is transparent: `score = role_weight × days_beyond_threshold`, and each row states why ("Seller · Applied 4 days (limit 2)"). Each row has: WhatsApp (opens `wa.me` with a prefilled message), Call (`tel:`), **Log outcome** (reached / no answer / wrong number / call back at... / not interested), Schedule follow-up, Move stage (reason required for Unreachable and Not a fit), Add note, Assign owner.
2. **Board (kanban).** Columns = stages for the selected role, counts and aging badges. Drag to move; terminal states ask for a reason; every move writes `stage_changed_manually` with actor and time.
3. **Table.** Sortable, column chooser, saved filters, CSV export (masked phones by default).

**Cards** show: masked name or initials, role, district, channel, days in stage with aging icon, next action, last note. Phone numbers are masked until "Reveal" is clicked (logged, D10).

**Everything has history:** a drawer shows who did what and when.

---

### 7.6 Trends and cohorts

**Purpose:** decision 8 groundwork and learning over time. **Mode:** activity for trends, cohort for the triangle.

1. **Inputs vs outputs (weekly business review style).** Two rows of small multiples. *What we do* (inputs we control): ad spend, tracked link opens, calls made, scouts approved, listings verified. *What we get* (outputs): accounts, activated sellers / buyers / scouts, first paid orders. Each chart shows the **last six weeks** prominently and a **twelve-month** trend beside it once six months of data exist. Same metrics, same order, every week.
2. **Signal vs noise (XmR).** For weekly activated sellers (and one other chosen metric), once at least 8 weekly points exist: centre line = mean; natural limits = mean ± 2.66 × the average moving range (lower limit floored at 0). A point outside the limits, or eight in a row on one side of the centre, is labelled **"real change"**; otherwise **"normal variation"**. This stops the team reacting to noise.
3. **Cohort triangle.** Rows = signup week; first column = cohort size; columns = weeks since signup (0, 1, 2, ... 8); cell = share activated by that age. **A dash means that age has not been reached; it never means zero.** Incomplete cells are hatched. Single-hue sequential colour with a legend. A weighted average row sits under the table. Toggle: activated / productive / still active. Show only when thresholds in 6.7 hold.
4. **Time to activate distribution:** histogram in days with median and 75th percentile markers.
5. **Signups by day and hour** heatmap (helps time ads and WhatsApp pushes), only when at least 100 signups are in range.

---

### 7.7 Supply and demand

**Purpose:** decision 6. The marketplace works only when both sides grow together.

- **Balance by district:** paired horizontal bars (birds live vs birds wanted) sorted by gap size, a coverage-ratio chip with a text label (*Short on supply / Balanced / Oversupplied*), and "District unknown" as its own row.
- **Next 14 days:** weekly supply forecast from flocks vs demand (if flock data exist); labelled "forecast".
- **Listing health:** response rate, median time to first inquiry, a list of live listings with no inquiry after 72 hours.
- **What to recruit next:** two plain sentences generated from rules, e.g. "Recruit sellers in Kigali: demand is 1.6× supply" and "Recruit buyers in Nyagatare: supply is 2.3× demand."
- **Map toggle:** choropleth of coverage ratio.
- If demand data is not captured yet, the whole tab states exactly what is missing and the smallest form that would capture it.

---

### 7.8 Briefing (slides)

**Purpose:** decision 8, and the Monday ritual. Same metrics, same order, every week.

**Slide deck (16:9, keyboard: ← → to move, F fullscreen, Esc to exit):**

1. Headline summary
2. Targets vs actual (three cards)
3. What changed (top three movers vs last week)
4. Funnels (seller, buyer, scout)
5. Channels: where to put money
6. Scouts: who to celebrate and who needs support
7. People waiting (masked list by owner)
8. Supply vs demand
9. Decisions and owners for next week (rule-based suggestions plus editable free text)

**Behaviour**

- Slides reuse the dashboard's components at presentation scale, so there is one source of truth.
- **Snapshot freeze:** when the briefing is generated, store a frozen JSON snapshot. Reopening last week's briefing shows the numbers *as they were*; if data was later corrected, show a "restated" note rather than silently changing history.
- **Export PDF:** print stylesheet with `@page` sized 16:9 (simplest), or a server-side render if print fidelity is not good enough.
- **Copy WhatsApp summary:** one click copies a plain-text recap (no personal data, about 1,200 characters at most), plus a "Share" button that opens `wa.me/?text=`. Template:

```
📊 Recruitment · week of 19 Oct
Sellers activated: 5 of 10 (▲ +2)
Scouts activated: 0 of 2
Buyers activated: 0 (no target set)
Waiting over 2 days: 11 sellers
Best channel: <channel> · Needs attention: <channel>
Next week:
1) <action>
2) <action>
3) <action>
```

- **Recommended actions** are rule-based and transparent (Appendix D): each shows the rule, the evidence numbers, a suggested owner, and "Dismiss with reason" (logged).
- A list of past briefings (by week) with the ability to compare two.

---

### 7.9 Cross-cutting UX

- **Definitions drawer:** searchable list of every metric with plain-English definition, formula, mode (Cohort / Activity), and a worked example using today's numbers.
- **Data Quality panel** (collapsed by default, badge always visible): each DQ check with its count; each row opens the offending records.
- **Person drawer:** same everywhere (stage history, events, notes, masked contact, actions).
- **Info tooltips** on every metric title (definition + mode + n).
- **Loading:** skeletons shaped like the final content, shown within 100 ms. **Empty:** friendly and specific ("No scouts approved this week. Approve applications to see activity here."). **Error:** one sentence, a Retry button, and the request id for support. **Partial failure:** one widget failing must not blank the page.
- **Copy link to this view** and **Export** (lists as CSV, masked by default).
- **Microcopy rules:** short, plain English, no jargon, active voice, always state the unit (people, birds, RWF) and the period.

---

## 8. Design system and chart rules

> **Design is a requirement, not decoration.** If the page is not attractive, people will not open it, and then the data is worthless. The target is a calm, premium, trustworthy product feel that matches the existing brand (green/teal sidebar, rounded cards), refined into one consistent system.

### 8.1 First, look at what already exists

Before adding anything, Cursor MUST inspect the project's current theme (CSS variables, Tailwind config, component library) and **extend it** rather than create a competing one. The tokens below are a *starting proposal*; keep the project's existing brand hues if they differ, and verify every text/background pair reaches at least 4.5:1 contrast (3:1 for large text and UI borders) with a contrast checker.

### 8.2 Tokens (CSS variables; adapt names to the project)

```css
:root {
  /* Brand (keep existing hues if different) */
  --brand-700: #0F5E4D;
  --brand-600: #157A64;
  --brand-500: #1E9478;
  --brand-100: #DDF3EC;
  --brand-50:  #F0FAF6;

  /* Neutrals */
  --ink-900: #0F1B17;   /* primary text */
  --ink-700: #2B3A35;
  --ink-500: #5A6B65;   /* secondary text */
  --ink-300: #A9B6B1;
  --line:    #E3EAE7;   /* borders, gridlines */
  --surface: #FFFFFF;   /* cards */
  --canvas:  #F6F9F8;   /* page background */

  /* Semantic: ALWAYS pair with an icon and a text label, never colour alone */
  --good: #0B7A4B;  --good-bg: #E4F5EC;
  --warn: #A15C00;  --warn-bg: #FFF1D6;
  --bad:  #B3261E;  --bad-bg:  #FDE7E5;
  --info: #1D5FA8;  --info-bg: #E5F0FB;
  --neutral: #5A6B65; --neutral-bg: #EEF2F0;   /* small-sample, n/a, too early */

  /* Categorical palette: Okabe-Ito, colour-blind safe (max 6 series + Other) */
  --c1: #0072B2;  --c2: #E69F00;  --c3: #009E73;
  --c4: #CC79A7;  --c5: #56B4E9;  --c6: #D55E00;
  --c-other: #8A9690;

  /* Sequential (single hue, for heatmaps and aging) */
  --seq-1: #EAF6F1; --seq-2: #BFE3D5; --seq-3: #86CBB3;
  --seq-4: #4FAF93; --seq-5: #1E8C72; --seq-6: #0F5E4D;

  /* Shape and depth */
  --radius-card: 14px;  --radius-chip: 999px;  --radius-input: 10px;
  --shadow-card: 0 1px 2px rgba(15,27,23,.06), 0 4px 16px rgba(15,27,23,.04);

  /* Spacing: 4px scale */
  --s-1: 4px; --s-2: 8px; --s-3: 12px; --s-4: 16px;
  --s-5: 20px; --s-6: 24px; --s-8: 32px; --s-10: 40px;

  /* Motion */
  --ease: cubic-bezier(.2,.8,.2,1);
  --t-fast: 150ms; --t-base: 250ms; --t-slow: 400ms;
}
@media (prefers-reduced-motion: reduce) {
  * { animation: none !important; transition: none !important; }
}
```

**Why Okabe-Ito:** it is a published palette designed to stay distinguishable for people with the common forms of colour-blindness. **Why single-hue sequential for heatmaps:** magnitude should read as "more or less of one thing", not a rainbow of categories.

### 8.3 Typography

- Use the project's existing font. If adding one, choose a family with **tabular figures** (for example Inter) and set `font-variant-numeric: tabular-nums` on every number so columns align.
- Scale: KPI numbers 40/44 semibold; page title 24/32; section title 18/26; body 14/22; caption 12/16 (nothing below 12 px).
- Numbers: thousands separators (`1,019`), currency as `RWF 12,500` (no decimals), percentages with at most one decimal, dates as `19 Oct`, ranges as `19-25 Oct`, always Kigali time.

### 8.4 Layout

- 12-column grid; content max width 1440 px; page padding 24 px (16 px on mobile). Breakpoints: 360, 768, 1024, 1440.
- Cards: `--surface`, `--radius-card`, `--shadow-card`, 20 px inner padding, 16 to 24 px gaps.
- **Hierarchy (Few):** the most important element is the largest and most prominent; related items are grouped; whitespace separates groups, not borders everywhere.
- Tables collapse into stacked cards below 768 px. Wide tables scroll inside their own container, never the page.

### 8.5 Chart rules (checklist for every chart)

1. **Encode quantity with length or position.** Bars (start at zero) for comparisons and rankings, lines for time. 
2. **No pie, donut, gauge/speedometer, 3-D, or dual-axis charts.** Exception: a small progress ring or bar for a single target.
3. **Treemaps and radar charts are not used.**
4. **At most 6 series plus "Other".** Direct labels beat legends where possible.
5. **Grid:** thin, light (`--line`), horizontal only; no chart borders.
6. **Targets and pace** appear as a labelled dashed line or tick, not as extra colours.
7. **Sample size** is printed or available in the tooltip on every rate.
8. **Tooltips** show exact values, the period, the comparison to the previous period, and n.
9. **Colour never carries meaning alone.** Pair with icons (▲ ▼ ✓ ⚠ ✕), text, or hatching. Avoid red and green as the only difference.
10. **Incomplete or imputed data is hatched**, never drawn as zero.
11. **"View as table"** toggle on every chart for accessibility and for people who prefer numbers.
12. **Axis labels include units** (people, birds, RWF, days).
13. **Animations** under 400 ms, run once on load, respect reduced motion.
14. **Every chart has loading, empty and error states.**

### 8.6 Status and delta language

| State | Style | Icon | Text |
|---|---|---|---|
| Ahead / good | `--good` on `--good-bg` | ▲ or ✓ | "Ahead", "On track" |
| Warning | `--warn` on `--warn-bg` | ⚠ | "Behind", "Waiting" |
| Problem | `--bad` on `--bad-bg` | ✕ or ⚠ | "Stuck", "Needs support" |
| Small sample / n/a / too early | `--neutral` on `--neutral-bg` | ○ | "Small sample", "n/a", "Too early" |
| Data issue | `--info` on `--info-bg` | ⓘ | "Check data" |

Deltas: `▲ +2 vs last week`, `▼ −3 vs last week`, `▬ same`. Percent appears only when the baseline is at least 5.

### 8.7 Component inventory (small, reusable, one concern each)

| Component | Key props | States to implement |
|---|---|---|
| `AppShell` / `FilterBar` | `range`, `role`, `channels`, `districts`, `onChange` | sticky, mobile collapse into a sheet |
| `HeadlineSentence` | `segments[]` (text and highlighted numbers) | loading, empty |
| `TargetCard` | `label`, `actual`, `target`, `pace`, `delta`, `spark`, `context`, `definitionId` | loading, no-target, small-sample |
| `AlertList` / `AlertDrawer` | `alerts[]` with `severity`, `rule`, `count`, `href` | empty ("All clear") |
| `StageTrack` | `people[]` with `stage`, `ageBucket`, `maskedLabel` | dots vs stacked bars, empty |
| `FunnelBars` | `steps[]` with `reach`, `ofPrev`, `ofTop`, `median`, `iqr`, `n` | small-sample, no-data |
| `StageAgingChart` | `stages[]` with bucket counts | loading, empty |
| `ChannelTable` | `rows[]`, `columns`, `onExpand` | n/a cells, pinned Unattributed row |
| `AttributionMeter` | `tracked`, `selfReported`, `unknown` | n/a |
| `ScoutTable` / `ScoutDrawer` | `rows[]`, `targets` | ramping, dormant |
| `WorkQueue` / `PersonCard` / `Board` | `people[]`, `actions` | empty, bulk-select |
| `CohortTriangle` | `cohorts[]` with `size`, `cells[]` | hatched incomplete, dash for not reached |
| `XmRChart` | `points[]` | below 8 points: plain line |
| `BalanceBars` / `DistrictMap` | `districts[]` | missing-demand banner |
| `SlideDeck` / `Slide` | `snapshot`, `slideId` | fullscreen, print |
| `InfoTooltip` | `definitionId` | keyboard focusable |
| `DefinitionsDrawer`, `DataQualityPanel` | `checks[]` | collapsed by default |
| `EmptyState`, `ErrorState`, `Skeleton` | `title`, `body`, `action` | n/a |

### 8.8 Accessibility (WCAG 2.2 AA target)

Keyboard-reachable everything; visible focus ring on keyboard focus only; semantic table markup for tables; `aria-label` on charts with a text summary; touch targets at least 44 × 44 px on mobile; colour contrast checks; reduced-motion support; every chart has a table alternative; page works at 200% zoom.

### 8.9 Responsive behaviour

- ≥ 1024 px: full grid.
- 768 to 1023 px: two columns; tables keep key columns, others in a "More" expander.
- < 768 px: single column; tables become cards; filter bar collapses into a "Filters" sheet; target cards in a snap carousel; charts get simplified (fewer ticks, direct labels only).
- Test at 360, 390, 768, 1024, 1440 px.

### 8.10 Anti-patterns (do not build)

Rainbow palettes · pies and gauges · dual axes · truncated bar axes · percentages without n · red/green only · tooltips as the only place essential information lives · auto-refresh that makes numbers jump while reading · carousels that hide KPIs on desktop · tables with no sorting · metrics without definitions · "unknown" quietly dropped · decorative animation · a dozen alerts shouting at once.

---

## 9. Engineering architecture and quality

### 9.1 Detect first, then fit in

Phase 0 MUST record in `AUDIT.md`: framework and version, language (TypeScript or not), router, styling approach, component library, chart library, data-fetching layer, backend framework and language, database and ORM/migration tool, test framework, lint/format setup, auth and roles system, how the app is deployed, and the commands to build, typecheck, lint, and test. **Everything below adapts to that**; do not introduce a new framework or a second styling system.

### 9.2 Suggested folder layout (adapt names)

```
analytics/recruitment/
├─ metrics/           ← pure functions: the single source of truth (section 6)
│  ├─ definitions.ts  ← metric ids, labels, plain-English definitions, formulas
│  ├─ funnel.ts  stats.ts  pace.ts  stuck.ts  channels.ts  scouts.ts  liquidity.ts
│  └─ __tests__/
├─ queries/           ← SQL/ORM that produce person_facts, events, spend, targets
├─ snapshot/          ← builds ONE RecruitmentSnapshot per request (section 9.3)
├─ reconcile/         ← invariant checks (section 9.4)
├─ api/               ← endpoints/handlers
├─ components/        ← UI components (section 8.7)
├─ hooks/             ← useRecruitmentSnapshot, useFilters
├─ copy/              ← all user-facing strings and headline templates
└─ types/
```

### 9.3 One snapshot, many views (the architectural rule that prevents contradictions)

> **Old pattern (causes bugs):** every widget runs its own query with its own definition.
> **New pattern:** the server builds **one `RecruitmentSnapshot`** for the current filters. Widgets only *render slices of that snapshot*. Because everything comes from the same people table and the same metrics module, two widgets cannot disagree.

- `GET /api/analytics/recruitment/snapshot?from&to&role&channels&districts` returns the full tab payload (Appendix C shows the shape): `meta`, `kpis`, `funnels`, `channels`, `scouts`, `pipeline`, `supplyDemand`, `alerts`, `headline`, `quality`.
- Heavy tabs (Trends, Briefing) can have their own snapshot endpoints, built from the same functions.
- Lists behind counts come from `GET .../people?...` using the **same filter function** that produced the count (invariant I-14).
- Responses include `meta.generatedAt`, `meta.timezone = "Africa/Kigali"`, `meta.range`, `meta.prevRange`, `meta.definitionsVersion`.
- Aggregate in SQL or the server. **Do not ship raw people rows to the browser to aggregate there.**

### 9.4 Self-checking: the reconciliation layer

`reconcile(snapshot)` evaluates every invariant in section 6.9 and returns `{ ok, failures[] }`.

- In **tests**, failures fail the build.
- In **development**, failures throw loudly.
- In **production**, failures never crash the page: they set the confidence badge to Low, add DQ-10 rows to the Data Quality panel, log the failing invariant ids, and show the affected widget with a neutral "check data" state instead of a wrong number.

### 9.5 Testing strategy (TDD, as Cursor recommends)

For each metric group the agent MUST: (1) write tests from the definitions first; (2) run them and **confirm they fail**; (3) commit the tests; (4) implement until they pass, **without editing the tests**; (5) commit.

Required tests:

- **Unit:** `wilson`, `quantile/median`, `periodChange`, `pace`, `stuck`, `dead` (including "too early"), funnel reach with imputation, channel attribution rules.
- **Property-style:** random synthetic cohorts must always satisfy I-1 to I-5, I-7 to I-9 (use a property-testing library if the project's language has one).
- **Edge cases:** zero denominators, a single person, all people in one channel, no opens for a channel, negative durations in raw data, duplicated phone numbers, weeks crossing month boundaries, Monday 00:00 Kigali boundaries, UTC vs Kigali date differences.
- **Snapshot tests** on the JSON contract.
- **Component tests** for empty, loading, error, small-sample states.
- **Visual check** with the browser tool at 1440 and 390 px after each UI phase.

### 9.6 Performance budget

- Skeleton visible within 100 ms; Command Center data within 2 s (75th percentile) on a mid-range phone and ordinary mobile connection.
- Compute aggregates on the server; add short caching (for example 60 seconds) keyed by filters; add database indexes for `created_at`, `first_touch_channel`, `current_stage`, `district`, and event `(person_id, occurred_at)`.
- At today's volumes live computation is fine. **Design for 100× growth:** if queries exceed budget, add a nightly or hourly rollup table; keep the metrics module the same.
- Lazy-load heavy charts and the briefing deck; each tab's JavaScript under about 200 KB gzipped beyond the shared bundle (adjust to the project).
- Avoid layout shift: reserve space for charts; fonts with fallbacks.

### 9.7 Internationalisation and formatting

- All user-visible strings in `copy/` (no hard-coded text in components) so Kinyarwanda and French can be added later.
- Use `Intl.NumberFormat` and `Intl.DateTimeFormat` with the Kigali time zone for all numbers and dates.
- Currency: RWF with no decimals.

### 9.8 Observability

- Log slow queries and failed invariants (ids only, no personal data).
- Record, internally, which tab and briefing are opened and by which role, to measure adoption (S7). No third-party tracker.

### 9.9 Error handling

- Each widget catches its own failure and shows an error state with Retry.
- Distinguish **no data** (valid, shown as empty state) from **failed to load** (error state) from **data suspect** (reconciliation failure).

---

## 10. Privacy and security

> **This section is guidance, not legal advice.** The owner should confirm obligations with a Rwandan lawyer.

**What the research says (Rwanda Law No. 058/2021):** data controllers and processors must register with the national authority; personal-data breaches must be notified within 48 hours; personal data should be stored in Rwanda unless the authority authorises transfer or storage abroad. Consent, access, correction and erasure rights apply to the people in the system.

**Design consequences (MUST unless the owner decides otherwise):**

1. **Role-based access.** Only admin and recruiter roles see the People tab. Managers can see aggregates and masked lists.
2. **Mask by default.** Phone numbers shown as `+250 78•• ••• 12`; "Reveal" is an explicit click that writes an audit event (who, when, which person).
3. **No personal data** in: briefing PDFs, WhatsApp summaries, logs, error messages, test fixtures, seeds, screenshots in the repo, or analytics events.
4. **Exports** (CSV) are masked by default; unmasked export is admin-only and audited.
5. **No third-party analytics SDKs, session replays, or external chart/geo services** that would send personal or behavioural data outside Rwanda. Chart libraries that run in the browser are fine.
6. **Minimise.** Store only fields needed for recruitment management; keep a retention rule (owner to define) for people marked Not a fit or Unreachable.
7. **Audit log** for: reveal of contact data, manual stage changes, target changes, payout actions, exports.
8. **Server-side authorisation** on every analytics endpoint (never rely on hiding UI).
9. **Seed/synthetic data** is clearly flagged (`is_synthetic`), refuses to run against production, and contains no real names or numbers (Appendix G).

---

## 11. Build phases, acceptance checks, and per-phase prompts

> **How each phase works:** open a **new chat**, turn on **Plan Mode** (`Shift+Tab`), paste that phase's prompt, review the plan, approve, let Cursor build, run `/verify-analytics`, tick the acceptance list, then commit. Do not start the next phase until the current one passes.

**Overview**

| Phase | Name | Output you can see | Risk if skipped |
|---|---|---|---|
| 0 | Audit and plan | `AUDIT.md`: what exists, what's missing, causes of F1-F12, plan | Cursor guesses and builds on sand |
| 1 | Trust the numbers | Metrics module with tests; old vs new numbers side by side | Pretty charts of wrong numbers |
| 2 | Capture the missing truth, and the snapshot API | Tracked links, spend, targets, events, one snapshot endpoint, reconciliation | Attribution and stages stay broken |
| 3 | Design system and Command Center | The new 30-second page | Nobody opens it |
| 4 | Funnels and Channels | Real funnels per role; honest channel table | You still don't know where money works |
| 5 | People and Scouts | Work queue, board, scout coaching view | Insight without action |
| 6 | Supply and Demand, Trends and cohorts | Marketplace balance; weekly rhythm; cohorts | No view of the thing that makes the marketplace work |
| 7 | Briefing | Slides, PDF, WhatsApp summary, frozen weekly snapshots | No Monday ritual |
| 8 | Hardening and launch | Performance, accessibility, mobile, privacy, flag swap | Fragile launch |

---

### Phase 0: Audit and plan (read-only)

**Goal:** know exactly what exists before changing anything.

**Tasks**

1. Record the stack and commands (section 9.1).
2. Locate the current Recruitment page, its components, and **every query or endpoint** behind each widget.
3. Map the real tables and fields for: people/users, roles, link opens and tracking, signup source/UTM, applications, pipeline stage, KYC, listings/lots and their creator, orders and payments, flocks, buyer requests or inquiries, scouts, approvals, payouts, targets, districts.
4. For each of F1 to F12, state the **actual cause in the code** (or "not reproducible"), with file paths and line references.
5. Run the cross-checks in section 4.2 against real data and report.
6. Identify what is **missing** (for example buyer demand, event history, spend, visitor ids) and propose the smallest capture.
7. Write the phased plan adapted to the real stack.
8. List **at most five** questions, only where definitions in section 2 are ambiguous; propose the recommended default for each.

**Deliverable:** `docs/recruitment-analytics/AUDIT.md`. **No application code changes.**

**Acceptance**

- [ ] Stack, commands, and conventions recorded.
- [ ] A table of widgets to source queries to tables.
- [ ] Each F-item has a verified cause or "unverified, here is how to check".
- [ ] A missing-data list with the smallest proposed capture.
- [ ] The plan is mapped to phases 1 to 8 with file-level detail.
- [ ] No source files modified (`git status` shows only the new docs).

**Prompt:** use the **Master Prompt** in section 12.

---

### Phase 1: Trust the numbers

**Goal:** a single, tested source of truth for counts, so the old contradictions become impossible.

**Tasks**

1. Create the `analytics.person_facts` view or table (section 5.3) over existing data (option A in 5.2). Normalise phone numbers, flag internal/test accounts, normalise districts.
2. Create the **metrics module** (section 6) with `definitions` (ids, labels, plain-English text).
3. TDD per section 9.5: write the tests first, confirm they fail, commit; implement; commit.
4. Implement cohort mode and activity mode, the funnel with imputation, stuck/dead with "too early", pace, period change, Wilson, median/IQR.
5. Produce `docs/recruitment-analytics/PHASE1_NUMBERS.md`: **old numbers beside new numbers** for the same range, with an explanation for every difference.
6. Do not change any UI yet.

**Acceptance**

- [ ] Tests exist for every metric group, were committed failing, and now pass.
- [ ] Invariants I-1, I-2, I-3, I-4, I-5, I-7, I-8, I-9 hold on real data.
- [ ] No negative durations in outputs; they appear only as a count in DQ-2.
- [ ] Rates cannot exceed 100% (a deliberate violation test returns `null` and logs DQ-10).
- [ ] `PHASE1_NUMBERS.md` explains every difference between old and new.
- [ ] No personal data in fixtures or docs.

**Prompt**

````
Read @docs/recruitment-analytics/SPEC.md (sections 5, 6 and 9.5) and @docs/recruitment-analytics/AUDIT.md.

Do Phase 1 only: "Trust the numbers". I am a beginner, so explain each step in plain language.

Work test-first:
1. Write unit tests for the metrics in SPEC section 6 (funnel reach with imputation, cohort vs activity mode, stuck, dead with "too early", pace, period change, wilson, median/IQR, safe rates, week boundaries in Africa/Kigali). Do NOT write implementation yet. Run the tests and show me that they fail. Then stop so I can commit.
2. After I say "tests committed", create the person_facts view (SPEC 5.3) adapted to our real schema from AUDIT.md, then implement the metrics module until the tests pass. Do not edit the tests to make them pass.
3. Create docs/recruitment-analytics/PHASE1_NUMBERS.md comparing OLD vs NEW numbers for the last 7 days, and explain every difference.

Rules: reuse our stack; no UI changes; no real personal data in tests; never invent fields (if something is missing, tell me). Finish with the list of files changed.
````

---

### Phase 2: Capture the missing truth, and the snapshot API

**Goal:** fix attribution and stage truth at the source, and expose one self-checking snapshot.

**Tasks**

1. **Tracked links** table and admin "Create link" tool; visitor id cookie; stitch first touch into the account (section 5.5).
2. **Scout referral codes** (and QR) stored on accounts as `referred_by_scout_id`.
3. Optional **"How did you hear about us?"** field stored as `self_reported_source`.
4. **Ad spend** table and a simple weekly entry form; **targets** table (versioned) with the existing "Targets" button wired to it.
5. **Event ledger** (option B in 5.2) for stage changes, calls, and verifications; backfill from existing timestamps where possible; **auto-advance rules** (section 5.8).
6. District lookup table and normalisation.
7. Build the **`RecruitmentSnapshot` endpoint** (section 9.3) from the metrics module, plus the **people list endpoint** that shares the same filter function.
8. Build **`reconcile()`** (section 9.4) and the **Data Quality** data (section 5.10).
9. WhatsApp: determine and document whether the business uses the official WhatsApp Business API (needed for click-to-WhatsApp ad attribution). If not, document the limitation; do not build a workaround that scrapes anything.

**Acceptance**

- [ ] A tracked link opened in a browser creates a `link_opened` event and, after signup, the account's first touch matches the link (test it end to end).
- [ ] An account created from a scout code shows `scout_referral` and the scout id.
- [ ] Spend and targets can be entered and are versioned; changing a target does not alter past weeks.
- [ ] A live listing automatically advances a seller's stage (F4 cannot recur).
- [ ] The snapshot endpoint returns the contract in Appendix C; `reconcile()` passes on real data or reports specific failures.
- [ ] Clicking-through lists (people endpoint) match counts (I-14).
- [ ] Migrations are reversible and reviewed; nothing destructive.

**Prompt**

````
Read @docs/recruitment-analytics/SPEC.md (sections 5, 9.3, 9.4) and @docs/recruitment-analytics/AUDIT.md, plus the Phase 1 results.

Do Phase 2 only: "Capture the missing truth, and the snapshot API". Explain in plain language, one task at a time, and show me each migration before running it.

Tasks: tracked links + visitor id stitching; scout referral codes; self-reported source field; ad-spend and versioned targets (wire the existing Targets button); event ledger with auto-advance rules from SPEC 5.8; district normalisation; the single RecruitmentSnapshot endpoint and the people-list endpoint sharing one filter function; reconcile() implementing SPEC 6.9; Data Quality data from SPEC 5.10.

Constraints: migrations must be reversible and non-destructive; do not delete or rewrite historical rows; no third-party analytics SDKs; no real personal data in tests. Add tests for each rule. For WhatsApp attribution, tell me which WhatsApp setup we use (official Business API or the app) and what that means for ad attribution; do not build anything that bypasses WhatsApp's rules.

Finish by running the tests and listing files changed and anything you were unsure about.
````

---

### Phase 3: Design system and Command Center

**Goal:** the new 30-second page, beautiful and correct.

**Tasks**

1. Extend the existing theme with the tokens in section 8.2; document them in one place.
2. Build `AppShell`, `FilterBar` (sticky, URL-synced), `InfoTooltip`, `EmptyState`, `ErrorState`, `Skeleton`, and the Definitions drawer and Data Quality panel shell.
3. Build the Command Center (section 7.1): `HeadlineSentence`, `TargetCard` ×3, `AlertList` (top two) plus `AlertDrawer`, `StageTrack`, supply-vs-demand card (with the "not tracked yet" state), channel strip.
4. Headline sentence generated from templates (Appendix E).
5. Fix F11 layout defects; mobile layout per 7.1.
6. Place it at the new flagged route; leave the old page untouched.

**Acceptance**

- [ ] 30-second test passes with a colleague who has not seen the page (S1).
- [ ] Screenshots at 1440 and 390 px: no clipped text, no overlapping controls, no horizontal page scroll.
- [ ] Every number has an info tooltip with definition and mode; rates show n; small-sample badges appear when n < 10.
- [ ] Only two alerts are shown; "View all" opens the drawer; each alert opens a list whose length equals its count.
- [ ] Loading, empty, and error states exist and were verified by forcing them.
- [ ] Lighthouse accessibility check: no critical failures; contrast pairs verified.
- [ ] Reduced motion respected.

**Prompt**

````
Read @docs/recruitment-analytics/SPEC.md (sections 7.0, 7.1, 7.9, 8) and @docs/recruitment-analytics/AUDIT.md. Look at @docs/recruitment-analytics/reference/current-recruitment-page.png for what we are replacing.

Do Phase 3 only: design system + Command Center, at a NEW flagged route. Do not modify the old page.

First, inspect our existing theme and components and extend them (do not create a second styling system). Then build the shell, filter bar, shared states, and the Command Center exactly as specified, reading data only from the RecruitmentSnapshot endpoint. Generate the headline with the templates in SPEC Appendix E (no language model).

Use the browser tool to take screenshots at 1440px and 390px and fix any clipping, overlap or horizontal scroll. Force and verify loading, empty and error states. Then give me an acceptance checklist with evidence for each item in SPEC section 11, Phase 3.

Explain what you are doing in plain language. List files changed at the end.
````

---

### Phase 4: Funnels and Channels

**Goal:** show where people get stuck and which channels truly work, honestly.

**Tasks**

1. Funnels tab (7.2): `FunnelBars` for each role, biggest-leak sentence, stage aging chart, drawer lists, channel small multiples.
2. Channels tab (7.3): attribution meter, channel table with n/a handling and pinned Unattributed row, ranked bars with Wilson intervals, trend, spend panel, link builder, rule chips.
3. Apply minimum-sample thresholds (6.7).
4. Bubble chart only if thresholds are met.

**Acceptance**

- [ ] No rate above 100% anywhere; no negative duration anywhere.
- [ ] Channel rows sum to the total including Unattributed (I-4).
- [ ] WhatsApp-style channels without opens show "n/a", not a made-up rate.
- [ ] Every bar click lists the people (reached / waiting).
- [ ] Spend entry works; cost per activation appears; zero-activation case reads correctly.
- [ ] Link builder creates a working tracked link and shows live stats.

**Prompt**

````
Read @docs/recruitment-analytics/SPEC.md (sections 6.1 to 6.4, 6.7, 7.2, 7.3, 8.5) and @docs/recruitment-analytics/AUDIT.md.

Do Phase 4 only: the Funnels and Channels tabs on the new route. Read data only from the snapshot and people endpoints.

Build FunnelBars per role with the biggest-leak sentence, StageAgingChart, drawer lists, channel small multiples, then the Channels tab (attribution meter, channel table with n/a handling and a pinned Unattributed row, ranked bars with Wilson intervals, trend, spend panel, link builder, rule chips). Respect the minimum-sample thresholds in SPEC 6.7 and the chart rules in 8.5 (no pies, gauges, dual axes; build the funnel and any heatmap as custom components).

Verify with the browser tool at 1440px and 390px, run the tests and reconcile(), and give me an acceptance checklist with evidence for SPEC Phase 4. Explain in plain language. List files changed.
````

---

### Phase 5: People and Scouts

**Goal:** turn insight into daily action and fair coaching.

**Tasks**

1. People tab (7.5): Work queue (default), Board, Table; actions (WhatsApp deep link, call link, log outcome, follow-up, move stage with reasons, notes, owner); history drawer; masking and audited reveal.
2. Scouts tab (7.4): KPI strip, spotlight cards, normalised table with ramp period and status labels, scout drawer, coverage by district with optional map, white-space list, cohorts, payouts panel.
3. All actions write events with actor and time.

**Acceptance**

- [ ] Every action persists, appears in history, and changes counts consistently everywhere (move a person, then check Command Center and Funnels).
- [ ] Phone numbers masked by default; reveal is logged.
- [ ] New scouts show "Ramping", not "Behind".
- [ ] Scout table totals equal the scout KPIs (I-10).
- [ ] District rows sum to the national total including "District unknown" (I-9).
- [ ] Role-based access verified server-side.

**Prompt**

````
Read @docs/recruitment-analytics/SPEC.md (sections 5.8, 6.5, 6.8, 7.4, 7.5, 10) and @docs/recruitment-analytics/AUDIT.md.

Do Phase 5 only: the People tab (work queue, board, table) and the Scouts tab on the new route.

Every action (log outcome, follow-up, move stage with a required reason for Unreachable/Not a fit, add note, assign owner) must write an event with actor and time, and must update every other number on the page consistently. Mask phone numbers by default; "Reveal" must be audited. Enforce role-based access on the server. For scouts, normalise by tenure with a 14-day Ramping status and the supportive status labels in SPEC 6.8. For the district map, use a bundled open-licence boundary file, no tile service or external geo API; if that is heavy, ship the ranked bars first and ask me before adding a map.

Add tests, verify with the browser tool at 1440px and 390px, and give me a Phase 5 acceptance checklist with evidence. Plain language. List files changed.
````

---

### Phase 6: Supply and Demand, Trends and cohorts

**Goal:** see marketplace balance and learn from time.

**Tasks**

1. Supply & Demand tab (7.7) with the metrics in 6.6, forecast only if flock data exist, missing-data banner otherwise.
2. Trends tab (7.6): inputs vs outputs (six weeks + twelve months when available), XmR with the 8-point rule, cohort triangle with dashes and hatching, time-to-activate histogram, day-by-hour heatmap with the 100-signup rule.
3. If demand data is missing, build the smallest capture form (buyer request) with the owner's approval.

**Acceptance**

- [ ] Cohort triangle: dash for not-reached, hatching for incomplete, cohort sizes visible, weighted average row.
- [ ] Thresholds in 6.7 enforced; below them the component shows counts and a reason.
- [ ] XmR labels appear only with 8+ weekly points.
- [ ] Coverage ratio and "what to recruit next" sentences are generated from data and show the rule.
- [ ] Forecast clearly labelled "forecast".

**Prompt**

````
Read @docs/recruitment-analytics/SPEC.md (sections 6.6, 6.7, 7.6, 7.7, 8.5) and @docs/recruitment-analytics/AUDIT.md.

Do Phase 6 only: the Supply & Demand tab and the Trends tab on the new route.

Supply/demand: implement the metrics in SPEC 6.6 from the real tables found in the audit. If buyer demand or flock data is missing, show the missing-data banner and propose (do not silently build) the smallest capture; ask me first.

Trends: inputs-vs-outputs small multiples (last six weeks, plus twelve months only when six months of data exist), XmR "real change vs normal variation" only with 8+ weekly points, a cohort triangle built as a custom component (dash = not reached, hatching = incomplete, cohort size column, weighted average row), time-to-activate histogram, and the day-by-hour heatmap only when there are at least 100 signups.

Enforce the minimum-sample thresholds in SPEC 6.7. Add tests, verify visually at 1440px and 390px, and give me a Phase 6 acceptance checklist with evidence. Plain language. List files changed.
````

---

### Phase 7: Briefing (slides, PDF, WhatsApp summary)

**Goal:** make Monday's review a one-click ritual.

**Tasks**

1. Slide deck (7.8) at the new route, keyboard navigation, fullscreen.
2. Snapshot freeze: store the weekly snapshot JSON; briefing list; "restated" note.
3. Recommended actions from the rules in Appendix D, each showing rule and evidence; dismiss-with-reason logged.
4. Export to PDF (print stylesheet first); copy WhatsApp summary and `wa.me` share.
5. Free-text notes and owners on the "Decisions" slide, saved with the snapshot.

**Acceptance**

- [ ] Arrow keys, F, Esc work; slides render correctly at 1280 × 720 and print to a clean 16:9 PDF.
- [ ] Reopening last week's briefing shows frozen numbers; a "restated" note appears if live data later differs.
- [ ] WhatsApp summary contains no personal data and is within the length limit.
- [ ] Each recommended action shows its rule and evidence and can be dismissed with a reason.
- [ ] Numbers on slides equal the Command Center for the same week (same snapshot).

**Prompt**

````
Read @docs/recruitment-analytics/SPEC.md (sections 7.8, Appendix D, Appendix E) and @docs/recruitment-analytics/AUDIT.md.

Do Phase 7 only: the Briefing tab. Build the 9-slide deck from the same components and the same snapshot as the dashboard (presentation scale), keyboard navigation (arrows, F, Esc), frozen weekly snapshots with a "restated" note, rule-based recommended actions with visible rules and evidence, PDF export through a print stylesheet sized 16:9, and the copy-to-clipboard WhatsApp summary (no personal data, about 1,200 characters at most) plus a wa.me share link.

Verify at 1280x720 and print preview, run tests, and give me a Phase 7 acceptance checklist with evidence. Plain language. List files changed.
````

---

### Phase 8: Hardening and launch

**Goal:** make it fast, accessible, safe, and adopted.

**Tasks**

1. Performance pass against section 9.6 (query timings, indexes, caching, lazy loading, bundle size).
2. Accessibility pass (8.8): keyboard, focus, contrast, table alternatives, 200% zoom.
3. Mobile pass at 360, 390, 768 px.
4. Privacy review against section 10; confirm masking, audit events, and no personal data in exports.
5. Internal usage logging (S7) and the "last updated" and freshness checks (I-15).
6. Documentation: `README` for the analytics module, how to change a definition, how to add a metric, how to run seeds and tests.
7. Swap the flag so the new page is the default; keep the old route for one release as a fallback.

**Acceptance**

- [ ] Performance targets met or exceptions documented.
- [ ] No critical accessibility failures; every chart has a table alternative.
- [ ] Mobile screenshots clean on all tabs.
- [ ] All invariants green on production-like data.
- [ ] Privacy checklist (section 10) signed off by the owner.
- [ ] Rollback path documented and tested (flip the flag back).

**Prompt**

````
Read @docs/recruitment-analytics/SPEC.md (sections 8.8, 9.6, 9.8, 10, 11) and @docs/recruitment-analytics/AUDIT.md.

Do Phase 8 only: hardening and launch. Measure first, then fix: query timings and indexes, caching, lazy loading and bundle size; accessibility (keyboard, focus, contrast, table alternatives, 200% zoom); mobile at 360/390/768px; privacy review against SPEC section 10; internal usage logging (no third-party tracker); freshness checks; documentation for changing a definition or adding a metric.

Report measurements before and after. Do not remove the old page; keep it behind the flag as a fallback. Give me a final acceptance checklist with evidence for every item in SPEC section 1.4 and Phase 8. Plain language. List files changed.
````

---

## 12. Master prompt (paste this first)

> **Where:** new Cursor Agent chat, **Plan Mode on** (`Shift+Tab`). Attach the screenshot by saving it at `docs/recruitment-analytics/reference/current-recruitment-page.png`, which the prompt references.

````
You are helping me rebuild the Recruitment analytics in our existing app. I am a beginner: explain every step in plain language, keep changes small and reviewable, and never invent data, tables, fields or numbers.

READ FIRST (these define the work):
- @docs/recruitment-analytics/SPEC.md   ← the full specification. Follow it. Section 0.5 lists ground rules that always apply.
- @docs/recruitment-analytics/reference/current-recruitment-page.png   ← today's page, which shows data bugs (see SPEC section 4).

THIS TURN = PHASE 0 ONLY: AUDIT AND PLAN. Do NOT write or change any application code.

1. Record our stack and the exact commands to build, typecheck, lint and test (SPEC 9.1).
2. Find the current Recruitment page, its components, and every query/endpoint behind each widget. Make a table: widget → source query → tables/fields.
3. Map the real schema for: people/users and roles, link opens and tracking, signup source/UTM, applications, pipeline stage, KYC, listings/lots and who created them, orders/payments, flocks, buyer requests or inquiries, scouts and approvals, payouts, targets, districts.
4. For each finding F1-F12 in SPEC section 4.3: confirm or refute the hypothesis against the real code and data, quoting file paths and line numbers. Run the arithmetic cross-checks in SPEC 4.2 against real data.
5. List what is MISSING (e.g. buyer demand, event history, ad spend, visitor ids) and propose the smallest way to capture each. Tell me whether we use the official WhatsApp Business API or the plain WhatsApp Business app, because that decides whether click-to-WhatsApp ad attribution is possible.
6. Write a phased plan mapped to SPEC section 11 (Phases 1-8), adapted to our real stack, with the files you expect to touch.
7. Ask me at most 5 questions, only where a definition in SPEC section 2 is ambiguous. For each, propose the recommended default and say you will use it if I do not answer.

DELIVERABLE: create docs/recruitment-analytics/AUDIT.md containing all of the above. Then stop and wait for my approval. Finish with a plain-language summary of the 5 most important things you found.
````

---

## 13. Cursor operating manual for beginners

### 13.1 The modes in plain words

| Mode | What it does | Use it when |
|---|---|---|
| **Plan Mode** (`Shift+Tab`) | Researches the code, asks questions, writes an editable plan, waits for approval. | Start of every phase. |
| **Agent** | Reads and edits files, runs commands, iterates. | After you approve the plan. |
| **Debug Mode** (from the agent dropdown) | Forms hypotheses, adds temporary logging, asks you to reproduce, fixes from evidence. | A stubborn bug you can reproduce but cannot explain, such as a number that is wrong only sometimes. |

**Useful references inside a chat:** type `@` then a file name to attach it; `@Chats` to bring in a previous chat's context (better than pasting it); `@Branch` to orient the agent to your current branch. Tag a specific file when you know it; otherwise let the agent search.

**Images:** drag a screenshot into the chat for visual bugs or design comparisons. The agent can also use its **browser tool** to take its own screenshots and check the UI.

### 13.2 A safe rhythm

1. New chat per phase. 2. Plan Mode. 3. Edit the plan (delete what you don't want). 4. Approve. 5. Watch the diff as it works; press **Stop** if it heads the wrong way. 6. Run `/verify-analytics`. 7. Read the changes (use **Review** then **Find Issues** to get a second pass). 8. Commit.

### 13.3 Git survival kit

```
git status                          # what has changed
git diff                            # see the actual changes
git add -A && git commit -m "Phase 1: metrics module"   # save a checkpoint
git log --oneline                   # list checkpoints
git restore .                       # DISCARD uncommitted changes (cannot be undone)
git switch -c feature/short-name    # start a new safe branch
```

Commit after every passing phase. A commit is a checkpoint you can always return to.

### 13.4 When things go wrong

| Symptom | What to do |
|---|---|
| Cursor invents a field or table | Ask: "Show me the schema line or migration where this exists." If it can't, reject and tell it to list what is missing instead. |
| Two numbers disagree | Run `/verify-analytics`; read which invariant failed (SPEC 6.9); ask Cursor to trace both numbers back to the same function. |
| The chat is confused or repeating itself | Start a new chat; `@`-mention SPEC.md, AUDIT.md and `@Chats` for the old one. |
| It changed far too many files | `git restore .`, tighten the plan ("only these files"), run again. |
| It "fixed" a test by editing the test | Not allowed (SPEC 9.5). Revert and tell it the tests are the source of truth. |
| The page looks bland or generic | Attach a screenshot, ask for a critique against SPEC section 8, and consider running the same prompt on two models side by side and picking the better design. |
| A bug you can reproduce but not explain | Switch to Debug Mode and describe exactly how to reproduce it. |

### 13.5 Why the rule file is short

Rules are always-on context, and Cursor's guidance is to keep them to essentials: commands, patterns, pointers. Adding a rule is a response to a *repeated* mistake. The delivered `recruitment-analytics.mdc` is intentionally ~40 lines and points to this spec for the detail.

---

## 14. Alternatives considered

### 14.1 Build in-app vs buy or embed

| Option | Pros | Cons | Verdict |
|---|---|---|---|
| **Build inside the app (this spec)** | Branded and beautiful; workflow actions (call, move stage, briefing) live next to the numbers; one definition of every metric; personal data stays in your system. | More work than a template. | **Recommended.** |
| Embed an open-source BI tool (for example Metabase, self-hosted) | Fast ad-hoc questions; self-hostable. | Generic look; no recruitment workflow; second place for definitions to drift. | Optional **later**, for analysts' ad-hoc exploration only. |
| Hosted dashboard tools (for example Looker Studio) | Quick to start. | Data leaves your system; limited design control; no workflow. | Not for this. |
| Hosted product analytics (Mixpanel, Amplitude, PostHog cloud) | Strong funnel tooling. | Personal data transfer abroad needs care; cost; split definitions; no kanban or briefing. | Not now. |
| Spreadsheets | Flexible. | Manual, error-prone, no live pipeline. | Only as a stop-gap. |

### 14.2 Charts

Use the library already in the project. If there is none: **Recharts** (React default; shadcn/ui charts wrap it). Use **Apache ECharts** only if a Sankey or large geo view is truly needed. Build the funnel bars, stage track, cohort triangle and heatmaps as **custom components** (plain HTML/CSS/SVG): they are simpler, faster, and more accessible than forcing a chart library to do it. For the district map, a small `d3-geo` SVG over a bundled boundary file; no tile service.

### 14.3 Tooling: Cursor vs others

| Tool | Why you might use it | Verdict |
|---|---|---|
| **Cursor (default)** | Plan Mode, rules, browser tool and review are built in; matches this spec's workflow. | **Use this.** |
| VS Code with another assistant | If your team is standardised on it. | Only if required. |
| A terminal-based coding agent | Long unattended runs or CI automation. | Optional later. |

---

## Appendix A: SQL patterns

> **Important:** these are *patterns* in PostgreSQL style. Table and column names are placeholders. Cursor MUST read the real schema (Phase 0) and adapt them. Do not run anything that modifies data; these are read-only.

**A.1 Find durations that would be negative (DQ-2 / DQ-4, finding F3)**

```sql
-- Listings created before their owner's account existed
SELECT p.id              AS person_id,
       p.created_at      AS account_created_at,
       l.created_at      AS listing_created_at,
       l.created_by      AS listing_created_by,   -- if available (D12)
       EXTRACT(EPOCH FROM (l.created_at - p.created_at)) / 86400.0 AS days_diff
FROM   people p
JOIN   listings l ON l.owner_id = p.id
WHERE  l.created_at < p.created_at
ORDER  BY days_diff;
```

**A.2 Reconcile opens, accounts and sources (findings F1, F2)**

```sql
-- Compare how the SAME people are classed at open time vs signup time
SELECT o.channel_at_open,
       a.channel_at_signup,
       COUNT(DISTINCT a.person_id) AS people
FROM   link_opens o
JOIN   accounts a ON a.visitor_id = o.visitor_id
GROUP  BY 1, 2
ORDER  BY people DESC;
```

**A.3 Median days to activate, with n (section 6.3)**

```sql
SELECT COUNT(*) AS n,
       percentile_cont(0.5)  WITHIN GROUP (ORDER BY d) AS median_days,
       percentile_cont(0.25) WITHIN GROUP (ORDER BY d) AS p25,
       percentile_cont(0.75) WITHIN GROUP (ORDER BY d) AS p75
FROM (
  SELECT EXTRACT(EPOCH FROM (activated_at - created_at)) / 86400.0 AS d
  FROM   analytics.person_facts
  WHERE  role = 'seller'
    AND  NOT is_internal
    AND  activated_at IS NOT NULL
    AND  activated_at >= created_at            -- exclude invalid durations (counted under DQ-2)
    AND  (created_at AT TIME ZONE 'Africa/Kigali')::date BETWEEN :from AND :to
) t;
```

**A.4 Cohort funnel by entry week with a conversion window (cohort mode)**

```sql
SELECT date_trunc('week', created_at AT TIME ZONE 'Africa/Kigali') AS cohort_week,
       COUNT(*)                                                    AS accounts,
       COUNT(*) FILTER (WHERE kyc_verified_at <= created_at + INTERVAL '14 days')  AS kyc_14d,
       COUNT(*) FILTER (WHERE activated_at    <= created_at + INTERVAL '14 days')  AS activated_14d
FROM   analytics.person_facts
WHERE  role = 'seller' AND NOT is_internal
GROUP  BY 1
ORDER  BY 1;
-- Imputation (section 6.2) happens in person_facts so activated_14d <= kyc_14d <= accounts always holds.
```

**A.5 Stuck list (M-STUCK)**

```sql
SELECT person_id, role, current_stage,
       now() - stage_entered_at AS waiting
FROM   analytics.person_facts
WHERE  NOT is_internal
  AND  activated_at IS NULL
  AND  current_stage = 'applied'
  AND  stage_entered_at < now() - INTERVAL '2 days'     -- threshold from the config table (D6)
ORDER  BY stage_entered_at;
```

**A.6 Stage disagrees with events (DQ-7, finding F4)**

```sql
SELECT person_id, current_stage, activated_at
FROM   analytics.person_facts
WHERE  role = 'seller'
  AND  activated_at IS NOT NULL
  AND  current_stage IN ('applied', 'contacted');       -- should be empty after auto-advance rules
```

**A.7 Channel totals must equal overall (invariant I-4)**

```sql
SELECT (SELECT COUNT(*) FROM analytics.person_facts WHERE NOT is_internal AND created_at BETWEEN :from AND :to) AS total,
       (SELECT COALESCE(SUM(c),0) FROM (
          SELECT COUNT(*) c FROM analytics.person_facts
          WHERE NOT is_internal AND created_at BETWEEN :from AND :to
          GROUP BY COALESCE(first_touch_channel, 'unattributed')) x) AS sum_of_channels;
-- The two numbers must match.
```

---

## Appendix B: TypeScript helpers (statistics)

> Reference implementations. If the project is not TypeScript, port faithfully and keep the same tests.

```ts
// Wilson score interval for a proportion (95% by default).
// Chosen over the plain normal approximation because it behaves at 0 successes
// and small n, and never leaves [0, 1].
export function wilson(successes: number, n: number, z = 1.96) {
  if (!Number.isFinite(successes) || !Number.isFinite(n) || n <= 0) return null;
  if (successes < 0 || successes > n) return null; // invariant violation, caller logs DQ-10
  const p = successes / n;
  const z2 = z * z;
  const denom = 1 + z2 / n;
  const center = (p + z2 / (2 * n)) / denom;
  const half = (z * Math.sqrt((p * (1 - p)) / n + z2 / (4 * n * n))) / denom;
  return { p, low: Math.max(0, center - half), high: Math.min(1, center + half), n };
}

// Linear-interpolated quantile. Ignores non-finite values.
export function quantile(values: number[], q: number): number | null {
  const v = values.filter(Number.isFinite).sort((a, b) => a - b);
  if (v.length === 0) return null;
  const pos = (v.length - 1) * q;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  return v[lo] + (v[hi] - v[lo]) * (pos - lo);
}
export const median = (v: number[]) => quantile(v, 0.5);

// A rate that can never exceed 100% silently.
export type RateResult =
  | { ok: true; value: number; num: number; den: number }
  | { ok: false; reason: 'no-denominator' | 'invariant-violation'; num: number; den: number };

export function safeRate(num: number, den: number): RateResult {
  if (!(den > 0)) return { ok: false, reason: 'no-denominator', num, den };
  if (num < 0 || num > den) return { ok: false, reason: 'invariant-violation', num, den }; // log DQ-10, show "check data"
  return { ok: true, value: num / den, num, den };
}

// Change vs previous period. Percent only when the baseline is large enough (default 5).
export function periodChange(curr: number, prev: number, minBaselineForPct = 5) {
  const abs = curr - prev;
  const pct = prev >= minBaselineForPct ? abs / prev : null;
  const direction: 'up' | 'down' | 'flat' = abs > 0 ? 'up' : abs < 0 ? 'down' : 'flat';
  return { abs, pct, direction };
}

// Pace vs a weekly target. elapsedFraction in [0, 1] computed in Africa/Kigali time.
export function pace(actual: number, target: number, elapsedFraction: number) {
  const expected = target * Math.min(Math.max(elapsedFraction, 0), 1);
  const slack = Math.max(0.15 * target, 1); // lumpy counts: allow at least one unit
  if (actual >= expected + slack) return 'ahead' as const;
  if (actual < expected - slack) return 'behind' as const;
  return 'on_track' as const;
}

// XmR (individuals and moving range) limits. Use only with 8+ points.
export function xmr(points: number[]) {
  if (points.length < 8) return null;
  const mean = points.reduce((a, b) => a + b, 0) / points.length;
  const mr = points.slice(1).map((x, i) => Math.abs(x - points[i]));
  const mrBar = mr.reduce((a, b) => a + b, 0) / mr.length;
  const ucl = mean + 2.66 * mrBar;
  const lcl = Math.max(0, mean - 2.66 * mrBar);
  const outside = points.map((x) => x > ucl || x < lcl);
  // "run": 8 in a row on the same side of the mean
  const runFlags = points.map((_, i) => {
    if (i < 7) return false;
    const w = points.slice(i - 7, i + 1);
    return w.every((x) => x > mean) || w.every((x) => x < mean);
  });
  return { mean, ucl, lcl, outside, runFlags };
}
```

**Required tests for these helpers (write first, see them fail, then implement):** zero successes at n = 40 gives an upper bound near 9%; `wilson(0, 0)` is `null`; `safeRate(11, 1)` returns `invariant-violation`; `periodChange(2, 0)` has `pct === null`; `pace` boundaries with target 10 on days 1, 4 and 7; `quantile` on empty and single-item arrays; `xmr` returns `null` for 7 points.

---

## Appendix C: Snapshot JSON contract

> Illustrative shape with made-up values. Cursor adapts field names but keeps the structure: one snapshot, `n` and `definitionId` on every metric, and a `quality` block.

```json
{
  "meta": {
    "generatedAt": "2026-10-22T08:14:03Z",
    "timezone": "Africa/Kigali",
    "range": { "from": "2026-10-16", "to": "2026-10-22" },
    "prevRange": { "from": "2026-10-09", "to": "2026-10-15" },
    "week": { "from": "2026-10-19", "to": "2026-10-25", "elapsedFraction": 0.43 },
    "filters": { "role": "all", "channels": [], "districts": [] },
    "definitionsVersion": "2026-10-22.1"
  },
  "headline": {
    "segments": [
      { "text": "This week we activated " },
      { "text": "5 of 10", "emphasis": true },
      { "text": " target sellers (on track)." }
    ]
  },
  "kpis": {
    "sellersActivated": {
      "definitionId": "M-SELLER-ACTIVATED", "mode": "activity",
      "value": 5, "target": 10, "targetVersion": "t-2026-09-01",
      "pace": "on_track", "n": 17,
      "delta": { "abs": 2, "pct": null, "direction": "up" },
      "sparkline": [1, 2, 2, 3, 3, 5],
      "listHref": "/api/analytics/recruitment/people?metric=sellersActivated&week=2026-10-19"
    },
    "buyersActivated": { "definitionId": "M-BUYER-ACTIVATED", "mode": "activity", "value": 0, "target": null, "pace": null, "n": 0 },
    "scoutsActivated": { "definitionId": "M-SCOUT-ACTIVATED", "mode": "activity", "value": 0, "target": 2, "pace": "behind", "n": 4 }
  },
  "funnels": {
    "seller": {
      "mode": "cohort", "windowDays": 14, "entryN": 17,
      "steps": [
        { "id": "account", "reach": 17, "ofPrev": null, "ofTop": 1.0, "medianDaysFromPrev": null, "n": 17 },
        { "id": "contacted", "reach": 5, "ofPrev": 0.29, "ofTop": 0.29, "medianDaysFromPrev": 4.2, "iqr": [2.0, 6.1], "n": 5, "lowSample": true }
      ],
      "biggestLeak": { "from": "account", "to": "contacted", "eligible": false }
    }
  },
  "channels": [
    { "channel": "whatsapp_group_share", "opens": null, "accounts": 11, "activatedSellers": { "x": 3, "of": 8 }, "dead": { "tooEarly": true }, "medianDaysToActivate": { "value": 0, "n": 3 }, "spendRwf": null },
    { "channel": "unattributed", "opens": 0, "accounts": 3, "pinned": true }
  ],
  "pipeline": { "seller": [ { "stage": "applied", "count": 11 }, { "stage": "listing_live", "count": 5 } ] },
  "alerts": [
    { "id": "A-STUCK-APPLIED", "severity": "warn", "count": 11, "rule": "Seller at Applied for more than 2 days", "href": "..." }
  ],
  "supplyDemand": { "available": false, "reason": "buyer demand is not tracked yet" },
  "quality": {
    "confidence": "medium",
    "checks": [
      { "id": "DQ-1", "label": "Unattributed accounts", "count": 6, "severity": "warn" },
      { "id": "DQ-4", "label": "Listings created before account", "count": 6, "severity": "warn" }
    ],
    "reconciliation": { "ok": true, "failures": [] },
    "freshnessMinutes": 3
  }
}
```

---

## Appendix D: Recommended-action rules (transparent, configurable)

Each action shows: the **rule**, the **evidence numbers**, a **suggested owner**, and "Dismiss with reason". Thresholds live in config.

| ID | Rule (trigger) | Suggested action text | Default owner |
|---|---|---|---|
| R1 | A paid channel has at least 30 link opens in 14 days and 0 accounts | "Pause or fix <channel>: <opens> opens, 0 accounts in 14 days." | Ops lead |
| R2 | A channel has at least 30 accounts and its activation rate's Wilson upper bound is below the all-channel median | "Reduce spend on <channel>." | Ops lead |
| R3 | A channel has at least 30 accounts and its Wilson lower bound is above the all-channel median | "Increase budget on <channel>." | Ops lead |
| R4 | Unattributed share of accounts is above 20% | "Fix attribution: add tracked links to WhatsApp shares." | Ops lead |
| R5 | N or more people stuck beyond threshold in a stage | "Call these <N> people today (open list)." | Recruiters |
| R6 | A scout approved at least 14 days ago has no verified lot | "Check in with <N> scouts who have not started." | Scout lead |
| R7 | A scout exceeded 120% of target two weeks in a row | "Recognise <scout>; ask what is working." | Scout lead |
| R8 | A district has demand above 1.5× supply (next 14 days) | "Recruit sellers in <district>." | Recruiters |
| R9 | A district has supply above 1.5× demand | "Recruit buyers in <district>; send scouts to butcheries and restaurants." | Scout lead |
| R10 | Listings awaiting verification for more than 48 hours | "Verify <N> listings." | Verification team |
| R11 | Sellers who joined at least 5 days ago with no listing | "Help <N> sellers create their first listing." | Recruiters |
| R12 | Any negative duration or invariant failure | "Data issue: <check>. Fix before trusting <widget>." | Developer |
| R13 | No tracked links or spend entered this week | "Enter this week's spend so cost per activation works." | Ops lead |

Thresholds marked "starting guess" (for example 1.5×, 120%, 30) should be reviewed after eight weeks of data.

---

## Appendix E: Headline sentence templates

> **Numbers by code, words by template.** No language model writes these sentences, so they can never invent a number. A language model may *optionally* be used later only to rephrase, behind a flag, with a test that every number in the output equals the number in the input.

**Template parts (assembled in this order, skipping parts with no data):**

1. **Outcomes:** `This week we activated {sellers} of {sellerTarget} target sellers ({sellerPace}), {scouts} of {scoutTarget} scouts ({scoutPace}) and {buyers} {buyerClause}.`
   - `{buyerClause}` = `of {buyerTarget} target buyers ({buyerPace})` if a target exists, else `buyers (no target set)`.
   - Pace words: ahead → "ahead of pace", on_track → "on track", behind → "behind pace".
2. **Biggest backlog:** `{n} sellers are waiting at {stage}; {m} have waited over {threshold} days.` (only if m > 0)
3. **Best/worst channel** (only if thresholds in 6.7 are met): `{best} is bringing the most activations; {worst} has {accounts} accounts and none activated.`
4. **Supply/demand** (only if data exist): `Birds wanted exceed birds listed by {gap}, mostly in {district}.`
5. **Data caveat** (only if confidence is not High): `Numbers are {confidence} confidence: {count} {issue}.`

**Examples (illustrative):**

- "This week we activated **5 of 10** target sellers (on track), **0 of 2** scouts (behind pace) and **0** buyers (no target set). **16** sellers are waiting at Applied; **11** have waited over **2** days. Numbers are medium confidence: **6** accounts have no known source."
- Quiet week: "No activations yet this week. **12** people are waiting for a first contact."

**Rules:** numbers are bold; never more than three sentences; if every part is empty, say "Not enough activity this week to summarise." and show the work queue link.

---

## Appendix F: `/verify-analytics` command and the `.mdc` rule

### F.1 Cursor command (save as `.cursor/commands/verify-analytics.md`)

```markdown
Verify the recruitment analytics work. Do not change anything unless I ask.

1. Find the build, typecheck, lint and test commands (package.json or equivalent). Run typecheck, lint, and the analytics tests. Report pass/fail counts.
2. Run reconcile() / the reconciliation test and list every failed invariant id from docs/recruitment-analytics/SPEC.md section 6.9, with the numbers involved.
3. Start the dev server if needed. Using the browser tool, open the new recruitment route at 1440px and 390px wide. Take screenshots. Report any clipped text, overlapping elements, or horizontal page scroll.
4. For the current phase, go through the acceptance checklist in SPEC section 11 and print each item as PASS or FAIL with evidence (test name, screenshot, or query result).
5. List files changed since the last commit and anything you were unsure about.
```

### F.2 Rule file (save as `.cursor/rules/recruitment-analytics.mdc`)

A ready-made copy is delivered next to this spec. Contents:

```
---
description: Use when working on the recruitment analytics dashboard (Insights > Recruitment), metrics, funnels, channels, scouts, briefing.
globs:
alwaysApply: false
---

# Recruitment analytics: always-on essentials

Spec: @docs/recruitment-analytics/SPEC.md (follow it). Audit: @docs/recruitment-analytics/AUDIT.md.

## Non-negotiables
- Never invent data, fields or numbers. If something is missing, say so.
- All metric math lives in ONE module (analytics metrics). Widgets render slices of ONE snapshot; they never run their own queries.
- Every metric shows a definition id and n. Rates are "x of n". Wilson interval for small samples.
- Cohort mode vs Activity mode must be labelled; target cards = current calendar week (Africa/Kigali, Monday start).
- No rate over 100%, no negative duration, no hidden "Unattributed". Invalid rows are counted in Data Quality, not shown.
- Store UTC; display Africa/Kigali. RWF formatted with no decimals.
- Mask phone numbers by default; reveal is audited. No personal data in tests, logs, exports, PDFs, WhatsApp summaries.

## Workflow
- Plan first, then tests first (confirm they fail, never edit tests to pass), then implement.
- Reuse the existing stack and theme; no second styling or chart system without asking.
- After changes run typecheck, lint, tests, reconcile(); list files changed.
- Do not modify or delete the old Recruitment page until Phase 8 sign-off.

## Design
- Colour never carries meaning alone (icon + text). Okabe-Ito palette for categories.
- No pies, gauges, dual axes. Bars start at zero. At most two alerts on the Command Center.
- Every chart/table has loading, empty, error states and a "view as table" option.
```

(`globs` is intentionally empty; after Phase 0, fill it with the analytics folder paths so the rule attaches automatically.)

---

## Appendix G: Seed-data spec (so charts can be judged at realistic scale)

> **Why:** real volumes are tiny today, so cohort triangles, bubble charts and trend lines cannot be evaluated. A synthetic dataset lets the team see and test the dashboard at 100× scale **without touching real people**.

**Hard rules**

- Runs **only** against a local or throwaway database. The script MUST refuse to run if the database host or environment looks like production.
- Every row is flagged `is_synthetic = true` and excluded from production analytics unless an explicit demo flag is set.
- **No real names, phone numbers or locations of real people.** Use obviously fake names and reserved fake phone patterns.

**Volumes (180 days):** 400 sellers, 120 buyers, 25 scouts, 1,500 link opens, 600 listings, 300 inquiries, 80 paid orders, 12 weeks of ad spend across 5 channels.

**Shape:** channel mix (for example WhatsApp group shares 35%, Facebook ads 25%, direct/unattributed 15%, scouts 15%, Instagram 5%, market 5%); seller funnel realistic (Applied 100% → Contacted 70% → KYC 50% → Live listing 35% → First paid 20%); some channels strong, some weak; scouts with varied tenure (some ramping, some dormant, some excellent); districts distributed across all 30 with realistic imbalance (demand-heavy cities, supply-heavy rural districts).

**Deliberate defects (to test Data Quality):** about 8% of accounts unattributed; 5 listings created before their owner's account (staff-created); 3 stage values out of sync with events; 4 duplicate phone numbers; 6 people with unrecognised district strings; one week with no spend entered.

**Acceptance:** with the seed loaded, every invariant in 6.9 passes, the Data Quality panel reports exactly the injected defects, and the cohort triangle, bubble chart, XmR and day-by-hour heatmap all render (thresholds in 6.7 are met).

---

## Appendix H: Glossary (plain language)

| Term | Meaning |
|---|---|
| **Activated** | The person has done the first real thing that proves they are in (seller: live listing; buyer: first inquiry; scout: first verified lot). |
| **Activity mode / Cohort mode** | Two honest ways to count (section 6.2). |
| **Attribution / first touch** | Which channel first brought a person, recorded once. |
| **Cohort** | A group of people who joined in the same period, followed over time. |
| **Conversion window** | How long after joining a person has to reach a step to be counted. |
| **Dark social** | Links shared privately (for example in WhatsApp) that arrive with no source and look like "Direct". |
| **Event ledger** | An append-only history of what happened to each person, and when. |
| **Imputed step** | An earlier step assumed because a later one clearly happened; flagged in Data Quality. |
| **Invariant** | A rule that must always be true (for example no rate above 100%). |
| **IQR (25th to 75th percentile)** | The range containing the middle half of the values. |
| **Liquidity** | How well supply and demand actually find each other. |
| **Median** | The middle value; not distorted by one extreme case like an average is. |
| **n** | The number of people or items a number is based on. |
| **Reconciliation** | Automatic checks that the parts add up to the totals. |
| **Snapshot** | One bundle of numbers for the current filters that every widget reads from. |
| **Stuck / Dead** | Waiting too long in a stage / no activity for too long. |
| **Tracked link** | A link with a code that records which channel and campaign it came from. |
| **Wilson interval** | A reliable range for a percentage that stays honest with small numbers. |
| **XmR chart** | A chart that separates real change from normal week-to-week wobble. |
| **Migration** | A saved, versioned change to the database structure. |
| **Endpoint** | A server address the page calls to get data. |
| **Schema** | The list of tables and fields in the database. |
| **Feature flag** | A switch that turns a new feature on or off without redeploying. |

---

## Appendix I: Sources

Research used to shape this spec (retrieved 2026-10-22). Conclusions are paraphrased; where the spec adds its own judgement, it is marked ("our addition").

**Working with Cursor**
- Cursor, *Best practices for coding with agents*: https://cursor.com/blog/agent-best-practices
- Cursor docs, *Rules* (project rules use `.mdc`; plain `.md` in `.cursor/rules` is ignored; AGENTS.md alternative): https://cursor.com/docs/rules

**Marketplace metrics and onboarding**
- Linkrunner, *Metrics that Matter: Marketplace Apps Edition*: https://linkrunner.io/blog/metrics-that-matter-marketplace-apps-edition
- Kompassify, *Marketplace onboarding guide* (liquidity, harder side first): https://kompassify.com/blog/marketplace-onboarding-guide

**Funnels, cohorts and statistics**
- Amplitude docs, *Funnel Analysis FAQ* and *Interpret your funnel analysis*: https://amplitude.com/docs/analytics/charts/funnel-analysis/faq and https://amplitude.com/docs/analytics/charts/funnel-analysis/funnel-analysis-interpret
- Metabase glossary, *Cohort analysis*: https://www.metabase.com/glossary/cohort-analysis
- FounderPath, *SaaS cohort analysis* (dash means not reached): https://founderpath.com/free-tools/saas-cohort-analysis
- abtestly docs, *Confidence intervals* (Wilson; show n): https://docs.abtestly.com/methodology/confidence-intervals
- MetricGate, *Wilson score interval*: https://metricgate.com/calculator/wilson-score-interval

**Dashboard design**
- Nielsen Norman Group, *Data visualizations for dashboards* (preattentive features; length and position): https://www.nngroup.com/articles/dashboards-preattentive/
- Stephen Few, *Dashboard Design for Real-Time Situation Awareness* (Perceptual Edge), summarised in Esri's dashboard authoring guidance: https://services.twdb.texas.gov/arcgis/help/en/dashboards/10.9.1/reference/author-effective-dashboards.htm
- Metabase, *Agent performance dashboard* (support people, avoid gaming, normalise): https://www.metabase.com/dashboards/agent-performance

**Attribution and WhatsApp**
- Recast, *The difficulty measuring "dark social"*: https://getrecast.com/dark-social/
- DM Champ, *Click-to-WhatsApp ad attribution* (referral data only via the official WhatsApp Business API): https://help.dmchamp.com/integrations/click-to-whatsapp-attribution/
- Whapi.Cloud, *Track Click-to-WhatsApp (ctwa_clid)*: https://whapi.cloud/blog/track-click-to-whatsapp-ctwa-clid

**Operating rhythm**
- Nano Globals, *WBR (Weekly Business Review)*: https://nanoglobals.com/glossary/wbr-weekly-business-review/
- Commoncog, *Amazon's input vs output metrics*: https://commoncog.com/c/cases/amazon-incentives-category-expansion/

**Charts and geography**
- LogRocket, *Top React chart libraries* (shadcn/ui charts are built on Recharts): https://blog.logrocket.com/top-5-react-chart-libraries/
- geoBoundaries (open-licence administrative boundaries): https://www.geoboundaries.org ; HDX dataset: https://data.humdata.org/dataset/2c9a672b-12df-40f4-8d8c-c4da541b51c6
- Rwanda: 5 provinces, 30 districts: https://www.geopostcodes.com/country/rwanda/administrative-divisions/

**Rwanda data protection (not legal advice)**
- DLA Piper, *Data protection in Rwanda*: https://www.dlapiperdataprotection.com/?c=RW&t=law
- ALN Africa, *Rwanda Law No. 058/2021 overview*: https://aln.africa/?p=6104

**Our own additions (not from the sources above):** the self-checking reconciliation layer; one snapshot per request; the small-numbers mode; the two counting modes as a fix for contradictory counts; the minimum-sample table; the supportive scout status labels and ramp period; frozen weekly snapshots.

---

*End of spec.*
