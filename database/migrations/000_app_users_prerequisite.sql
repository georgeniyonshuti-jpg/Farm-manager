-- Runs before poultry RBAC migrations (002+), which reference app users.
-- Clevafarm uses TEXT ids (e.g. usr_...) in app_users, not a legacy UUID "users" table.

CREATE TABLE IF NOT EXISTS app_users (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  display_name TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL,
  business_unit_access TEXT NOT NULL DEFAULT 'farm',
  can_view_sensitive_financial BOOLEAN NOT NULL DEFAULT false,
  department_keys JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
