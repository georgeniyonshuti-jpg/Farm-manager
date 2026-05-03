-- Add accounting approval status and price fields to money-impacting tables.
-- All fields use IF NOT EXISTS to be safe in production.

-- 1. Feed inventory: cost capture + accounting status
ALTER TABLE farm_inventory_transactions
  ADD COLUMN IF NOT EXISTS supplier_name TEXT,
  ADD COLUMN IF NOT EXISTS accounting_status TEXT NOT NULL DEFAULT 'not_applicable'
    CHECK (accounting_status IN ('not_applicable','pending_approval','approved','sent_to_odoo','failed')),
  ADD COLUMN IF NOT EXISTS accounting_approved_by TEXT,
  ADD COLUMN IF NOT EXISTS accounting_approved_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_farm_inv_accounting_status
  ON farm_inventory_transactions (accounting_status)
  WHERE accounting_status IN ('pending_approval','approved');

-- 2. Medicine lots: price per unit + accounting status
ALTER TABLE medicine_lots
  ADD COLUMN IF NOT EXISTS unit_cost_rwf NUMERIC(14,2) CHECK (unit_cost_rwf IS NULL OR unit_cost_rwf >= 0),
  ADD COLUMN IF NOT EXISTS accounting_status TEXT NOT NULL DEFAULT 'not_applicable'
    CHECK (accounting_status IN ('not_applicable','pending_approval','approved','sent_to_odoo','failed')),
  ADD COLUMN IF NOT EXISTS accounting_approved_by TEXT,
  ADD COLUMN IF NOT EXISTS accounting_approved_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS total_cost_rwf NUMERIC(14,2)
    GENERATED ALWAYS AS (
      CASE WHEN unit_cost_rwf IS NOT NULL
        THEN ROUND((quantity_received * unit_cost_rwf)::numeric, 2)
        ELSE NULL END
    ) STORED;

CREATE INDEX IF NOT EXISTS idx_medicine_lots_accounting_status
  ON medicine_lots (accounting_status)
  WHERE accounting_status IN ('pending_approval','approved');

-- 3. Slaughter events: accounting fields + meat stock conversion tracking
ALTER TABLE flock_slaughter_events
  ADD COLUMN IF NOT EXISTS price_per_kg_rwf NUMERIC(14,2),
  ADD COLUMN IF NOT EXISTS total_live_weight_kg NUMERIC(14,3),
  ADD COLUMN IF NOT EXISTS total_carcass_weight_kg NUMERIC(14,3),
  ADD COLUMN IF NOT EXISTS accounting_status TEXT NOT NULL DEFAULT 'not_applicable'
    CHECK (accounting_status IN ('not_applicable','pending_approval','approved','sent_to_odoo','failed')),
  ADD COLUMN IF NOT EXISTS accounting_approved_by TEXT,
  ADD COLUMN IF NOT EXISTS accounting_approved_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS fair_value_rwf NUMERIC(14,2),
  ADD COLUMN IF NOT EXISTS fair_value_basis TEXT;

CREATE INDEX IF NOT EXISTS idx_slaughter_accounting_status
  ON flock_slaughter_events (accounting_status)
  WHERE accounting_status IN ('pending_approval','approved');

-- 4. Sales orders: approval + accounting flow
ALTER TABLE poultry_sales_orders
  ADD COLUMN IF NOT EXISTS accounting_status TEXT NOT NULL DEFAULT 'not_applicable'
    CHECK (accounting_status IN ('not_applicable','pending_approval','approved','sent_to_odoo','failed')),
  ADD COLUMN IF NOT EXISTS accounting_approved_by TEXT,
  ADD COLUMN IF NOT EXISTS accounting_approved_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS submission_status TEXT NOT NULL DEFAULT 'approved'
    CHECK (submission_status IN ('pending_review','approved','rejected')),
  ADD COLUMN IF NOT EXISTS reviewed_by TEXT,
  ADD COLUMN IF NOT EXISTS reviewed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS review_notes TEXT,
  ADD COLUMN IF NOT EXISTS buyer_email TEXT;

CREATE INDEX IF NOT EXISTS idx_sales_orders_submission_status
  ON poultry_sales_orders (submission_status)
  WHERE submission_status = 'pending_review';

-- 5. IAS 41 valuation snapshots per flock/date (biological assets)
CREATE TABLE IF NOT EXISTS flock_valuation_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  flock_id TEXT NOT NULL,
  snapshot_date DATE NOT NULL,
  age_days INTEGER,
  live_count INTEGER,
  avg_weight_kg NUMERIC(12,4),
  total_live_weight_kg NUMERIC(14,4),
  market_price_per_kg_rwf NUMERIC(14,2) NOT NULL,
  costs_to_sell_per_kg_rwf NUMERIC(14,2) NOT NULL DEFAULT 0,
  fair_value_per_kg_rwf NUMERIC(14,4)
    GENERATED ALWAYS AS (
      GREATEST(0, market_price_per_kg_rwf - costs_to_sell_per_kg_rwf)
    ) STORED,
  total_fair_value_rwf NUMERIC(16,2),
  previous_carrying_value_rwf NUMERIC(16,2),
  fair_value_change_rwf NUMERIC(16,2),
  fcr_at_snapshot NUMERIC(8,4),
  assumptions JSONB NOT NULL DEFAULT '{}',
  journal_entry_id TEXT,            -- FK to odoo_sync_outbox.source_id
  approved_by TEXT,
  approved_at TIMESTAMPTZ,
  status TEXT NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft','approved','posted')),
  created_by TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (flock_id, snapshot_date)
);

CREATE INDEX IF NOT EXISTS idx_flock_valuation_flock_date
  ON flock_valuation_snapshots (flock_id, snapshot_date DESC);

COMMENT ON TABLE flock_valuation_snapshots IS
  'IAS 41 biological-asset fair-value snapshots per flock/day. Source for valuation journal entries.';
