-- Guest buyer request extras: usual take, settlement, price expectation, handover, process.
-- Convert stamps these onto pipeline_buyers + pipeline_demands. Never auto-lists.

ALTER TABLE market_leads
  ADD COLUMN IF NOT EXISTS typical_birds_per_week INTEGER
    CHECK (typical_birds_per_week IS NULL OR typical_birds_per_week > 0),
  ADD COLUMN IF NOT EXISTS settle_terms TEXT
    CHECK (settle_terms IS NULL OR settle_terms IN ('cash_scale', 'same_week', 'days_7', 'days_14')),
  ADD COLUMN IF NOT EXISTS expected_rwf_per_kg INTEGER
    CHECK (expected_rwf_per_kg IS NULL OR expected_rwf_per_kg > 0),
  ADD COLUMN IF NOT EXISTS handover TEXT
    CHECK (handover IS NULL OR handover IN ('collect', 'delivery')),
  ADD COLUMN IF NOT EXISTS process TEXT
    CHECK (process IS NULL OR process IN ('live', 'slaughter'));

COMMENT ON COLUMN market_leads.settle_terms IS
  'Buyer settlement expectation: cash at scale, same week, or 7/14 day credit.';
COMMENT ON COLUMN market_leads.expected_rwf_per_kg IS
  'Null means they will take this week''s board. Otherwise a ceiling in RWF/kg.';

ALTER TABLE pipeline_buyers
  ADD COLUMN IF NOT EXISTS settle_terms TEXT
    CHECK (settle_terms IS NULL OR settle_terms IN ('cash_scale', 'same_week', 'days_7', 'days_14')),
  ADD COLUMN IF NOT EXISTS expected_rwf_per_kg INTEGER
    CHECK (expected_rwf_per_kg IS NULL OR expected_rwf_per_kg > 0);

ALTER TABLE pipeline_demands
  ADD COLUMN IF NOT EXISTS settle_terms TEXT
    CHECK (settle_terms IS NULL OR settle_terms IN ('cash_scale', 'same_week', 'days_7', 'days_14')),
  ADD COLUMN IF NOT EXISTS expected_rwf_per_kg INTEGER
    CHECK (expected_rwf_per_kg IS NULL OR expected_rwf_per_kg > 0),
  ADD COLUMN IF NOT EXISTS handover TEXT
    CHECK (handover IS NULL OR handover IN ('collect', 'delivery'));
