-- Accounting configuration: event-type -> Odoo journal/account defaults with
-- human-friendly labels so managers never need to know account codes directly.

CREATE TABLE IF NOT EXISTS accounting_event_configs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_type TEXT NOT NULL UNIQUE,       -- e.g. 'feed_purchase', 'medicine_purchase'
  label TEXT NOT NULL,                   -- human label shown in UI
  description TEXT NOT NULL DEFAULT '',  -- one-line explanation for managers
  odoo_move_type TEXT NOT NULL           -- 'in_invoice','out_invoice','entry'
    CHECK (odoo_move_type IN ('in_invoice', 'out_invoice', 'entry')),
  debit_account_code TEXT,               -- for journal entries
  credit_account_code TEXT,              -- for journal entries
  odoo_journal_type TEXT                 -- 'purchase','sale','general'
    CHECK (odoo_journal_type IN ('purchase','sale','general')),
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE accounting_event_configs IS
  'Manager-readable accounting templates. Maps each farm event type to Odoo move type and accounts.';

INSERT INTO accounting_event_configs
  (event_type, label, description, odoo_move_type, odoo_journal_type)
VALUES
  ('feed_purchase',
   'Feed Purchase Expense',
   'Records cost of feed received from supplier as a vendor bill.',
   'in_invoice', 'purchase'),
  ('medicine_purchase',
   'Medicine / Veterinary Supply Purchase',
   'Records cost of medicines or vet supplies received as a vendor bill.',
   'in_invoice', 'purchase'),
  ('slaughter_conversion',
   'Biological Asset → Meat Stock Conversion (IAS 41)',
   'Transfers live bird value to processed meat inventory at fair value less costs to sell.',
   'entry', 'general'),
  ('meat_sale',
   'Meat / Bird Sale Revenue',
   'Records revenue from selling processed birds or live stock to buyers.',
   'out_invoice', 'sale'),
  ('fcr_fair_value_adjustment',
   'Flock Fair Value Adjustment (IAS 41)',
   'Adjusts biological asset carrying value based on latest FCR and weight data.',
   'entry', 'general'),
  ('payroll_expense',
   'Payroll Expense Journal',
   'Records approved field worker payroll costs.',
   'entry', 'general')
ON CONFLICT (event_type) DO NOTHING;
