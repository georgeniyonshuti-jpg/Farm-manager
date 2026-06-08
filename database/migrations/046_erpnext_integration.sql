-- ERPNext integration: per-company config, sync log, warehouse mapping, entity tracking

CREATE TABLE IF NOT EXISTS erpnext_config (
  id                          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id                  UUID NOT NULL REFERENCES companies (id) ON DELETE CASCADE,
  erpnext_base_url            TEXT NOT NULL DEFAULT 'https://erp.clevacredit.com',
  erpnext_company             TEXT,
  erpnext_default_cost_center TEXT,
  account_feed_expense        TEXT,
  account_mortality_loss      TEXT,
  account_livestock_asset     TEXT,
  account_sales_revenue       TEXT,
  account_payroll_expense     TEXT,
  account_medicine_expense    TEXT,
  auto_sync_feed              BOOLEAN NOT NULL DEFAULT true,
  auto_sync_mortality         BOOLEAN NOT NULL DEFAULT true,
  auto_sync_slaughter         BOOLEAN NOT NULL DEFAULT true,
  auto_sync_payroll           BOOLEAN NOT NULL DEFAULT false,
  created_at                  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at                  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (company_id)
);

CREATE INDEX IF NOT EXISTS idx_erpnext_config_company ON erpnext_config (company_id);

CREATE TABLE IF NOT EXISTS erpnext_warehouse_mapping (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id        UUID NOT NULL REFERENCES companies (id) ON DELETE CASCADE,
  barn_name         TEXT NOT NULL,
  erpnext_warehouse TEXT NOT NULL,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (company_id, barn_name)
);

CREATE TABLE IF NOT EXISTS erpnext_sync_log (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id      UUID REFERENCES companies (id) ON DELETE SET NULL,
  entity_type     TEXT NOT NULL,
  entity_id       TEXT,
  event_type      TEXT NOT NULL DEFAULT 'unknown',
  erpnext_doctype TEXT,
  erpnext_ref     TEXT,
  status          TEXT NOT NULL DEFAULT 'success'
    CHECK (status IN ('success', 'failed', 'pending')),
  error_message   TEXT,
  payload         JSONB,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_erpnext_sync_log_company_created
  ON erpnext_sync_log (company_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_erpnext_sync_log_status
  ON erpnext_sync_log (status, created_at DESC);

-- Feed entries
ALTER TABLE flock_feed_entries
  ADD COLUMN IF NOT EXISTS erpnext_ref TEXT,
  ADD COLUMN IF NOT EXISTS erpnext_pending_ref TEXT,
  ADD COLUMN IF NOT EXISTS erpnext_sync_status TEXT DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS erpnext_synced_at TIMESTAMPTZ;

-- Mortality events
ALTER TABLE flock_mortality_events
  ADD COLUMN IF NOT EXISTS erpnext_ref TEXT,
  ADD COLUMN IF NOT EXISTS erpnext_pending_ref TEXT,
  ADD COLUMN IF NOT EXISTS erpnext_sync_status TEXT DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS erpnext_synced_at TIMESTAMPTZ;

-- Slaughter events
ALTER TABLE flock_slaughter_events
  ADD COLUMN IF NOT EXISTS erpnext_ref TEXT,
  ADD COLUMN IF NOT EXISTS erpnext_pending_ref TEXT,
  ADD COLUMN IF NOT EXISTS erpnext_sync_status TEXT DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS erpnext_synced_at TIMESTAMPTZ;

-- Treatments
ALTER TABLE flock_treatments
  ADD COLUMN IF NOT EXISTS erpnext_ref TEXT,
  ADD COLUMN IF NOT EXISTS erpnext_pending_ref TEXT,
  ADD COLUMN IF NOT EXISTS erpnext_sync_status TEXT DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS erpnext_synced_at TIMESTAMPTZ;
