-- Cleva collects from the buyer, then pays the farm. Order is confirmed only after buyer payment.

ALTER TABLE pipeline_matches
  ADD COLUMN IF NOT EXISTS buyer_payment_status TEXT NOT NULL DEFAULT 'unpaid'
    CHECK (buyer_payment_status IN ('unpaid', 'pending', 'paid', 'failed', 'refunded')),
  ADD COLUMN IF NOT EXISTS buyer_paid_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS buyer_paid_rwf NUMERIC(14, 2),
  ADD COLUMN IF NOT EXISTS buyer_payment_ref TEXT,
  ADD COLUMN IF NOT EXISTS farmer_payout_status TEXT NOT NULL DEFAULT 'unpaid'
    CHECK (farmer_payout_status IN ('unpaid', 'due', 'paid', 'held')),
  ADD COLUMN IF NOT EXISTS farmer_paid_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS farmer_paid_rwf NUMERIC(14, 2),
  ADD COLUMN IF NOT EXISTS farmer_payout_ref TEXT;

CREATE TABLE IF NOT EXISTS market_settlements (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  match_id            UUID NOT NULL REFERENCES pipeline_matches (id) ON DELETE CASCADE,
  side                TEXT NOT NULL CHECK (side IN ('buyer_in', 'farmer_out', 'visit_fee', 'refund')),
  status              TEXT NOT NULL DEFAULT 'pending'
                        CHECK (status IN ('pending', 'paid', 'failed', 'cancelled')),
  amount_rwf          NUMERIC(14, 2) NOT NULL,
  method              TEXT,
  payer_phone         TEXT,
  reference           TEXT,
  note                TEXT,
  created_by          UUID REFERENCES users (id) ON DELETE SET NULL,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  confirmed_at        TIMESTAMPTZ,
  confirmed_by        UUID REFERENCES users (id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_market_settlements_match
  ON market_settlements (match_id, side, status);

CREATE INDEX IF NOT EXISTS idx_pipeline_matches_buyer_pay
  ON pipeline_matches (buyer_payment_status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_pipeline_matches_farmer_pay
  ON pipeline_matches (farmer_payout_status, created_at DESC);

-- Existing trades predate checkout: treat them as already collected.
UPDATE pipeline_matches
   SET buyer_payment_status = 'paid',
       buyer_paid_at = COALESCE(buyer_paid_at, created_at),
       farmer_payout_status = CASE
         WHEN status = 'delivered' THEN 'paid'
         ELSE 'due'
       END
 WHERE buyer_payment_status = 'unpaid'
   AND buyer_payment_ref IS NULL;

INSERT INTO app_settings (setting_key, setting_value)
VALUES ('market_cleva_momo', '')
ON CONFLICT (setting_key) DO NOTHING;
