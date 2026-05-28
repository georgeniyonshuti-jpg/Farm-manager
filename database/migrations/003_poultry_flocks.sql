-- Standard breed reference: codes align with data/breed_standards.json keys (e.g. cobb_500)
CREATE TABLE poultry_breed_standards (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code            TEXT NOT NULL UNIQUE,
  display_name    TEXT NOT NULL,
  notes           TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE poultry_flocks (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  breed_standard_id   UUID REFERENCES poultry_breed_standards (id) ON DELETE SET NULL,
  breed_code          TEXT NOT NULL,
  placement_date      DATE NOT NULL,
  initial_count       INTEGER NOT NULL CHECK (initial_count > 0),
  hatchery_source     TEXT,
  target_weight_kg    NUMERIC(10, 3),
  initial_weight_kg   NUMERIC(12, 3) NOT NULL DEFAULT 0,
  status              poultry_flock_status NOT NULL DEFAULT 'planned',
  code                TEXT UNIQUE,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_poultry_flocks_status ON poultry_flocks (status);
CREATE INDEX idx_poultry_flocks_placement ON poultry_flocks (placement_date);
CREATE INDEX idx_poultry_flocks_breed_code ON poultry_flocks (breed_code);

COMMENT ON COLUMN poultry_flocks.breed_code IS 'Denormalized key for breed_standards JSON / poultry_breed_standards.code.';
COMMENT ON COLUMN poultry_flocks.initial_weight_kg IS 'Sum or measured batch weight at placement for FCR baseline.';
