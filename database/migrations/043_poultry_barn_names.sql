-- Persistent barn names for flocks (master list + FK on poultry_flocks).

CREATE TABLE IF NOT EXISTS poultry_barn_names (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name             TEXT NOT NULL,
  normalized_name  TEXT NOT NULL,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_poultry_barn_names_normalized_name
  ON poultry_barn_names (normalized_name);

CREATE INDEX IF NOT EXISTS idx_poultry_barn_names_name
  ON poultry_barn_names (name);

INSERT INTO poultry_barn_names (name, normalized_name)
VALUES ('Unassigned', 'unassigned')
ON CONFLICT (normalized_name) DO NOTHING;

ALTER TABLE poultry_flocks
  ADD COLUMN IF NOT EXISTS barn_name_id UUID REFERENCES poultry_barn_names (id) ON DELETE RESTRICT;

UPDATE poultry_flocks f
   SET barn_name_id = (SELECT id FROM poultry_barn_names WHERE normalized_name = 'unassigned' LIMIT 1)
 WHERE f.barn_name_id IS NULL;

ALTER TABLE poultry_flocks
  ALTER COLUMN barn_name_id SET NOT NULL;

COMMENT ON COLUMN poultry_flocks.barn_name_id IS 'Physical barn / house; references poultry_barn_names.';
