-- Soft-delete / access-revocation flag for users.
-- Hard deletes are unsafe: many tables reference users(id) with ON DELETE RESTRICT
-- (feed entries, daily logs, health records, treatments, etc.). Revoking access
-- deactivates the account while preserving historical records.
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS is_active boolean NOT NULL DEFAULT true;

CREATE INDEX IF NOT EXISTS idx_users_is_active ON users (is_active);
