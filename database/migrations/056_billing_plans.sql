-- Editable SaaS pricing plans (super-admin managed).

CREATE TABLE IF NOT EXISTS billing_plans (
  id               TEXT PRIMARY KEY,
  name             TEXT NOT NULL,
  price_usd        NUMERIC(10, 2) NOT NULL DEFAULT 0,
  price_rwf        INTEGER NOT NULL DEFAULT 0,
  max_users        INTEGER NOT NULL DEFAULT 5,
  max_flocks       INTEGER NOT NULL DEFAULT 3,
  features         JSONB NOT NULL DEFAULT '[]'::jsonb,
  stripe_price_id  TEXT,
  sort_order       INTEGER NOT NULL DEFAULT 0,
  is_active        BOOLEAN NOT NULL DEFAULT true,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_billing_plans_active_sort ON billing_plans (is_active, sort_order, id);

INSERT INTO billing_plans (id, name, price_usd, price_rwf, max_users, max_flocks, features, sort_order, is_active)
VALUES
  (
    'starter',
    'Starter',
    29,
    42000,
    5,
    3,
    '["Up to 5 team members","Up to 3 flocks","Check-in tracking","Performance scoring","Basic reports"]'::jsonb,
    10,
    true
  ),
  (
    'pro',
    'Pro',
    79,
    115000,
    25,
    20,
    '["Up to 25 team members","Up to 20 flocks","Everything in Starter","Odoo integration","Business model analytics","PDF reports","Priority support"]'::jsonb,
    20,
    true
  )
ON CONFLICT (id) DO NOTHING;
