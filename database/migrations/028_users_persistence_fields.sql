ALTER TABLE users
  ADD COLUMN IF NOT EXISTS password_hash TEXT,
  ADD COLUMN IF NOT EXISTS business_unit_access TEXT DEFAULT 'farm',
  ADD COLUMN IF NOT EXISTS can_view_sensitive_financial BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS department_keys JSONB DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS page_access JSONB DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

CREATE INDEX IF NOT EXISTS idx_users_email_lower ON users (LOWER(email));
