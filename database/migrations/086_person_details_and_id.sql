-- Caller can correct a person's details, and KYC includes an ID check.
-- Existing rows keep a blank email and a missing ID until someone fills them.
-- People already Active stay Active.
--
-- Undo:
-- ALTER TABLE recruitment_contacts DROP CONSTRAINT IF EXISTS recruitment_contacts_kyc_identity_status_check;
-- ALTER TABLE recruitment_contacts
--   DROP COLUMN IF EXISTS email,
--   DROP COLUMN IF EXISTS details_edited_at,
--   DROP COLUMN IF EXISTS kyc_identity_status,
--   DROP COLUMN IF EXISTS kyc_id_number,
--   DROP COLUMN IF EXISTS kyc_id_photo_url,
--   DROP COLUMN IF EXISTS kyc_identity_reviewed_by;

ALTER TABLE recruitment_contacts
  ADD COLUMN IF NOT EXISTS email TEXT,
  ADD COLUMN IF NOT EXISTS details_edited_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS kyc_identity_status TEXT NOT NULL DEFAULT 'missing',
  ADD COLUMN IF NOT EXISTS kyc_id_number TEXT,
  ADD COLUMN IF NOT EXISTS kyc_id_photo_url TEXT,
  ADD COLUMN IF NOT EXISTS kyc_identity_reviewed_by UUID REFERENCES users(id) ON DELETE SET NULL;

ALTER TABLE recruitment_contacts DROP CONSTRAINT IF EXISTS recruitment_contacts_kyc_identity_status_check;
ALTER TABLE recruitment_contacts
  ADD CONSTRAINT recruitment_contacts_kyc_identity_status_check
  CHECK (kyc_identity_status IN ('missing', 'submitted', 'approved', 'rejected'));
