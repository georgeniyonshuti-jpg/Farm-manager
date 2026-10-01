-- Fulfillment handshake: logistics plan, dual confirm, exceptions.
-- Commission accrues only after both sides (or ops) settle.

ALTER TABLE pipeline_matches
  ADD COLUMN IF NOT EXISTS collect_or_delivery TEXT
    CHECK (collect_or_delivery IS NULL OR collect_or_delivery IN ('collect', 'delivery')),
  ADD COLUMN IF NOT EXISTS slaughter_mode TEXT
    CHECK (slaughter_mode IS NULL OR slaughter_mode IN ('farm', 'buyer', 'none')),
  ADD COLUMN IF NOT EXISTS fulfill_window_start TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS fulfill_window_end TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS logistics_notes TEXT,
  ADD COLUMN IF NOT EXISTS logistics_planned_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS logistics_planned_by UUID REFERENCES users (id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS actual_birds INTEGER
    CHECK (actual_birds IS NULL OR actual_birds >= 0),
  ADD COLUMN IF NOT EXISTS actual_weight_kg NUMERIC(10, 3)
    CHECK (actual_weight_kg IS NULL OR actual_weight_kg > 0),
  ADD COLUMN IF NOT EXISTS actual_price_per_kg NUMERIC(14, 4)
    CHECK (actual_price_per_kg IS NULL OR actual_price_per_kg >= 0),
  ADD COLUMN IF NOT EXISTS buyer_confirmed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS buyer_confirmed_by UUID REFERENCES users (id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS farmer_confirmed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS farmer_confirmed_by UUID REFERENCES users (id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS exception_kind TEXT NOT NULL DEFAULT 'none'
    CHECK (exception_kind IN ('none', 'short', 'no_show', 'price_dispute', 'failed', 'other')),
  ADD COLUMN IF NOT EXISTS exception_notes TEXT,
  ADD COLUMN IF NOT EXISTS exception_opened_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS exception_opened_by UUID REFERENCES users (id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS exception_resolved_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS exception_resolved_by UUID REFERENCES users (id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_pipeline_matches_exception_open
  ON pipeline_matches (exception_kind, updated_at DESC)
  WHERE exception_kind <> 'none' AND exception_resolved_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_pipeline_matches_handshake
  ON pipeline_matches (status, buyer_confirmed_at, farmer_confirmed_at)
  WHERE status = 'committed';

-- Already-delivered trades stay settled so existing commissions remain valid.
UPDATE pipeline_matches
   SET buyer_confirmed_at = COALESCE(buyer_confirmed_at, updated_at, created_at),
       farmer_confirmed_at = COALESCE(farmer_confirmed_at, updated_at, created_at)
 WHERE status = 'delivered'
   AND (buyer_confirmed_at IS NULL OR farmer_confirmed_at IS NULL);

COMMENT ON COLUMN pipeline_matches.collect_or_delivery IS
  'Handover job: buyer collects at farm, or farm/Cleva delivers.';
COMMENT ON COLUMN pipeline_matches.exception_kind IS
  'Open exception blocks settle/commission until ops resolves.';
