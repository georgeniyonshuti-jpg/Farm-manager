-- Admin-created accounts must choose their own password after the temporary one.
-- Existing rows stay false. Undo: ALTER TABLE users DROP COLUMN IF EXISTS must_change_password;

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS must_change_password BOOLEAN NOT NULL DEFAULT false;
