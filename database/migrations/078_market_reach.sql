-- Anonymous market-link visits. No name, email, phone, or IP.

CREATE TABLE IF NOT EXISTS market_reach (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_type    TEXT NOT NULL
                  CHECK (event_type IN ('opened', 'join_started', 'account_created')),
  source        TEXT NOT NULL,
  visitor_hash  TEXT NOT NULL,
  account_type  TEXT,
  day           DATE NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (visitor_hash, event_type, source, day)
);

CREATE INDEX IF NOT EXISTS idx_market_reach_day
  ON market_reach (day DESC, event_type);

COMMENT ON TABLE market_reach IS
  'One row per visitor, event, source, and Kigali day. Counts link opens without storing who they are.';
