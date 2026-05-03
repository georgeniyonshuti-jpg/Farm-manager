-- Permanent supplier master list shared by flock hatcheries and feed procurement.
-- Safe additive migration with deduped backfill from existing text columns.

CREATE TABLE IF NOT EXISTS farm_suppliers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  normalized_name TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_farm_suppliers_normalized_name
  ON farm_suppliers (normalized_name);

CREATE INDEX IF NOT EXISTS idx_farm_suppliers_name
  ON farm_suppliers (name);

-- Backfill from flock purchase suppliers + feed procurement suppliers.
INSERT INTO farm_suppliers (name, normalized_name)
SELECT src.name, src.normalized_name
FROM (
  SELECT DISTINCT
    btrim(purchase_supplier) AS name,
    lower(regexp_replace(btrim(purchase_supplier), '\s+', ' ', 'g')) AS normalized_name
  FROM poultry_flocks
  WHERE purchase_supplier IS NOT NULL
    AND btrim(purchase_supplier) <> ''
  UNION
  SELECT DISTINCT
    btrim(supplier_name) AS name,
    lower(regexp_replace(btrim(supplier_name), '\s+', ' ', 'g')) AS normalized_name
  FROM farm_inventory_transactions
  WHERE supplier_name IS NOT NULL
    AND btrim(supplier_name) <> ''
) src
ON CONFLICT (normalized_name) DO NOTHING;
