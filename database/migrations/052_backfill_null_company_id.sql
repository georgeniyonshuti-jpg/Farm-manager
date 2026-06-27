-- Backfill NULL company_id on tenant-scoped tables so strict equality filters never hide owned rows.

UPDATE users
SET company_id = '00000000-0000-4000-8000-000000000001'
WHERE company_id IS NULL;

UPDATE poultry_flocks
SET company_id = '00000000-0000-4000-8000-000000000001'
WHERE company_id IS NULL;
