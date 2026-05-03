-- Durable outbox for Odoo sync events.
-- All accounting pushes are enqueued here first; a worker processes them.
-- Idempotency is enforced via (source_table, source_id) unique index.

CREATE TABLE IF NOT EXISTS odoo_sync_outbox (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Source record identity (unique per farm record to prevent duplicate Odoo docs)
  source_table TEXT NOT NULL,             -- e.g. 'farm_inventory_transactions', 'flock_slaughter_events'
  source_id TEXT NOT NULL,               -- PK of the source record
  event_type TEXT NOT NULL,              -- matches accounting_event_configs.event_type

  -- Payload snapshot captured at enqueue time (used for retry without re-reading DB)
  payload JSONB NOT NULL DEFAULT '{}',

  -- Lifecycle
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'processing', 'sent', 'failed', 'cancelled')),
  attempts INTEGER NOT NULL DEFAULT 0,
  last_attempted_at TIMESTAMPTZ,
  last_error TEXT,
  next_retry_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- Odoo result (populated on success)
  odoo_move_id INTEGER,
  odoo_move_name TEXT,
  odoo_move_state TEXT,

  -- Who triggered this
  triggered_by_user_id TEXT,
  triggered_by_role TEXT,

  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  UNIQUE (source_table, source_id)
);

CREATE INDEX IF NOT EXISTS idx_odoo_outbox_status_retry
  ON odoo_sync_outbox (status, next_retry_at)
  WHERE status IN ('pending', 'failed');

CREATE INDEX IF NOT EXISTS idx_odoo_outbox_source
  ON odoo_sync_outbox (source_table, source_id);

COMMENT ON TABLE odoo_sync_outbox IS
  'Durable outbox for Odoo sync. Each farm event gets at most one outbox row (unique source). Worker retries with backoff.';

-- Link table records the Odoo document reference back against each source record.
-- Kept separate so source tables stay clean and the join is explicit.
CREATE TABLE IF NOT EXISTS odoo_sync_links (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_table TEXT NOT NULL,
  source_id TEXT NOT NULL,
  odoo_move_id INTEGER NOT NULL,
  odoo_move_name TEXT,
  odoo_move_type TEXT,
  odoo_move_state TEXT,
  synced_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (source_table, source_id)
);

CREATE INDEX IF NOT EXISTS idx_odoo_sync_links_source
  ON odoo_sync_links (source_table, source_id);

COMMENT ON TABLE odoo_sync_links IS
  'Successful Odoo sync results linked back to source farm records for reconciliation.';
