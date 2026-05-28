-- Add accounting fields to payroll tables and new biological asset event accounting.

-- 1. payroll_impact: accounting_status for approved payroll → Odoo wage expense journal
ALTER TABLE payroll_impact
  ADD COLUMN IF NOT EXISTS accounting_status TEXT NOT NULL DEFAULT 'not_applicable'
    CHECK (accounting_status IN ('not_applicable','pending_approval','approved','sent_to_odoo','failed'));

CREATE INDEX IF NOT EXISTS idx_payroll_impact_accounting_status
  ON payroll_impact (accounting_status)
  WHERE accounting_status IN ('pending_approval','approved');

-- Payroll period summaries: when manager closes a payroll period, one Odoo journal entry
-- covers the total wages for all approved laborers in that period.
CREATE TABLE IF NOT EXISTS payroll_period_closures (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,
  total_credits_rwf NUMERIC(14,2) NOT NULL DEFAULT 0,
  total_deductions_rwf NUMERIC(14,2) NOT NULL DEFAULT 0,
  net_payroll_rwf NUMERIC(14,2) NOT NULL DEFAULT 0,
  worker_count INTEGER NOT NULL DEFAULT 0,
  approved_by TEXT NOT NULL,
  approved_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  accounting_status TEXT NOT NULL DEFAULT 'approved'
    CHECK (accounting_status IN ('approved','sent_to_odoo','failed')),
  odoo_move_id INTEGER,
  odoo_move_name TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (period_start, period_end)
);

CREATE INDEX IF NOT EXISTS idx_payroll_closures_period
  ON payroll_period_closures (period_start, period_end);

-- 2. Flock biological asset opening entries: when a flock is created with purchase cost,
--    recognise as biological asset (IAS 41).
ALTER TABLE poultry_flocks
  ADD COLUMN IF NOT EXISTS purchase_cost_rwf NUMERIC(14,2),          -- total cost of chick purchase
  ADD COLUMN IF NOT EXISTS cost_per_chick_rwf NUMERIC(14,4),         -- unit cost per chick
  ADD COLUMN IF NOT EXISTS purchase_supplier TEXT,
  ADD COLUMN IF NOT EXISTS purchase_date DATE,
  ADD COLUMN IF NOT EXISTS bio_asset_accounting_status TEXT NOT NULL DEFAULT 'not_applicable'
    CHECK (bio_asset_accounting_status IN ('not_applicable','pending_approval','approved','sent_to_odoo','failed'));

-- 3. Mortality events: mass mortality = IAS 41 impairment loss
--    Link to accounting_status for impairment journal entries.
ALTER TABLE flock_mortality_events
  ADD COLUMN IF NOT EXISTS accounting_status TEXT NOT NULL DEFAULT 'not_applicable'
    CHECK (accounting_status IN ('not_applicable','pending_approval','approved','sent_to_odoo','failed')),
  ADD COLUMN IF NOT EXISTS impairment_value_rwf NUMERIC(14,2),  -- estimated value lost (fair value × dead count × avg weight)
  ADD COLUMN IF NOT EXISTS accounting_approved_by TEXT,
  ADD COLUMN IF NOT EXISTS accounting_approved_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_mortality_accounting_status
  ON flock_mortality_events (accounting_status)
  WHERE accounting_status IN ('pending_approval','approved');

-- 4. Inventory write-offs (damage/loss/expired adjustments) → P&L expense
ALTER TABLE farm_inventory_transactions
  ADD COLUMN IF NOT EXISTS write_off_accounting_status TEXT
    CHECK (write_off_accounting_status IS NULL OR write_off_accounting_status IN ('not_applicable','pending_approval','approved','sent_to_odoo','failed'));

-- Add event_type to accounting_event_configs for new areas
INSERT INTO accounting_event_configs
  (event_type, label, description, odoo_move_type, odoo_journal_type)
VALUES
  ('payroll_wages',
   'Field Laborer Wage Expense',
   'Records total net payroll for the period as a wage expense journal entry.',
   'entry', 'general'),
  ('bio_asset_opening',
   'Biological Asset Opening (Chick Purchase)',
   'Records initial recognition of live birds as biological assets at cost (IAS 41).',
   'in_invoice', 'purchase'),
  ('mortality_impairment',
   'Mortality Impairment Loss (IAS 41)',
   'Records fair-value loss when birds die unexpectedly (IAS 41.18c).',
   'entry', 'general'),
  ('feed_inventory_writeoff',
   'Feed Inventory Write-off',
   'Records loss of feed stock due to damage, spillage, or expiry.',
   'entry', 'general'),
  ('bio_asset_closing',
   'Biological Asset Derecognition (Flock Close)',
   'Derecognises remaining biological asset when flock is closed (no remaining birds).',
   'entry', 'general')
ON CONFLICT (event_type) DO NOTHING;
