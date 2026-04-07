-- Bridge: Consolidated batch P&L export into main financing ledger (Operational Income)
-- FinancingModule owns `financing_ledger_entries` — replace name/columns to match your schema.

CREATE TYPE poultry_pl_export_status AS ENUM (
  'pending',
  'posted',
  'reversed'
);

CREATE TABLE poultry_batch_pl_exports (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  flock_id                UUID NOT NULL REFERENCES poultry_flocks (id) ON DELETE RESTRICT,
  fiscal_period           TEXT,
  net_pl_amount           NUMERIC(18, 2) NOT NULL,
  currency                TEXT NOT NULL DEFAULT 'USD',
  exported_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
  exported_by             TEXT REFERENCES app_users (id) ON DELETE SET NULL,
  financing_ledger_ref    TEXT,
  status                  poultry_pl_export_status NOT NULL DEFAULT 'pending',
  memo                    TEXT,
  UNIQUE (flock_id)
);

CREATE INDEX idx_poultry_pl_exports_status ON poultry_batch_pl_exports (status);

COMMENT ON TABLE poultry_batch_pl_exports IS 'One completed batch → one consolidation row; posting creates Operational Income in FinancingModule.';

-- Example placeholder FK — uncomment and point at your real ledger table:
-- ALTER TABLE poultry_batch_pl_exports
--   ADD COLUMN financing_entry_id UUID REFERENCES financing_ledger_entries (id);
