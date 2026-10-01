-- Track whether the account is provisioned/synced via Login with Cleva.
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS auth_source text NOT NULL DEFAULT 'local';

COMMENT ON COLUMN users.auth_source IS 'local = Farm password; cleva = Login with Cleva (ERPNext OAuth)';
