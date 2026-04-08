-- Manager-verified live head count (corrects unrecorded mortality, etc.)

ALTER TABLE poultry_flocks ADD COLUMN IF NOT EXISTS verified_live_count INTEGER;
ALTER TABLE poultry_flocks ADD COLUMN IF NOT EXISTS verified_live_note TEXT;
ALTER TABLE poultry_flocks ADD COLUMN IF NOT EXISTS verified_live_at TIMESTAMPTZ;

COMMENT ON COLUMN poultry_flocks.verified_live_count IS 'When set, performance views use this instead of initial_count - mortality - slaughter.';
