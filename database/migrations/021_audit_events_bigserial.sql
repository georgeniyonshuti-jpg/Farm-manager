-- Idempotent: move audit_events primary key from TEXT to BIGSERIAL (auto-generated).
-- Eliminates manual id collisions; aligns with server inserts that omit id.

DO $$
DECLARE
  col_type TEXT;
BEGIN
  SELECT c.data_type INTO col_type
  FROM information_schema.columns c
  WHERE c.table_schema = 'public'
    AND c.table_name = 'audit_events'
    AND c.column_name = 'id';

  IF col_type IS NULL THEN
    -- Table missing (unusual if 020 not applied); create minimal table for API.
    CREATE TABLE audit_events (
      id BIGSERIAL PRIMARY KEY,
      at TIMESTAMPTZ NOT NULL DEFAULT now(),
      actor_id TEXT NOT NULL,
      role TEXT NOT NULL,
      action TEXT NOT NULL,
      resource TEXT NOT NULL,
      resource_id TEXT,
      metadata JSONB NOT NULL DEFAULT '{}'::jsonb
    );
    CREATE INDEX IF NOT EXISTS idx_audit_at ON audit_events (at DESC);
  ELSIF col_type = 'bigint' THEN
    -- Already migrated; only ensure sequence is aligned.
    NULL;
  ELSE
    DROP TABLE IF EXISTS audit_events__serial_swap;
    CREATE TABLE audit_events__serial_swap (
      id BIGSERIAL PRIMARY KEY,
      at TIMESTAMPTZ NOT NULL DEFAULT now(),
      actor_id TEXT NOT NULL,
      role TEXT NOT NULL,
      action TEXT NOT NULL,
      resource TEXT NOT NULL,
      resource_id TEXT,
      metadata JSONB NOT NULL DEFAULT '{}'::jsonb
    );
    INSERT INTO audit_events__serial_swap (at, actor_id, role, action, resource, resource_id, metadata)
    SELECT at, actor_id, role, action, resource, resource_id, metadata
    FROM audit_events;
    DROP TABLE audit_events;
    ALTER TABLE audit_events__serial_swap RENAME TO audit_events;
    CREATE INDEX IF NOT EXISTS idx_audit_at ON audit_events (at DESC);
  END IF;
END $$;

-- Align sequence: empty table → next id 1; else next id = MAX(id)+1.
SELECT setval(
  pg_get_serial_sequence('audit_events', 'id'),
  COALESCE((SELECT MAX(id) FROM audit_events), 1),
  (SELECT MAX(id) FROM audit_events) IS NOT NULL
);
