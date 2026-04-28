# Architecture Overview

## Module Map

```
farm_manager/
+-- farm_manager/
|   +-- hooks.py                 - integration hooks into ERPNext events
|   +-- api.py                   - REST API for mobile/external clients
|   +-- install.py               - bootstrap (roles, item groups, UOMs)
|   +-- boot.py                  - boot session augmentation
|   +-- farm_manager/
|   |   +-- doctype/             - all DocType JSON + Python controllers
|   |   +-- workspace/           - Farm Manager Workspace
|   |   +-- report/              - script reports (Flock Performance, P&L, Mortality, ...)
|   |   +-- dashboard_chart/     - default charts
|   |   +-- print_format/        - Broiler / Investor PDFs
|   +-- stock/                   - feed/medicine consumption -> Stock Entry
|   +-- accounting/              - Journal Entry posting + nightly revaluation
|   +-- payroll/                 - Salary Slip -> per-flock allocation
|   +-- sales/                   - Poultry Sales Order -> Sales Order/Invoice
|   +-- buying/                  - Farm Purchase -> Purchase Receipt/Invoice
|   +-- projects/                - Flock <-> Project bridge
|   +-- utils/
|   |   +-- erpnext_links.py     - lookup/create Item, Customer, Supplier, ...
|   |   +-- permissions.py       - role-aware permission resolvers
|   |   +-- cutover.py           - parallel-run helpers
|   +-- scripts/
|       +-- migrate_from_postgres.py  - one-off migration runner
+-- deploy/
|   +-- docker/                  - VPS docker-compose (mariadb + redis x3 + bench)
|   +-- render/                  - Render Blueprint (render.yaml)
+-- docs/
    +-- deployment.md
    +-- migration.md
    +-- cutover.md
    +-- architecture.md           (this file)
```

## DocType Relationship Diagram

```mermaid
erDiagram
    Farm ||--o{ "Farm House" : has
    Farm ||--o{ Flock : owns
    "Breed Standard" ||--o{ Flock : standardizes
    Flock ||--o| Project : "1-1 ERPNext"
    Flock ||--o| "Cost Center" : "1-1 ERPNext"
    Flock ||--o| Warehouse : "1-1 ERPNext"
    Flock ||--o| Item : "live bird"

    Flock ||--o{ "Flock Daily Log" : has
    Flock ||--o{ "Flock Check-in" : has
    Flock ||--o{ "Flock Feed Entry" : has
    Flock ||--o{ "Flock Weigh-in" : has
    Flock ||--o{ "Mortality Event" : has
    Flock ||--o{ "Slaughter Event" : has
    Flock ||--o{ "Health Record" : has
    Flock ||--o{ Prescription : has
    Flock ||--o{ "Treatment Round" : has
    "Treatment Round" ||--o{ "Treatment Round Event" : logs
    "Medicine Lot" ||--o{ "Treatment Round Event" : sourced
    Flock ||--o{ "Poultry Sales Order" : sells
    Flock ||--o{ "Farm Purchase" : purchases
    Flock ||--o{ "Flock Snapshot" : snapshots
    Employee ||--o{ "Laborer Assignment" : assigned
    "Laborer Assignment" }o--|| Flock : to
    "Salary Slip" ||--o| "Flock Payroll Allocation" : allocates
    "Flock Payroll Allocation" ||--o{ "Flock Payroll Allocation Line" : split
```

## Event Flow

1. **Daily Log Submit** -> `farm_manager.stock.feed_consumption.on_daily_log_submit` -> Stock Entry (Material Issue) for feed -> updates Stock Ledger -> Flock auto-recomputes FCR.
2. **Mortality Event Submit** -> `farm_manager.accounting.posting.on_mortality_submit` -> Journal Entry (Loss / Inventory) per `Accounting Event Config[MORTALITY_LOSS]`.
3. **Treatment Round Event (Dose Recorded) Submit** -> Stock Entry for medicine + decrement Medicine Lot remaining qty.
4. **Poultry Sales Order Submit** -> Sales Order -> Delivery Note -> Sales Invoice -> reduce flock current_count.
5. **Salary Slip Submit** -> Flock Payroll Allocation pro-rated by Laborer Assignment percentages.
6. **Daily Scheduler** -> recompute Flock metrics, snapshot active flocks, flag missed treatment rounds, run nightly revaluation.

## Permission Model

| Role                | Read | Create | Submit | Notes                                        |
|---------------------|:----:|:------:|:------:|----------------------------------------------|
| System Manager      |  YES |  YES   |  YES   | Full access                                  |
| Farm Owner          |  YES |   no   |   no   | Read-only dashboards / reports               |
| Farm Manager        |  YES |  YES   |  YES   | Operational lead                             |
| Farm Veterinarian   |  YES |  YES   |  YES   | Health/Treatment write, daily-log review     |
| Farm Laborer        |  partial |  partial | partial | Can only see assigned flock data       |
| Farm Accountant     |  YES |   YES* |   YES* | Limited to financial doctypes / approvals    |

`farm_manager.utils.permissions.flock_has_permission` enforces the per-laborer scoping at the Flock level (laborer sees only flocks where `assigned_laborer = user`).
