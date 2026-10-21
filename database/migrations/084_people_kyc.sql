-- KYC sits after the verification call and before Active.
-- The person can use the app. Listing, scout submission, and buyer orders
-- stay closed until the contract, location, and mobile-money proof are approved.
-- People already Active are left Active.
--
-- Undo:
-- UPDATE recruitment_contacts SET stage = 'follow_up' WHERE stage = 'kyc';
-- ALTER TABLE recruitment_contacts DROP CONSTRAINT IF EXISTS recruitment_contacts_stage_check;
-- ALTER TABLE recruitment_contacts ADD CONSTRAINT recruitment_contacts_stage_check
--   CHECK (stage IN (
--     'application', 'call_scheduled', 'called', 'follow_up',
--     'active', 'unreachable', 'not_a_fit'
--   ));
-- ALTER TABLE recruitment_contacts DROP CONSTRAINT IF EXISTS recruitment_contacts_kyc_contract_status_check;
-- ALTER TABLE recruitment_contacts DROP CONSTRAINT IF EXISTS recruitment_contacts_kyc_location_status_check;
-- ALTER TABLE recruitment_contacts DROP CONSTRAINT IF EXISTS recruitment_contacts_kyc_payment_status_check;
-- ALTER TABLE recruitment_contacts
--   DROP COLUMN IF EXISTS kyc_contract_status,
--   DROP COLUMN IF EXISTS kyc_contract_snapshot,
--   DROP COLUMN IF EXISTS kyc_signature_url,
--   DROP COLUMN IF EXISTS kyc_signed_at,
--   DROP COLUMN IF EXISTS kyc_signed_by,
--   DROP COLUMN IF EXISTS kyc_contract_reviewed_by,
--   DROP COLUMN IF EXISTS kyc_location_status,
--   DROP COLUMN IF EXISTS kyc_place,
--   DROP COLUMN IF EXISTS kyc_location_reviewed_by,
--   DROP COLUMN IF EXISTS kyc_payment_status,
--   DROP COLUMN IF EXISTS kyc_momo_phone,
--   DROP COLUMN IF EXISTS kyc_payment_proof_url,
--   DROP COLUMN IF EXISTS kyc_payment_reviewed_by;

ALTER TABLE recruitment_contacts DROP CONSTRAINT IF EXISTS recruitment_contacts_stage_check;

ALTER TABLE recruitment_contacts
  ADD CONSTRAINT recruitment_contacts_stage_check
  CHECK (stage IN (
    'application', 'call_scheduled', 'called', 'follow_up', 'kyc',
    'active', 'unreachable', 'not_a_fit'
  ));

ALTER TABLE recruitment_contacts
  ADD COLUMN IF NOT EXISTS kyc_contract_status TEXT NOT NULL DEFAULT 'missing',
  ADD COLUMN IF NOT EXISTS kyc_contract_snapshot TEXT,
  ADD COLUMN IF NOT EXISTS kyc_signature_url TEXT,
  ADD COLUMN IF NOT EXISTS kyc_signed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS kyc_signed_by UUID REFERENCES users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS kyc_contract_reviewed_by UUID REFERENCES users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS kyc_location_status TEXT NOT NULL DEFAULT 'missing',
  ADD COLUMN IF NOT EXISTS kyc_place TEXT,
  ADD COLUMN IF NOT EXISTS kyc_location_reviewed_by UUID REFERENCES users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS kyc_payment_status TEXT NOT NULL DEFAULT 'missing',
  ADD COLUMN IF NOT EXISTS kyc_momo_phone TEXT,
  ADD COLUMN IF NOT EXISTS kyc_payment_proof_url TEXT,
  ADD COLUMN IF NOT EXISTS kyc_payment_reviewed_by UUID REFERENCES users(id) ON DELETE SET NULL;

ALTER TABLE recruitment_contacts DROP CONSTRAINT IF EXISTS recruitment_contacts_kyc_contract_status_check;
ALTER TABLE recruitment_contacts
  ADD CONSTRAINT recruitment_contacts_kyc_contract_status_check
  CHECK (kyc_contract_status IN ('missing', 'submitted', 'approved', 'rejected'));

ALTER TABLE recruitment_contacts DROP CONSTRAINT IF EXISTS recruitment_contacts_kyc_location_status_check;
ALTER TABLE recruitment_contacts
  ADD CONSTRAINT recruitment_contacts_kyc_location_status_check
  CHECK (kyc_location_status IN ('missing', 'submitted', 'approved', 'rejected'));

ALTER TABLE recruitment_contacts DROP CONSTRAINT IF EXISTS recruitment_contacts_kyc_payment_status_check;
ALTER TABLE recruitment_contacts
  ADD CONSTRAINT recruitment_contacts_kyc_payment_status_check
  CHECK (kyc_payment_status IN ('missing', 'submitted', 'approved', 'rejected'));
