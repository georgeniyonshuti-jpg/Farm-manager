-- Super-admin assignable Enterprise plan (bypass trial; high limits).

INSERT INTO billing_plans (id, name, price_usd, price_rwf, max_users, max_flocks, features, sort_order, is_active)
VALUES (
  'enterprise',
  'Enterprise',
  0,
  0,
  9999,
  9999,
  '["Unlimited team members","Unlimited flocks","Everything in Pro","Dedicated support","Custom integrations","No trial expiry"]'::jsonb,
  30,
  true
)
ON CONFLICT (id) DO NOTHING;
