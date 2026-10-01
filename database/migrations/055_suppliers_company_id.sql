-- Tenant-scope supplier master list.

ALTER TABLE farm_suppliers
  ADD COLUMN IF NOT EXISTS company_id UUID REFERENCES companies (id) ON DELETE CASCADE;

UPDATE farm_suppliers
   SET company_id = '00000000-0000-4000-8000-000000000001'::uuid
 WHERE company_id IS NULL;

ALTER TABLE farm_suppliers
  ALTER COLUMN company_id SET NOT NULL;

DROP INDEX IF EXISTS uq_farm_suppliers_normalized_name;

CREATE UNIQUE INDEX IF NOT EXISTS uq_farm_suppliers_company_normalized_name
  ON farm_suppliers (company_id, normalized_name);

CREATE INDEX IF NOT EXISTS idx_farm_suppliers_company_name
  ON farm_suppliers (company_id, name);
