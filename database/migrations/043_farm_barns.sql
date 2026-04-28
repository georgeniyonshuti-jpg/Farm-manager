-- Permanent barn master list + flock linkage (ClevaFarm).
-- Matches farm_suppliers pattern.

CREATE TABLE IF NOT EXISTS farm_barns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  normalized_name TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_farm_barns_normalized_name
  ON farm_barns (normalized_name);

CREATE INDEX IF NOT EXISTS idx_farm_barns_name
  ON farm_barns (name);

ALTER TABLE poultry_flocks
  ADD COLUMN IF NOT EXISTS barn_id UUID REFERENCES farm_barns (id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_poultry_flocks_barn_id
  ON poultry_flocks (barn_id)
  WHERE barn_id IS NOT NULL;

COMMENT ON COLUMN poultry_flocks.barn_id IS 'Barn/house assignment; resolves from farm_barns.';
