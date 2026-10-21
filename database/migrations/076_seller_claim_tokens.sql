-- Hashed, single-use seller invites. Raw tokens are not stored.
-- Rollback:
--   ALTER TABLE farm_profile_claims DROP CONSTRAINT IF EXISTS farm_profile_claims_status_check;
--   ALTER TABLE farm_profile_claims ADD CONSTRAINT farm_profile_claims_status_check
--     CHECK (status IN ('pending', 'accepted', 'expired', 'revoked'));
--   ALTER TABLE farm_profile_claims DROP COLUMN IF EXISTS token_hash;
--   ALTER TABLE farm_profile_claims DROP COLUMN IF EXISTS review_reason;
--   ALTER TABLE farm_profile_claims ALTER COLUMN expires_at SET DEFAULT (now() + interval '21 days');
--   ALTER TABLE pipeline_lots DROP COLUMN IF EXISTS rejection_reason;
--   ALTER TABLE farm_profiles DROP COLUMN IF EXISTS rejection_reason;

-- Hetzner restores Supabase's pgcrypto into schema "extensions", not public.
SET LOCAL search_path TO public, extensions;

ALTER TABLE farm_profile_claims
  ADD COLUMN IF NOT EXISTS token_hash TEXT,
  ADD COLUMN IF NOT EXISTS review_reason TEXT;

UPDATE farm_profile_claims
   SET token_hash = encode(digest(token, 'sha256'::text), 'hex')
 WHERE token_hash IS NULL
   AND token IS NOT NULL
   AND token <> '';

UPDATE farm_profile_claims
   SET token = token_hash
 WHERE token_hash IS NOT NULL
   AND token IS DISTINCT FROM token_hash;

UPDATE farm_profiles
   SET claim_token = NULL
 WHERE claim_token IS NOT NULL;

ALTER TABLE farm_profile_claims
  ALTER COLUMN expires_at SET DEFAULT (now() + interval '14 days');

ALTER TABLE farm_profile_claims DROP CONSTRAINT IF EXISTS farm_profile_claims_status_check;

ALTER TABLE farm_profile_claims
  ADD CONSTRAINT farm_profile_claims_status_check
  CHECK (status IN ('pending', 'accepted', 'expired', 'revoked', 'needs_review'));

CREATE UNIQUE INDEX IF NOT EXISTS idx_farm_profile_claims_token_hash
  ON farm_profile_claims (token_hash)
  WHERE token_hash IS NOT NULL;

ALTER TABLE pipeline_lots
  ADD COLUMN IF NOT EXISTS rejection_reason TEXT;

ALTER TABLE farm_profiles
  ADD COLUMN IF NOT EXISTS rejection_reason TEXT;

COMMENT ON COLUMN farm_profile_claims.token_hash IS
  'SHA-256 hex of the invite token. The raw token is shown once to the scout and is not stored.';
COMMENT ON COLUMN farm_profile_claims.review_reason IS
  'Set when automatic claim is refused and a desk user must finish the handoff.';
