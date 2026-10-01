# ClevaFarm web design system

Two products on one token set:

| Mode | Audience | Principle |
|------|----------|-----------|
| **Field** | Laborers / vets on phones in barns | One decision per screen, 48–52px targets, high contrast, persistent bottom nav |
| **Manager** | Office / supervisors on desktop | Dense, scannable tables & KPIs; phone gets card lists, not shrunken tables |

## Tokens (`src/index.css`)

- **Brand green** (`--primary-color`) — primary actions only.
- **Status** — `--status-success|warning|danger|info|neutral` (+ `-soft` backgrounds). Prefer these over raw Tailwind `emerald-*` / `red-*`.
- **Charts** — `--chart-1`…`--chart-8`; use `lib/chartTokens.ts`.
- **Focus** — `--focus-ring`, `--focus-ring-strong` (theme-aware).

### Typography classes

`type-display` · `type-h1` · `type-h2` · `type-h3` · `type-body` · `type-caption` · `type-label` · `type-metric`

### Spacing & density (desktop manager shell)

Three token layers (see `src/index.css`):

| Layer | Tokens | Density-scaled? | Purpose |
|-------|--------|-----------------|---------|
| **Base** | `--u: 4px` | No | Immutable unit |
| **Control** | `--control-h-sm/md/lg/field`, `--pad-control-x`, `--radius-control` | **No** | Protects WCAG targets (24px desktop min, 44px field) |
| **Layout** | `--space-shell-x/y`, `--space-section`, `--space-stack`, `--space-card`, `--space-title-gap` | **Yes** (`--density`) | Page chrome, section gaps, card padding |

**Comfortable** (default): shell-x 24 · shell-y 16 · section 20 · stack 12 · card 16 · title-gap 8.

**Compact** (`html[data-density="compact"]`): layout tokens × 0.75. Controls do **not** shrink.

Use Tailwind semantic utilities: `p-shell-x`, `py-shell-y`, `gap-section`, `space-y-stack`, `p-card`, `gap-title-gap`. Prefer these over raw `p-6` / `mb-8` / `space-y-8` / `py-12` / `py-16` / `p-10` (guardrail failures).

Legacy `--space-1..12` remain as aliases during migration; prefer semantic layout tokens for new code.

#### Subtitle ban

Do **not** pass explanatory gray prose under page titles. Replacements:

1. **Delete** — restates the title or visible UI.
2. **Relocate** — real constraint → field `help` or inline `Notice`.
3. **Convert** — live data (counts, dates) → `PageFrame` `meta` chips (12px, tabular-nums).

`PageFrame` has **no** `subtitle` prop. `SectionCard` has no `description`. `StatCard` has no `subtext`.

#### Button matrix (desktop)

| Variant | Use |
|---------|-----|
| `primary` | One principal CTA per page (brand green) |
| `secondary` | Default bordered workhorse |
| `ghost` | Toolbars, table rows, dashboards |
| `danger` / `dangerGhost` | Destructive |

Sizes: `sm` 28 · `md` 32 (desktop default) · `lg` 40 · `field` 48 (touch only). One radius: `--radius-control` (8px). Use `IconButton`, `ButtonGroup`, `Toolbar`, `TextLink` — never raw `<button>` with ad-hoc Tailwind in desktop pages.

Density toggle lives in the avatar menu (`writeDensity`); it drives layout tokens **and** table row padding.

## Primitives (`src/components/ui/`)

| Component | Use |
|-----------|-----|
| `Button` | `primary` / `secondary` / `ghost` / `danger` / `dangerGhost`; sizes `sm` (28) / `md` (32, desktop default) / `lg` (40) / `field` (48) |
| `IconButton` | Square icon-only control |
| `ButtonGroup` / `Toolbar` | Related actions; one primary max, primary last |
| `TextLink` | Text-style actions (replaces underline hacks) |
| `Field` + `Input` / `Select` / `Textarea` / `Checkbox` | Labeled controls with help/error |
| `SegmentedControl` | Filters & in-form choices (Yes/No, Full/Low/Empty, ≤5 facets) — quiet capsule, not page chrome |
| `PageTabs` | Distinct jobs on one route (Today/Trends, Treatments/Rounds) — underline tabs in AppTopBar |
| `Card` | `default` / `subtle` / `elevated` for visual hierarchy (`p-card`) |
| `StatusPill` / `Badge` | Status tones only |
| `Metric` | Value + label + optional trend + context (“interpret, don’t just store”) |
| `DataTable` | Sticky institutional table; pass `renderMobileCard` for phone |
| `TableToolbar` | Filters · search \| meta · actions for every manager list |
| `ToolbarSearch` | Compact 32px search for `TableToolbar.search` only |
| `ToolbarOverflow` | Tertiary actions menu (Adjust / Compare / Reports) |
| `FacetFilter` | Filter menu + removable chip when options >5 or multi-facet |
| `Modal` | Forms & confirmations (desktop dialog / mobile sheet) |
| `EmptyState` | Compact teaching copy + optional action |
| `PageFrame` | Desktop page chrome (title → AppTopBar); **no subtitle** |

## Manager chrome contract

Desktop manager / vet-manager / admin list pages share one chrome recipe:

```
AppTopBar row 1:  Title                    [secondary…] [primary Create]
AppTopBar row 2:  Page tabs (jobs only)    [optional tab-scoped secondary]
                  ← single hard bottom edge on AppTopBar
Notices:          optional NoticeStrip under AppTopBar (soft fill, no border-b, no card)
Content:          one .table-block
                    ├─ DataTable toolbar = TableToolbar
                    │     filters (Segment ≤5 · Facet) · ToolbarSearch
                    │     | meta · Export/Refresh · ToolbarOverflow · Columns
                    └─ table body (sortable column headers)
```

**One way to filter / sort / act on lists**

| Job | Control | Where |
|-----|---------|-------|
| Switch page job | `PageTabs` | AppTopBar row 2 only |
| Primary filter (≤5) | `SegmentedControl` `sm` | `TableToolbar.filters` |
| Secondary filter | `FacetFilter` | `TableToolbar.filters` |
| Text search | `ToolbarSearch` | `TableToolbar.search` |
| Sort | Column header `sortable` + `sortKey`/`onSort` | `DataTable` only — never a floating “Highest risk” sort fake |
| Count | `TableToolbar.meta` | Right side of toolbar |
| Export / Refresh | `ghost`/`secondary` Button | `TableToolbar.actions` (≤2) |
| Jump / Compare / Reports | `ToolbarOverflow` | `TableToolbar.actions` |
| Column visibility | `columnPicker` | Injected by `DataTable` on the toolbar row |
| Create / Record | Primary `Button` | AppTopBar — never in the toolbar |

Hard rules:

1. Exactly **one** primary (green) in page chrome when a Create/Record/Receive exists.
2. Create lives in the top bar — **never** a body row below the title.
3. Create opens a **Modal** (or sheet). Do **not** toggle the header CTA label to “Close”.
4. Labels: `Create {noun}`, `Record {noun}`, `Receive stock` — no leading `+`, no “Create new …”.
5. Filters are Segment / Facet only — **never** `Button variant="primary"` as a filter chip.
6. Filters and search apply immediately (no “Apply” for simple facets/dates when change can bind).
7. `FieldFilterBar` / 48px field controls are **field roles only** — not manager desktop routes.
8. Prefer `Button` / `TextLink` / `ButtonGroup` over ad-hoc bordered `<a>` chrome.
9. Exactly **one** hard horizontal edge between AppTopBar and page content (`border-b` on the sticky header). No `shadow-xs` on AppTopBar. Tab / mobile-action rows use a soft divider only.
10. System notices (trial, ERPNext access, announcements) live **under** AppTopBar in the content column — never above the title bar or full-bleed over the sidebar. Soft fill, readable text, **no `border-b`**. Page-local notices use `NoticeStrip`.
11. Do **not** put a bordered tip / callout strip as the first body element under the top bar. Prefer `NoticeStrip`, muted plain text, empty states, or field help.
12. Single-section list pages: one `.table-block` with `DataTable` `flush` + `toolbar={<TableToolbar …/>}`. **Never** float `TableToolbar` above a separate card.
13. Page-level scope (barn / flock / similar) uses `TableToolbar` + `FacetFilter` — never a free-floating bordered filter band under the chrome.
14. Sort only via DataTable column headers. Put “jump to worst row” style actions in `ToolbarOverflow`, not beside filters.

## Manager table contract

Manager / vet-manager / admin **list pages must use `DataTable`**. Do not ship new raw `<table>` markup on desktop manager routes.

### Filter tiers

1. **Page tabs (`PageTabs`)** — different jobs on the same page (e.g. Treatments vs Rounds, Today vs Trends).
2. **Primary facet (≤5 values)** — `SegmentedControl` with optional counts (All · Failed (3) · Sent).
3. **Secondary facets (>5 options or multiple dimensions)** — `FacetFilter` (menu + removable chip). Never grow a SegmentedControl past 5 text options.
4. **Search** — `ToolbarSearch` inside `TableToolbar` when datasets can grow beyond a screenful.
5. **Sort** — DataTable column headers only (`sortable` + `sortKey` / `sortDir` / `onSort`).

Put filters in `DataTable`’s `toolbar={<TableToolbar …/>}` inside one `.table-block`. Prefer ghost/secondary for Refresh/Export; never use a row of primary buttons as status filters. Never float `TableToolbar` as a free band under AppTopBar.

### Cell & empty rules

- Status → `StatusPill` or `ERPNextSyncBadge` (icon + label). Never bare strings like `not_applicable`.
- Category/type → soft pill chips; actions → `TextLink` / ghost `Button`, only when relevant.
- Dates → `formatManagerDate` / `formatManagerDateTime`.
- Empty states: **no data yet** vs **no matches for filters** (`isFiltered` + `filteredEmptyTitle`) vs error+retry.
- Default visible columns ≤6–7; hide extras with `defaultHidden` + `columnPicker`.
- Phones: always pass `renderMobileCard` for operational lists.
- Inside an existing `.table-block`, use `DataTable` with `flush` to avoid double chrome.

## Field task shell (`src/components/field/`)

Field pages (Feed, Mortality, Check-in, Laborer Home, Vet Home, Meds, Vet logs) share one **page-state machine** — never stack alerts on a blocked screen.

| State | UI |
|-------|-----|
| `loading` | Skeleton only |
| `error` | `ErrorState` + retry |
| `no_flocks` | `FieldBlockedScreen` — one title, one CTA (home / notify manager) |
| `no_stock` | `FieldBlockedScreen` — managers link to Inventory (Feed only) |
| `ready` | `FieldTaskHub` or `FieldMissionCard` — status + metrics + primary CTA |
| log step | `FieldLogSheet` or `FieldStepSheet` — capture (`?log=1`; check-in uses `step=1..3`) |

| Page | Hub | Capture |
|------|-----|---------|
| Laborer Home | `FieldMissionCard` + `FieldQuickActions` | navigates to task pages |
| Vet Home | `FieldMissionCard` + `VetFieldQuickActions` | **Start vet visit** (scheduled AM/PM); no round check-in for junior vets |
| Feed | `FieldTaskHub` | `FieldLogSheet` |
| Mortality | `FieldTaskHub` + `FieldCompactStatus` | `FieldLogSheet` + `CountStepper` |
| Check-in | `FieldTaskHub` + `FieldCompactStatus` | `FieldStepSheet` (3 steps) |
| Meds (vet) | `FieldTaskHub` + `FieldCompactStatus` | `FieldLogSheet` (`?log=1`); history via `?view=history` |
| Vet logs (vet) | `FieldTaskHub` + `FieldCompactStatus` | `FieldStepSheet` (5 steps: flock/slot → house round → mortality → clinical → extras); history via `?view=history` |

### Field reporting modes (`field_reporting_mode` on company)

| Mode | Laborer round check-in | Junior vet |
|------|------------------------|------------|
| `vet_only` (default) | Hidden + no missed-check-in payroll | Scheduled vet visits only (2×/day) |
| `laborer_rounds` | Enabled | Vet visits only |
| `both` | Enabled | Vet visits only |

Junior vets **never** use round check-in. House-round data (temp, feed/water, photos) is captured in the vet visit flow via `HouseRoundStep`. Vet visit payroll credits apply on log approval (junior vet) or immediate submit (vet manager+).

| Component | Use |
|-----------|-----|
| `FieldBlockedScreen` | Single blocked/empty panel (wraps `EmptyState`) |
| `FieldTaskHub` | Ready-state body: teaching/compliance status (empty only) + metrics + CTA + recent list |
| `FieldMissionCard` | Laborer home hero: one status line + primary CTA |
| `FieldQuickActions` | Secondary icon row (Feed / Mortality / Rounds) |
| `VetFieldQuickActions` | Vet home icon row (Rounds / Vet logs / Meds) |
| `FieldHistoryList` | Compact recent rows on field hubs and history views |
| `FieldFilterBar` | Stacked mobile filters (search, flock, status chips) |
| `FieldCompactStatus` | Slim flock strip: label + urgency + 2 metrics max |
| `FieldLogSheet` | Single-step log form with back + submit |
| `FieldStepSheet` | Multi-step wizard with progress bar + Next/Submit |
| `KgStepper` / `CountStepper` | Touch-friendly quantity entry (kg / birds) |
| `useFieldTaskState` | Generalized page state (`needsStock` for Feed only) |
| `useFieldPageState` | Feed-specific wrapper around stock loading |

Bootstrap hints: ERP `feed_context` and `checkin_context` on each farm let the SPA paint blocked/ready UI before detail APIs return.

Existing: `PageHeader`, `EmptyState` (upgraded), skeletons, toasts, `PhotoCaptureInput`.

## Field chrome (`FieldGlobalHeader` + `FieldNavHeader`)

Field roles (`laborer`, `vet`, `dispatcher`) use context-aware chrome via `resolveFieldChromeMode()` in `lib/fieldChrome.ts`:

| Mode | When | UI |
|------|------|-----|
| **home** | `/dashboard/laborer` or `/dashboard/vet` | Logo + time-based greeting + lang toggle + avatar menu |
| **minimal** | Other field routes (non-task) | Right-aligned lang toggle + avatar only (~40px) |
| **hidden** | `/farm/*`, `/laborer/*`, or `?log=1` capture flows | No global header — task pages use `FieldNavHeader` |

### `FieldNavHeader` variants

Shared mobile nav bar for all field task pages (`components/layout/FieldPageHeader.tsx` exports `FieldNavHeader`):

| Variant | Typography | Use |
|---------|------------|-----|
| **hub** | `type-h3` | Task hub (feed, check-in, mortality, meds, vet logs) |
| **capture** | `type-h2` | Log sheet / step sheet (`?log=1`) |
| **history** | `type-h2` | In-page history (`?view=history`) |

Rules:

- **48×48px back control** — `ChevronLeft` link or button; same target on hub, capture, and history.
- **Flock identity** — show only in `FieldCompactStatus`, never duplicated under the page title.
- **`showAccount`** — on task routes (global header hidden), nav header trailing slot renders `FieldAccountCluster` (lang + avatar).
- **History actions** — use `FieldHeaderAction` (no underline); in-page history via `?view=history`, not manager desktop routes.
- **Section titles** — hub blocks use `FieldSectionTitle` (`type-h3`).
- **Hub status card** — show only for empty teaching copy or schedule/compliance (e.g. check-in overdue, meds withdrawal); never duplicate the latest row when a recent list is visible. Use `fieldHubTeachingStatus()` for log-centric pages.
- **Flock passport** — every field hub uses `FieldCompactStatus` with the same two metrics: **Day** (`status.ageDays`) and **Live birds** (from performance). Task-specific accents belong in metric `context` or header `badge` / `badgeSlot` only — never a third top-level metric layout. Use `buildFlockPassportMetrics()` from `fieldFlockMetrics.ts`. Withdrawal/overdue badges use `StatusPill` or `CheckinUrgencyBadge`, not one-off inline styles.
- Never stack global header + capture header on `?log=1`.
- Home greeting lives in the global header only (not duplicated in hub page body).
- Field account menu: avatar + chevron on mobile, no role pill; menu includes Light/Dark mode + Sign out (no standalone header theme icon).

## Navigation rules

- Sidebar groups by **job**: Operations, Health, Inventory, Planning & Workforce, Finance, Admin.
- Field roles get **bottom nav on every field page**, not only hubs.
- Icons: prefer `lucide-react` when touching chrome.

## Do / don’t

- Do reserve green for primary CTAs; use status tokens for feedback.
- Don’t dump SQL-style tables on phones — use `renderMobileCard`.
- Don’t invent third color dialects (hardcoded hex / light-only Tailwind) in new code.
