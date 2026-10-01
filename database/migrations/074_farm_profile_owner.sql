-- Host market sellers each own a farm_profiles row. Full-app farms keep one
-- unowned profile per company. Cleva Technologies (slug) is the market host.

ALTER TABLE farm_profiles
  ADD COLUMN IF NOT EXISTS owner_user_id UUID REFERENCES users (id) ON DELETE SET NULL;

DROP INDEX IF EXISTS idx_farm_profiles_company;

CREATE UNIQUE INDEX IF NOT EXISTS idx_farm_profiles_company_unowned
  ON farm_profiles (company_id)
  WHERE company_id IS NOT NULL AND owner_user_id IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_farm_profiles_owner
  ON farm_profiles (owner_user_id)
  WHERE owner_user_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_farm_profiles_owner_lookup
  ON farm_profiles (owner_user_id)
  WHERE owner_user_id IS NOT NULL;

-- One storefront per existing host market-only manager (pageAccess farm_market only).
INSERT INTO farm_profiles (
  company_id,
  slug,
  display_name,
  district,
  contact_phone,
  contact_whatsapp,
  created_by,
  owner_user_id,
  verification_status
)
SELECT
  u.company_id,
  's-' || substr(replace(u.id::text, '-', ''), 1, 12),
  COALESCE(NULLIF(btrim(u.full_name), ''), 'Farm'),
  NULL,
  NULL,
  NULL,
  u.id,
  u.id,
  'pending'
FROM users u
JOIN companies c ON c.id = u.company_id
WHERE c.slug = 'cleva-technologies'
  AND u.role = 'manager'
  AND u.page_access IS NOT NULL
  AND jsonb_typeof(u.page_access) = 'array'
  AND jsonb_array_length(u.page_access) > 0
  AND NOT EXISTS (
    SELECT 1
      FROM jsonb_array_elements_text(u.page_access) AS x(key)
     WHERE x.key <> 'farm_market'
  )
  AND NOT EXISTS (
    SELECT 1 FROM farm_profiles fp WHERE fp.owner_user_id = u.id
  );

COMMENT ON COLUMN farm_profiles.owner_user_id IS
  'Host-company market seller. Null means the profile is the farm company storefront.';
