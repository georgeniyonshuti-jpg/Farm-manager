-- Marketplace accounts: verification for farmer companies, buyer logins, lots.

-- Companies (farmer tenants) verification
ALTER TABLE companies
  ADD COLUMN IF NOT EXISTS verification_status TEXT NOT NULL DEFAULT 'verified'
    CHECK (verification_status IN ('pending', 'verified', 'rejected')),
  ADD COLUMN IF NOT EXISTS verified_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS verified_by UUID REFERENCES users (id) ON DELETE SET NULL;

COMMENT ON COLUMN companies.verification_status IS
  'Marketplace farmer KYC: new farmer signups start pending; legacy rows stay verified.';

-- Buyer login link + verification on CRM buyers
ALTER TABLE pipeline_buyers
  ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES users (id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS verification_status TEXT NOT NULL DEFAULT 'verified'
    CHECK (verification_status IN ('pending', 'verified', 'rejected')),
  ADD COLUMN IF NOT EXISTS verified_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS verified_by UUID REFERENCES users (id) ON DELETE SET NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_pipeline_buyers_user_id
  ON pipeline_buyers (user_id)
  WHERE user_id IS NOT NULL;

COMMENT ON COLUMN pipeline_buyers.user_id IS
  'Optional login user for marketplace buyers; null = CRM-only / legacy.';

-- Lot listing verification (separate from lifecycle status)
ALTER TABLE pipeline_lots
  ADD COLUMN IF NOT EXISTS verification_status TEXT NOT NULL DEFAULT 'verified'
    CHECK (verification_status IN ('pending_review', 'verified', 'rejected')),
  ADD COLUMN IF NOT EXISTS verified_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS verified_by UUID REFERENCES users (id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS listed_by UUID REFERENCES users (id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_pipeline_lots_verification
  ON pipeline_lots (verification_status, status);

COMMENT ON COLUMN pipeline_lots.verification_status IS
  'pending_review until ops approve; only verified + open/partial lots appear on the market.';

-- New marketplace farmer companies should be pending; existing stay verified (default above).
-- New scout/opt-in lots will set pending_review in application code.
