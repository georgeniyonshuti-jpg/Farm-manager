-- Weekly broiler rate card: Cleva names farm-gate and butcher prices.
-- One published card at a time. History stays.

CREATE TABLE IF NOT EXISTS market_rate_cards (
  id                        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  valid_from                DATE NOT NULL,
  valid_to                  DATE NOT NULL,
  status                    TEXT NOT NULL DEFAULT 'draft'
                              CHECK (status IN ('draft', 'published', 'archived')),
  slaughter_rwf_per_bird    INTEGER NOT NULL DEFAULT 0
                              CHECK (slaughter_rwf_per_bird >= 0),
  delivery_rwf_per_trip     INTEGER NOT NULL DEFAULT 0
                              CHECK (delivery_rwf_per_trip >= 0),
  commission_pct            NUMERIC(6, 2) NOT NULL DEFAULT 0
                              CHECK (commission_pct >= 0 AND commission_pct <= 100),
  bands                     JSONB NOT NULL DEFAULT '[]'::jsonb,
  notes                     TEXT,
  created_by                UUID REFERENCES users (id) ON DELETE SET NULL,
  published_by              UUID REFERENCES users (id) ON DELETE SET NULL,
  published_at              TIMESTAMPTZ,
  created_at                TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at                TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (valid_to >= valid_from)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_market_rate_cards_one_published
  ON market_rate_cards ((true))
  WHERE status = 'published';

CREATE INDEX IF NOT EXISTS idx_market_rate_cards_window
  ON market_rate_cards (valid_from DESC, valid_to DESC);

COMMENT ON TABLE market_rate_cards IS
  'Ops-published weekly broiler board. Public quote/board APIs read the published row only.';

ALTER TABLE market_leads
  ADD COLUMN IF NOT EXISTS avg_weight_kg NUMERIC(6, 3)
    CHECK (avg_weight_kg IS NULL OR avg_weight_kg > 0),
  ADD COLUMN IF NOT EXISTS quote_json JSONB;

COMMENT ON COLUMN market_leads.quote_json IS
  'Snapshot of the farmer quote at submit time (farm-gate, you-receive, assumptions).';
