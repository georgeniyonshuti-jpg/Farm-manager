CREATE TABLE IF NOT EXISTS audit_events (
  id TEXT PRIMARY KEY,
  at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  actor_id TEXT,
  role TEXT NOT NULL,
  action TEXT NOT NULL,
  resource TEXT NOT NULL,
  resource_id TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_audit_events_at_desc ON audit_events (at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_events_role ON audit_events (role);
CREATE INDEX IF NOT EXISTS idx_audit_events_action ON audit_events (action);
