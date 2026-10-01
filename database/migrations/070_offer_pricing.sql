-- Offer pricing: quantity tiers, Cleva-run take, rank rails, two-sided book lock.
-- Buyer sees Cleva landed price. Farm-gate never goes public.

ALTER TABLE market_rate_cards
  ADD COLUMN IF NOT EXISTS quantity_tiers JSONB NOT NULL DEFAULT '[
    {"id":"shop","minBirds":50,"maxBirds":99,"label":"Shop","farmGateAdjRwf":0,"butcherAdjRwf":0},
    {"id":"usual","minBirds":100,"maxBirds":199,"label":"Usual","farmGateAdjRwf":-30,"butcherAdjRwf":-50},
    {"id":"load","minBirds":200,"maxBirds":null,"label":"Load","farmGateAdjRwf":-80,"butcherAdjRwf":-150}
  ]'::jsonb,
  ADD COLUMN IF NOT EXISTS cleva_run_commission_pct NUMERIC(6, 2) NOT NULL DEFAULT 2
    CHECK (cleva_run_commission_pct >= 0 AND cleva_run_commission_pct <= 100);

COMMENT ON COLUMN market_rate_cards.quantity_tiers IS
  'Three named volume tiers. Buyer/farm-gate RWF/kg adjust from the weight-band base.';
COMMENT ON COLUMN market_rate_cards.cleva_run_commission_pct IS
  'Take % for managed-flock Cleva-run lots. commission_pct remains the market-only take.';

ALTER TABLE pipeline_lots
  ADD COLUMN IF NOT EXISTS rank_eligible BOOLEAN NOT NULL DEFAULT true;

COMMENT ON COLUMN pipeline_lots.rank_eligible IS
  'False when ask is outside this week''s farm-gate rail or birds are below the ranked MOQ.';

CREATE INDEX IF NOT EXISTS idx_pipeline_lots_rank_eligible
  ON pipeline_lots (rank_eligible)
  WHERE rank_eligible = true AND status IN ('open', 'partial');

ALTER TABLE pipeline_matches
  ADD COLUMN IF NOT EXISTS farm_gate_per_kg NUMERIC(12, 2),
  ADD COLUMN IF NOT EXISTS buyer_price_per_kg NUMERIC(12, 2),
  ADD COLUMN IF NOT EXISTS rate_card_id UUID REFERENCES market_rate_cards (id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS quantity_tier TEXT,
  ADD COLUMN IF NOT EXISTS quote_json JSONB;

COMMENT ON COLUMN pipeline_matches.agreed_price_per_kg IS
  'Buyer RWF/kg locked at book (same as buyer_price_per_kg).';
COMMENT ON COLUMN pipeline_matches.farm_gate_per_kg IS
  'Farmer RWF/kg locked at book. Never send to guests.';
COMMENT ON COLUMN pipeline_matches.quote_json IS
  'Full two-sided computeOffer snapshot at book.';

COMMENT ON COLUMN market_leads.quote_json IS
  'Buyer-side snapshot at request (you-pay, no farm-gate). Sell leads may still store a farmer quote.';
