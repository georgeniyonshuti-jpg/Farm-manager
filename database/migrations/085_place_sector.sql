-- Sector sits under a district. The same sector name can exist in more than
-- one district, so a sector is only meaningful together with its district.
-- Existing rows keep a blank sector until someone edits them.
--
-- Undo:
-- ALTER TABLE pipeline_lots DROP COLUMN IF EXISTS sector;
-- ALTER TABLE pipeline_buyers DROP COLUMN IF EXISTS sector;
-- ALTER TABLE farm_profiles DROP COLUMN IF EXISTS sector;
-- ALTER TABLE scout_applications DROP COLUMN IF EXISTS sector;
-- ALTER TABLE recruitment_contacts DROP COLUMN IF EXISTS sector;
-- ALTER TABLE people_onboarding DROP COLUMN IF EXISTS sector;

ALTER TABLE pipeline_lots ADD COLUMN IF NOT EXISTS sector TEXT;
ALTER TABLE pipeline_buyers ADD COLUMN IF NOT EXISTS sector TEXT;
ALTER TABLE farm_profiles ADD COLUMN IF NOT EXISTS sector TEXT;
ALTER TABLE scout_applications ADD COLUMN IF NOT EXISTS sector TEXT;
ALTER TABLE recruitment_contacts ADD COLUMN IF NOT EXISTS sector TEXT;
ALTER TABLE people_onboarding ADD COLUMN IF NOT EXISTS sector TEXT;
