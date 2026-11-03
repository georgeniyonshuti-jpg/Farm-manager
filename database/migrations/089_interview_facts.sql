-- Facts recorded on the verification call, kept apart from live listings.
-- Undo:
-- ALTER TABLE recruitment_contacts DROP CONSTRAINT IF EXISTS recruitment_contacts_flock_size_check;
-- ALTER TABLE recruitment_contacts DROP CONSTRAINT IF EXISTS recruitment_contacts_ready_in_weeks_check;
-- ALTER TABLE recruitment_contacts DROP CONSTRAINT IF EXISTS recruitment_contacts_buyer_for_check;
-- ALTER TABLE recruitment_contacts DROP CONSTRAINT IF EXISTS recruitment_contacts_bird_form_check;
-- ALTER TABLE recruitment_contacts DROP CONSTRAINT IF EXISTS recruitment_contacts_farms_known_check;
-- ALTER TABLE recruitment_contacts
--   DROP COLUMN IF EXISTS flock_size,
--   DROP COLUMN IF EXISTS ready_in_weeks,
--   DROP COLUMN IF EXISTS buyer_for,
--   DROP COLUMN IF EXISTS bird_form,
--   DROP COLUMN IF EXISTS delivery_required,
--   DROP COLUMN IF EXISTS will_visit,
--   DROP COLUMN IF EXISTS farms_known;

ALTER TABLE recruitment_contacts
  ADD COLUMN IF NOT EXISTS flock_size INTEGER,
  ADD COLUMN IF NOT EXISTS ready_in_weeks INTEGER,
  ADD COLUMN IF NOT EXISTS buyer_for TEXT,
  ADD COLUMN IF NOT EXISTS bird_form TEXT,
  ADD COLUMN IF NOT EXISTS delivery_required BOOLEAN,
  ADD COLUMN IF NOT EXISTS will_visit BOOLEAN,
  ADD COLUMN IF NOT EXISTS farms_known INTEGER;

ALTER TABLE recruitment_contacts DROP CONSTRAINT IF EXISTS recruitment_contacts_flock_size_check;
ALTER TABLE recruitment_contacts
  ADD CONSTRAINT recruitment_contacts_flock_size_check
  CHECK (flock_size IS NULL OR flock_size >= 0);

ALTER TABLE recruitment_contacts DROP CONSTRAINT IF EXISTS recruitment_contacts_ready_in_weeks_check;
ALTER TABLE recruitment_contacts
  ADD CONSTRAINT recruitment_contacts_ready_in_weeks_check
  CHECK (ready_in_weeks IS NULL OR ready_in_weeks BETWEEN 0 AND 8);

ALTER TABLE recruitment_contacts DROP CONSTRAINT IF EXISTS recruitment_contacts_buyer_for_check;
ALTER TABLE recruitment_contacts
  ADD CONSTRAINT recruitment_contacts_buyer_for_check
  CHECK (buyer_for IS NULL OR buyer_for IN ('butcher', 'restaurant', 'hotel', 'vendor', 'institution', 'household'));

ALTER TABLE recruitment_contacts DROP CONSTRAINT IF EXISTS recruitment_contacts_bird_form_check;
ALTER TABLE recruitment_contacts
  ADD CONSTRAINT recruitment_contacts_bird_form_check
  CHECK (bird_form IS NULL OR bird_form IN ('slaughtered', 'alive', 'either'));

ALTER TABLE recruitment_contacts DROP CONSTRAINT IF EXISTS recruitment_contacts_farms_known_check;
ALTER TABLE recruitment_contacts
  ADD CONSTRAINT recruitment_contacts_farms_known_check
  CHECK (farms_known IS NULL OR farms_known >= 0);
