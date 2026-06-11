-- ClevaFarm <-> ERPNext entity sync: outbox, migration map, loan applications, reconciliation timestamps.

CREATE TABLE IF NOT EXISTS clevafarm_sync_outbox (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_type     TEXT NOT NULL,
  entity_id       TEXT NOT NULL,
  payload         JSONB NOT NULL DEFAULT '{}',
  direction       TEXT NOT NULL DEFAULT 'outbound'
    CHECK (direction IN ('outbound', 'inbound_logged')),
  status          TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'processing', 'sent', 'failed', 'cancelled')),
  attempts        INTEGER NOT NULL DEFAULT 0,
  last_attempted_at TIMESTAMPTZ,
  last_error      TEXT,
  next_retry_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  erpnext_ref     TEXT,
  erpnext_doctype TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (entity_type, entity_id)
);

CREATE INDEX IF NOT EXISTS idx_clevafarm_outbox_status_retry
  ON clevafarm_sync_outbox (status, next_retry_at)
  WHERE status IN ('pending', 'failed');

CREATE TABLE IF NOT EXISTS farm_migration_map (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  legacy_id       TEXT NOT NULL,
  erpnext_doctype TEXT NOT NULL,
  erpnext_name    TEXT,
  company_id      UUID REFERENCES companies (id) ON DELETE SET NULL,
  notes           TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (legacy_id, erpnext_doctype)
);

CREATE INDEX IF NOT EXISTS idx_farm_migration_map_legacy ON farm_migration_map (legacy_id);

CREATE TABLE IF NOT EXISTS farm_loan_applications (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id      UUID REFERENCES companies (id) ON DELETE SET NULL,
  flock_id        UUID REFERENCES poultry_flocks (id) ON DELETE SET NULL,
  applicant       TEXT,
  loan_amount     NUMERIC(16, 2),
  status          TEXT NOT NULL DEFAULT 'draft',
  erpnext_ref     TEXT,
  payload         JSONB NOT NULL DEFAULT '{}',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Reconciliation: ensure updated_at on tables that lack it
ALTER TABLE check_ins ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now();
ALTER TABLE flock_feed_entries ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now();
ALTER TABLE log_schedule ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now();

ALTER TABLE poultry_flocks
  ADD COLUMN IF NOT EXISTS opening_recorded BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS erpnext_purchase_invoice TEXT,
  ADD COLUMN IF NOT EXISTS sync_source TEXT;

ALTER TABLE payroll_impact ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now();

COMMENT ON TABLE clevafarm_sync_outbox IS 'Outbound entity sync queue to ERPNext clevafarm_integration.webhooks.receive';
