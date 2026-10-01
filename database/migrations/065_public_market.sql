-- Public market: human lot refs + guest lead capture.

ALTER TABLE pipeline_lots
  ADD COLUMN IF NOT EXISTS public_ref TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS idx_pipeline_lots_public_ref
  ON pipeline_lots (public_ref)
  WHERE public_ref IS NOT NULL;

-- Generate LOT-XXXXXX codes for existing rows
DO $$
DECLARE
  r RECORD;
  code TEXT;
  n INT := 0;
BEGIN
  FOR r IN
    SELECT id FROM pipeline_lots WHERE public_ref IS NULL ORDER BY created_at
  LOOP
    LOOP
      n := n + 1;
      code := 'LOT-' || upper(substr(md5(r.id::text || n::text || clock_timestamp()::text), 1, 6));
      EXIT WHEN NOT EXISTS (SELECT 1 FROM pipeline_lots WHERE public_ref = code);
    END LOOP;
    UPDATE pipeline_lots SET public_ref = code WHERE id = r.id;
  END LOOP;
END $$;

CREATE OR REPLACE FUNCTION pipeline_lots_ensure_public_ref()
RETURNS TRIGGER AS $$
DECLARE
  code TEXT;
  n INT := 0;
BEGIN
  IF NEW.public_ref IS NULL OR btrim(NEW.public_ref) = '' THEN
    LOOP
      n := n + 1;
      code := 'LOT-' || upper(substr(md5(COALESCE(NEW.id::text, gen_random_uuid()::text) || n::text || clock_timestamp()::text), 1, 6));
      EXIT WHEN NOT EXISTS (SELECT 1 FROM pipeline_lots WHERE public_ref = code AND id IS DISTINCT FROM NEW.id);
    END LOOP;
    NEW.public_ref := code;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_pipeline_lots_public_ref ON pipeline_lots;
CREATE TRIGGER trg_pipeline_lots_public_ref
  BEFORE INSERT OR UPDATE ON pipeline_lots
  FOR EACH ROW
  EXECUTE PROCEDURE pipeline_lots_ensure_public_ref();

CREATE TABLE IF NOT EXISTS market_leads (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lot_id          UUID REFERENCES pipeline_lots (id) ON DELETE SET NULL,
  contact_name    TEXT NOT NULL,
  phone           TEXT NOT NULL,
  business_name   TEXT,
  buyer_type      TEXT,
  district        TEXT,
  birds           INTEGER CHECK (birds IS NULL OR birds > 0),
  needed_from     DATE,
  message         TEXT,
  source          TEXT NOT NULL DEFAULT 'public_market',
  status          TEXT NOT NULL DEFAULT 'new'
                    CHECK (status IN ('new', 'contacted', 'converted', 'spam', 'closed')),
  assigned_to     UUID REFERENCES users (id) ON DELETE SET NULL,
  buyer_id        UUID REFERENCES pipeline_buyers (id) ON DELETE SET NULL,
  ops_notes       TEXT,
  ip_hash         TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_market_leads_status_created
  ON market_leads (status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_market_leads_lot
  ON market_leads (lot_id)
  WHERE lot_id IS NOT NULL;

COMMENT ON TABLE market_leads IS
  'Guest public-market requests; ops promotes to pipeline_buyers + pipeline_demands.';

COMMENT ON COLUMN pipeline_lots.public_ref IS
  'Human-readable listing code for public market / WhatsApp follow-up (e.g. LOT-7F3K2A).';
