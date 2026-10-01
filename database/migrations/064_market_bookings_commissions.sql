-- Market bookings commissions ledger + payout history.

ALTER TABLE pipeline_matches
  ADD COLUMN IF NOT EXISTS commission_rate_pct NUMERIC(7, 4),
  ADD COLUMN IF NOT EXISTS commission_amount_rwf NUMERIC(14, 2),
  ADD COLUMN IF NOT EXISTS commission_status TEXT NOT NULL DEFAULT 'none'
    CHECK (commission_status IN ('none', 'accrued', 'paid', 'void')),
  ADD COLUMN IF NOT EXISTS commission_paid_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS commission_paid_by UUID REFERENCES users (id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_pipeline_matches_commission_status
  ON pipeline_matches (commission_status)
  WHERE commission_status IN ('accrued', 'paid');

CREATE INDEX IF NOT EXISTS idx_pipeline_matches_commission_vet
  ON pipeline_matches (commission_vet_user_id)
  WHERE commission_vet_user_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS pipeline_commission_payouts (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  match_id        UUID NOT NULL REFERENCES pipeline_matches (id) ON DELETE CASCADE,
  amount_rwf      NUMERIC(14, 2) NOT NULL CHECK (amount_rwf >= 0),
  paid_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  paid_by         UUID REFERENCES users (id) ON DELETE SET NULL,
  note            TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_pipeline_commission_payouts_match
  ON pipeline_commission_payouts (match_id);

COMMENT ON TABLE pipeline_commission_payouts IS
  'In-app scout commission payout history (no MoMo); mark paid/unpaid from ops.';

-- Default commission rate in app_settings if table exists
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'app_settings'
  ) THEN
    INSERT INTO app_settings (setting_key, setting_value)
    VALUES ('pipeline_scout_commission_rate_pct', '2')
    ON CONFLICT (setting_key) DO NOTHING;
  END IF;
EXCEPTION
  WHEN undefined_table THEN NULL;
  WHEN others THEN NULL;
END $$;
