-- Multi-tenant SaaS: companies, billing, announcements (Phases 3–5)

CREATE TABLE IF NOT EXISTS companies (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name            TEXT NOT NULL,
  slug            TEXT NOT NULL UNIQUE,
  plan            TEXT NOT NULL DEFAULT 'trial',
  trial_ends_at   TIMESTAMPTZ,
  is_active       BOOLEAN NOT NULL DEFAULT true,
  payment_overdue BOOLEAN NOT NULL DEFAULT false,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS company_id UUID REFERENCES companies (id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_users_company_id ON users (company_id);

CREATE TABLE IF NOT EXISTS announcements (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title       TEXT NOT NULL,
  message     TEXT NOT NULL,
  type        TEXT NOT NULL DEFAULT 'info',
  starts_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  ends_at     TIMESTAMPTZ,
  is_active   BOOLEAN NOT NULL DEFAULT true,
  created_by  UUID REFERENCES users (id) ON DELETE SET NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_announcements_active ON announcements (is_active, starts_at);

CREATE TABLE IF NOT EXISTS billing_subscriptions (
  id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id             UUID NOT NULL REFERENCES companies (id) ON DELETE CASCADE,
  stripe_customer_id     TEXT,
  stripe_subscription_id TEXT,
  status                 TEXT NOT NULL DEFAULT 'trialing',
  plan                   TEXT NOT NULL DEFAULT 'trial',
  trial_ends_at          TIMESTAMPTZ,
  current_period_end     TIMESTAMPTZ,
  created_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (company_id)
);

CREATE INDEX IF NOT EXISTS idx_billing_subscriptions_company ON billing_subscriptions (company_id);

-- Default company for existing single-tenant deployments
INSERT INTO companies (id, name, slug, plan, trial_ends_at, is_active)
VALUES (
  '00000000-0000-4000-8000-000000000001',
  'Default farm',
  'default-farm',
  'starter',
  NULL,
  true
)
ON CONFLICT (slug) DO NOTHING;

UPDATE users
SET company_id = '00000000-0000-4000-8000-000000000001'
WHERE company_id IS NULL;

ALTER TABLE poultry_flocks
  ADD COLUMN IF NOT EXISTS company_id UUID REFERENCES companies (id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_poultry_flocks_company ON poultry_flocks (company_id);

UPDATE poultry_flocks
SET company_id = '00000000-0000-4000-8000-000000000001'
WHERE company_id IS NULL;
