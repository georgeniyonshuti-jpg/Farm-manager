-- Operations-focused medicine, rounds, and growth tracking.
-- Additive migration: keeps existing 013 tables intact.

CREATE TABLE IF NOT EXISTS medicine_inventory (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  category TEXT NOT NULL CHECK (category IN ('vaccine','antibiotic','coccidiostat','vitamin','electrolyte','other')),
  unit TEXT NOT NULL CHECK (unit IN ('ml','g','doses','sachets')),
  quantity NUMERIC NOT NULL DEFAULT 0 CHECK (quantity >= 0),
  withdrawal_days INTEGER NOT NULL DEFAULT 0 CHECK (withdrawal_days >= 0),
  supplier TEXT,
  expiry_date DATE,
  low_stock_threshold NUMERIC NOT NULL DEFAULT 10 CHECK (low_stock_threshold >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_medicine_inventory_name ON medicine_inventory (name);

CREATE TABLE IF NOT EXISTS medicine_lots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  medicine_id UUID NOT NULL REFERENCES medicine_inventory (id) ON DELETE CASCADE,
  lot_number TEXT NOT NULL,
  received_at DATE NOT NULL DEFAULT CURRENT_DATE,
  expiry_date DATE,
  quantity_received NUMERIC NOT NULL CHECK (quantity_received > 0),
  quantity_remaining NUMERIC NOT NULL CHECK (quantity_remaining >= 0),
  supplier TEXT,
  invoice_ref TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (medicine_id, lot_number)
);

CREATE INDEX IF NOT EXISTS idx_medicine_lots_fefo ON medicine_lots (medicine_id, expiry_date, received_at);

CREATE TABLE IF NOT EXISTS treatment_rounds (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  flock_id TEXT NOT NULL,
  medicine_id UUID NOT NULL REFERENCES medicine_inventory (id) ON DELETE RESTRICT,
  planned_for TIMESTAMPTZ NOT NULL,
  window_start TIMESTAMPTZ,
  window_end TIMESTAMPTZ,
  route TEXT NOT NULL CHECK (route IN ('drinking_water','feed_additive','injection','topical')),
  dose_per_litre NUMERIC,
  dose_per_kg_feed NUMERIC,
  dose_per_bird NUMERIC,
  planned_quantity NUMERIC NOT NULL CHECK (planned_quantity > 0),
  status TEXT NOT NULL DEFAULT 'planned' CHECK (status IN ('planned','in_progress','completed','missed','cancelled')),
  assigned_to_user_id TEXT,
  checklist JSONB NOT NULL DEFAULT '[]'::jsonb,
  notes TEXT,
  created_by_user_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_treatment_rounds_flock_time ON treatment_rounds (flock_id, planned_for DESC);
CREATE INDEX IF NOT EXISTS idx_treatment_rounds_status ON treatment_rounds (status, planned_for);

CREATE TABLE IF NOT EXISTS treatment_round_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  round_id UUID NOT NULL REFERENCES treatment_rounds (id) ON DELETE CASCADE,
  event_type TEXT NOT NULL CHECK (event_type IN ('start','dose_recorded','completed','missed','note')),
  event_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  quantity_used NUMERIC,
  lot_id UUID REFERENCES medicine_lots (id) ON DELETE SET NULL,
  actor_user_id TEXT,
  photo_url TEXT,
  note TEXT
);

CREATE INDEX IF NOT EXISTS idx_treatment_round_events_round ON treatment_round_events (round_id, event_at DESC);

CREATE TABLE IF NOT EXISTS weigh_ins (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  flock_id TEXT NOT NULL,
  weigh_date DATE NOT NULL,
  age_days INTEGER NOT NULL CHECK (age_days >= 0),
  sample_size INTEGER NOT NULL CHECK (sample_size > 0),
  avg_weight_kg NUMERIC NOT NULL CHECK (avg_weight_kg > 0),
  total_feed_used_kg NUMERIC NOT NULL CHECK (total_feed_used_kg >= 0),
  fcr NUMERIC GENERATED ALWAYS AS (
    CASE
      WHEN avg_weight_kg > 0 AND sample_size > 0
      THEN ROUND((total_feed_used_kg / (avg_weight_kg * sample_size))::numeric, 2)
      ELSE NULL
    END
  ) STORED,
  target_weight_kg NUMERIC,
  variance_pct NUMERIC GENERATED ALWAYS AS (
    CASE
      WHEN target_weight_kg IS NOT NULL AND target_weight_kg > 0
      THEN ROUND((((avg_weight_kg - target_weight_kg) / target_weight_kg) * 100)::numeric, 1)
      ELSE NULL
    END
  ) STORED,
  cv_pct NUMERIC,
  underweight_pct NUMERIC,
  notes TEXT,
  recorded_by TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_weigh_ins_flock_date ON weigh_ins (flock_id, weigh_date DESC);
