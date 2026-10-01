-- Tenant-scope feed inventory ledger rows by company.

ALTER TABLE farm_inventory_transactions
  ADD COLUMN IF NOT EXISTS company_id UUID REFERENCES companies (id) ON DELETE CASCADE;

UPDATE farm_inventory_transactions t
   SET company_id = f.company_id
  FROM poultry_flocks f
 WHERE t.company_id IS NULL
   AND t.flock_id IS NOT NULL
   AND f.id = t.flock_id;

UPDATE farm_inventory_transactions t
   SET company_id = u.company_id
  FROM users u
 WHERE t.company_id IS NULL
   AND t.flock_id IS NULL
   AND u.id = t.actor_user_id
   AND u.company_id IS NOT NULL;

UPDATE farm_inventory_transactions
   SET company_id = '00000000-0000-4000-8000-000000000001'::uuid
 WHERE company_id IS NULL;

ALTER TABLE farm_inventory_transactions
  ALTER COLUMN company_id SET NOT NULL;

CREATE INDEX IF NOT EXISTS idx_farm_inventory_transactions_company_feed_time
  ON farm_inventory_transactions (company_id, feed_type, recorded_at DESC);

COMMENT ON COLUMN farm_inventory_transactions.company_id IS 'Owning tenant company; required for multi-tenant stock isolation.';
