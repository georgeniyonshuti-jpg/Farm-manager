-- Premium marketplace storefronts: consent-controlled farm profiles,
-- Cloudinary media, listing visibility tiers, scout visits, claims, analytics.

-- ——— Farm profiles ———

CREATE TABLE IF NOT EXISTS farm_profiles (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id              UUID REFERENCES companies (id) ON DELETE SET NULL,
  slug                    TEXT NOT NULL,
  display_name            TEXT NOT NULL,
  story                   TEXT,
  district                TEXT,
  location_label          TEXT,
  exact_location          TEXT,
  lat                     NUMERIC(10, 6),
  lng                     NUMERIC(10, 6),
  contact_phone           TEXT,
  contact_whatsapp        TEXT,
  contact_email           TEXT,
  specialties             TEXT[] NOT NULL DEFAULT '{}',
  slaughter_available     BOOLEAN NOT NULL DEFAULT false,
  delivery_available      BOOLEAN NOT NULL DEFAULT false,
  verification_status     TEXT NOT NULL DEFAULT 'pending'
                            CHECK (verification_status IN ('pending', 'verified', 'rejected')),
  verified_at             TIMESTAMPTZ,
  verified_by             UUID REFERENCES users (id) ON DELETE SET NULL,
  published               BOOLEAN NOT NULL DEFAULT false,
  consent_status          TEXT NOT NULL DEFAULT 'none'
                            CHECK (consent_status IN ('none', 'pending', 'granted', 'revoked')),
  consent_at              TIMESTAMPTZ,
  consent_source          TEXT
                            CHECK (consent_source IS NULL OR consent_source IN ('farmer', 'scout', 'ops')),
  consent_name            TEXT,
  consent_phone           TEXT,
  scouted_by              UUID REFERENCES users (id) ON DELETE SET NULL,
  disclose_contact        BOOLEAN NOT NULL DEFAULT false,
  disclose_exact_location BOOLEAN NOT NULL DEFAULT false,
  disclose_exact_price    BOOLEAN NOT NULL DEFAULT false,
  claim_token             TEXT,
  claim_email             TEXT,
  created_by              UUID REFERENCES users (id) ON DELETE SET NULL,
  created_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT farm_profiles_slug_chk CHECK (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  CONSTRAINT farm_profiles_publish_chk CHECK (
    published = false
    OR (consent_status = 'granted' AND verification_status = 'verified')
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_farm_profiles_slug
  ON farm_profiles (slug);

CREATE UNIQUE INDEX IF NOT EXISTS idx_farm_profiles_company
  ON farm_profiles (company_id)
  WHERE company_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_farm_profiles_public
  ON farm_profiles (district, published)
  WHERE published = true AND consent_status = 'granted' AND verification_status = 'verified';

CREATE INDEX IF NOT EXISTS idx_farm_profiles_scout
  ON farm_profiles (scouted_by)
  WHERE scouted_by IS NOT NULL;

COMMENT ON TABLE farm_profiles IS
  'Consent-controlled public farm storefronts. Unpublished/unconsented rows must never leak on /api/market.';

-- ——— Claims (scout-captured farms invited to join) ———

CREATE TABLE IF NOT EXISTS farm_profile_claims (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  farm_profile_id     UUID NOT NULL REFERENCES farm_profiles (id) ON DELETE CASCADE,
  invited_email       TEXT,
  invited_phone       TEXT,
  token               TEXT NOT NULL,
  status              TEXT NOT NULL DEFAULT 'pending'
                        CHECK (status IN ('pending', 'accepted', 'expired', 'revoked')),
  claimed_by_user_id  UUID REFERENCES users (id) ON DELETE SET NULL,
  claimed_company_id  UUID REFERENCES companies (id) ON DELETE SET NULL,
  expires_at          TIMESTAMPTZ NOT NULL DEFAULT (now() + interval '21 days'),
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  accepted_at         TIMESTAMPTZ
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_farm_profile_claims_token
  ON farm_profile_claims (token);

CREATE INDEX IF NOT EXISTS idx_farm_profile_claims_profile
  ON farm_profile_claims (farm_profile_id, status);

-- ——— Scout visits ———

CREATE TABLE IF NOT EXISTS farm_visits (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  farm_profile_id     UUID NOT NULL REFERENCES farm_profiles (id) ON DELETE CASCADE,
  scout_user_id       UUID NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  visited_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  notes               TEXT,
  consent_recorded    BOOLEAN NOT NULL DEFAULT false,
  status              TEXT NOT NULL DEFAULT 'submitted'
                        CHECK (status IN ('draft', 'submitted')),
  lot_id              UUID REFERENCES pipeline_lots (id) ON DELETE SET NULL,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_farm_visits_profile
  ON farm_visits (farm_profile_id, visited_at DESC);

CREATE INDEX IF NOT EXISTS idx_farm_visits_scout
  ON farm_visits (scout_user_id, visited_at DESC);

-- ——— Cloudinary media (farm or lot) ———

CREATE TABLE IF NOT EXISTS market_media (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_type            TEXT NOT NULL CHECK (owner_type IN ('farm_profile', 'lot')),
  owner_id              UUID NOT NULL,
  cloudinary_public_id  TEXT NOT NULL,
  secure_url            TEXT NOT NULL,
  width                 INTEGER,
  height                INTEGER,
  format                TEXT,
  bytes                 INTEGER,
  caption               TEXT,
  purpose               TEXT NOT NULL DEFAULT 'gallery'
                          CHECK (purpose IN ('cover', 'gallery', 'certification', 'visit')),
  sort_order            INTEGER NOT NULL DEFAULT 0,
  moderation_status     TEXT NOT NULL DEFAULT 'approved'
                          CHECK (moderation_status IN ('pending', 'approved', 'rejected')),
  uploaded_by           UUID REFERENCES users (id) ON DELETE SET NULL,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_market_media_owner
  ON market_media (owner_type, owner_id, sort_order, created_at);

CREATE UNIQUE INDEX IF NOT EXISTS idx_market_media_cover
  ON market_media (owner_type, owner_id)
  WHERE purpose = 'cover' AND moderation_status = 'approved';

CREATE INDEX IF NOT EXISTS idx_market_media_public_id
  ON market_media (cloudinary_public_id);

COMMENT ON TABLE market_media IS
  'Cloudinary metadata only — never store base64. Public APIs return approved rows only.';

-- ——— Privacy-safe marketplace events ———

CREATE TABLE IF NOT EXISTS market_events (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_type        TEXT NOT NULL
                      CHECK (event_type IN (
                        'profile_view', 'listing_view', 'request_started',
                        'request_submitted', 'reservation'
                      )),
  farm_profile_id   UUID REFERENCES farm_profiles (id) ON DELETE SET NULL,
  lot_id            UUID REFERENCES pipeline_lots (id) ON DELETE SET NULL,
  public_ref        TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_market_events_profile
  ON market_events (farm_profile_id, event_type, created_at DESC)
  WHERE farm_profile_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_market_events_lot
  ON market_events (lot_id, event_type, created_at DESC)
  WHERE lot_id IS NOT NULL;

COMMENT ON TABLE market_events IS
  'Farmer-facing performance counters. No buyer PII, IP, or user id.';

-- ——— Lot storefront fields (keep bird columns for backward compatibility) ———

ALTER TABLE pipeline_lots
  ADD COLUMN IF NOT EXISTS product_type TEXT NOT NULL DEFAULT 'broiler_birds',
  ADD COLUMN IF NOT EXISTS visibility_tier TEXT NOT NULL DEFAULT 'brokered_public',
  ADD COLUMN IF NOT EXISTS farm_profile_id UUID REFERENCES farm_profiles (id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS public_title TEXT,
  ADD COLUMN IF NOT EXISTS public_story TEXT,
  ADD COLUMN IF NOT EXISTS processing_notes TEXT;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'pipeline_lots_product_type_chk'
  ) THEN
    ALTER TABLE pipeline_lots
      ADD CONSTRAINT pipeline_lots_product_type_chk
      CHECK (product_type ~ '^[a-z][a-z0-9_]*$');
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'pipeline_lots_visibility_tier_chk'
  ) THEN
    ALTER TABLE pipeline_lots
      ADD CONSTRAINT pipeline_lots_visibility_tier_chk
      CHECK (visibility_tier IN ('brokered_public', 'profile_public', 'verified_buyers'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_pipeline_lots_farm_profile
  ON pipeline_lots (farm_profile_id)
  WHERE farm_profile_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_pipeline_lots_product_type
  ON pipeline_lots (product_type, status);

UPDATE pipeline_lots
   SET visibility_tier = 'brokered_public'
 WHERE visibility_tier IS NULL OR visibility_tier = '';

-- Feature flag (on by default; set to 0 to hide storefronts and force anonymous cards)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'app_settings'
  ) THEN
    INSERT INTO app_settings (setting_key, setting_value)
    VALUES ('marketplace_storefronts', '1')
    ON CONFLICT (setting_key) DO NOTHING;
  END IF;
EXCEPTION
  WHEN undefined_table THEN NULL;
  WHEN others THEN NULL;
END $$;
