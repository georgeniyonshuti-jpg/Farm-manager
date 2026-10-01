-- Poultry supply pipeline: opted-in lots, buyer CRM, demand, matches (platform desk).
-- Scout lots are NOT company-tenant data; managed lots link to flocks after opt-in.

CREATE TABLE IF NOT EXISTS pipeline_buyers (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name                  TEXT NOT NULL,
  buyer_type            TEXT NOT NULL DEFAULT 'other'
                          CHECK (buyer_type IN ('butcher', 'restaurant', 'hotel', 'vendor', 'institution', 'other')),
  district              TEXT,
  whatsapp              TEXT,
  phone                 TEXT,
  weekly_birds_min      INTEGER CHECK (weekly_birds_min IS NULL OR weekly_birds_min >= 0),
  weekly_birds_max      INTEGER CHECK (weekly_birds_max IS NULL OR weekly_birds_max >= 0),
  weight_kg_min         NUMERIC(10, 3) CHECK (weight_kg_min IS NULL OR weight_kg_min > 0),
  weight_kg_max         NUMERIC(10, 3) CHECK (weight_kg_max IS NULL OR weight_kg_max > 0),
  prefers_slaughtered   BOOLEAN NOT NULL DEFAULT true,
  collect_or_delivery   TEXT NOT NULL DEFAULT 'either'
                          CHECK (collect_or_delivery IN ('collect', 'delivery', 'either')),
  notice_days           INTEGER NOT NULL DEFAULT 2 CHECK (notice_days >= 0),
  notes                 TEXT,
  active                BOOLEAN NOT NULL DEFAULT true,
  created_by            UUID REFERENCES users (id) ON DELETE SET NULL,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_pipeline_buyers_active ON pipeline_buyers (active);
CREATE INDEX IF NOT EXISTS idx_pipeline_buyers_district ON pipeline_buyers (district);

CREATE TABLE IF NOT EXISTS pipeline_lots (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source                TEXT NOT NULL CHECK (source IN ('managed_flock', 'scout')),
  company_id            UUID REFERENCES companies (id) ON DELETE SET NULL,
  flock_id              UUID REFERENCES poultry_flocks (id) ON DELETE CASCADE,
  farm_label            TEXT,
  contact_phone         TEXT,
  district              TEXT,
  bird_count            INTEGER NOT NULL CHECK (bird_count > 0),
  saleable_birds        INTEGER CHECK (saleable_birds IS NULL OR saleable_birds >= 0),
  breed_code            TEXT,
  avg_weight_kg         NUMERIC(10, 3),
  expected_weight_kg    NUMERIC(10, 3),
  ready_from            DATE NOT NULL,
  ready_to              DATE NOT NULL,
  ask_price_per_kg      NUMERIC(14, 4),
  farmer_can_slaughter  BOOLEAN NOT NULL DEFAULT false,
  delivery_available    BOOLEAN NOT NULL DEFAULT false,
  status                TEXT NOT NULL DEFAULT 'open'
                          CHECK (status IN ('draft', 'open', 'partial', 'matched', 'expired', 'cancelled')),
  scouted_by            UUID REFERENCES users (id) ON DELETE SET NULL,
  vet_visit_log_id      UUID,
  opted_in_at           TIMESTAMPTZ,
  notes                 TEXT,
  created_by            UUID REFERENCES users (id) ON DELETE SET NULL,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT pipeline_lots_managed_flock_chk CHECK (
    (source = 'managed_flock' AND flock_id IS NOT NULL)
    OR (source = 'scout' AND flock_id IS NULL)
  ),
  CONSTRAINT pipeline_lots_ready_window_chk CHECK (ready_to >= ready_from)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_pipeline_lots_open_managed_flock
  ON pipeline_lots (flock_id)
  WHERE source = 'managed_flock' AND status IN ('draft', 'open', 'partial');

CREATE INDEX IF NOT EXISTS idx_pipeline_lots_status ON pipeline_lots (status);
CREATE INDEX IF NOT EXISTS idx_pipeline_lots_ready ON pipeline_lots (ready_from, ready_to);
CREATE INDEX IF NOT EXISTS idx_pipeline_lots_district ON pipeline_lots (district);
CREATE INDEX IF NOT EXISTS idx_pipeline_lots_company ON pipeline_lots (company_id);

CREATE TABLE IF NOT EXISTS pipeline_demands (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  buyer_id              UUID NOT NULL REFERENCES pipeline_buyers (id) ON DELETE RESTRICT,
  birds_needed          INTEGER NOT NULL CHECK (birds_needed > 0),
  weight_kg_min         NUMERIC(10, 3),
  weight_kg_max         NUMERIC(10, 3),
  needed_from           DATE,
  needed_to             DATE,
  district_preference   TEXT,
  slaughtered_required  BOOLEAN NOT NULL DEFAULT true,
  delivery_required     BOOLEAN NOT NULL DEFAULT false,
  status                TEXT NOT NULL DEFAULT 'open'
                          CHECK (status IN ('open', 'partial', 'filled', 'cancelled')),
  channel               TEXT NOT NULL DEFAULT 'whatsapp'
                          CHECK (channel IN ('whatsapp', 'phone', 'other')),
  raw_notes             TEXT,
  created_by            UUID REFERENCES users (id) ON DELETE SET NULL,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_pipeline_demands_status ON pipeline_demands (status);
CREATE INDEX IF NOT EXISTS idx_pipeline_demands_buyer ON pipeline_demands (buyer_id);
CREATE INDEX IF NOT EXISTS idx_pipeline_demands_needed ON pipeline_demands (needed_from, needed_to);

CREATE TABLE IF NOT EXISTS pipeline_matches (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lot_id                  UUID NOT NULL REFERENCES pipeline_lots (id) ON DELETE CASCADE,
  demand_id               UUID REFERENCES pipeline_demands (id) ON DELETE SET NULL,
  buyer_id                UUID NOT NULL REFERENCES pipeline_buyers (id) ON DELETE RESTRICT,
  birds                   INTEGER NOT NULL CHECK (birds > 0),
  agreed_price_per_kg     NUMERIC(14, 4),
  ready_date              DATE,
  status                  TEXT NOT NULL DEFAULT 'committed'
                            CHECK (status IN ('committed', 'delivered', 'failed', 'cancelled')),
  transport_notes         TEXT,
  slaughter_notes         TEXT,
  learning_notes          TEXT,
  sales_order_id          UUID REFERENCES poultry_sales_orders (id) ON DELETE SET NULL,
  commission_vet_user_id  UUID REFERENCES users (id) ON DELETE SET NULL,
  matched_by              UUID REFERENCES users (id) ON DELETE SET NULL,
  created_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_pipeline_matches_lot ON pipeline_matches (lot_id);
CREATE INDEX IF NOT EXISTS idx_pipeline_matches_buyer ON pipeline_matches (buyer_id);
CREATE INDEX IF NOT EXISTS idx_pipeline_matches_status ON pipeline_matches (status);
CREATE INDEX IF NOT EXISTS idx_pipeline_matches_demand ON pipeline_matches (demand_id);

COMMENT ON TABLE pipeline_lots IS 'Opted-in broiler supply cards for the Cleva pipeline desk. Scout lots have no company/billing.';
COMMENT ON TABLE pipeline_buyers IS 'Cleva ops buyer CRM — no buyer login.';
COMMENT ON TABLE pipeline_matches IS 'Manual match commitments; managed lots may bridge to poultry_sales_orders on deliver.';
