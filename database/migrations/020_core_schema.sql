CREATE TABLE IF NOT EXISTS flocks (
  id TEXT PRIMARY KEY,
  label TEXT NOT NULL,
  breed TEXT NOT NULL DEFAULT '',
  placement_date DATE NOT NULL,
  target_market_date DATE,
  initial_count INTEGER NOT NULL CHECK (initial_count >= 0),
  current_count INTEGER NOT NULL CHECK (current_count >= 0),
  status TEXT NOT NULL DEFAULT 'active',
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS mortality_events (
  id TEXT PRIMARY KEY,
  flock_id TEXT NOT NULL REFERENCES flocks(id) ON DELETE CASCADE,
  at TIMESTAMPTZ NOT NULL DEFAULT now(),
  count INTEGER NOT NULL CHECK (count > 0),
  is_emergency BOOLEAN NOT NULL DEFAULT false,
  notes TEXT NOT NULL DEFAULT '',
  entered_by_user_id TEXT NOT NULL,
  linked_checkin_id TEXT
);
CREATE INDEX IF NOT EXISTS idx_mortality_events_flock_at ON mortality_events (flock_id, at DESC);

CREATE TABLE IF NOT EXISTS check_ins (
  id TEXT PRIMARY KEY,
  flock_id TEXT NOT NULL REFERENCES flocks(id) ON DELETE CASCADE,
  at TIMESTAMPTZ NOT NULL DEFAULT now(),
  feed_kg NUMERIC(14,3) NOT NULL DEFAULT 0 CHECK (feed_kg >= 0),
  water_l NUMERIC(14,3) NOT NULL DEFAULT 0 CHECK (water_l >= 0),
  notes TEXT NOT NULL DEFAULT '',
  mortality_at_checkin INTEGER NOT NULL DEFAULT 0 CHECK (mortality_at_checkin >= 0),
  photo_url TEXT,
  entered_by_user_id TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_checkins_flock_at ON check_ins (flock_id, at DESC);

CREATE TABLE IF NOT EXISTS daily_logs (
  id TEXT PRIMARY KEY,
  flock_id TEXT NOT NULL REFERENCES flocks(id) ON DELETE CASCADE,
  log_date DATE NOT NULL,
  feed_kg NUMERIC(14,3) NOT NULL DEFAULT 0 CHECK (feed_kg >= 0),
  water_l NUMERIC(14,3) NOT NULL DEFAULT 0 CHECK (water_l >= 0),
  notes TEXT NOT NULL DEFAULT '',
  entered_by_user_id TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_daily_logs_flock_day ON daily_logs (flock_id, log_date DESC);

CREATE TABLE IF NOT EXISTS feed_inventory (
  flock_id TEXT PRIMARY KEY REFERENCES flocks(id) ON DELETE CASCADE,
  balance_kg NUMERIC(14,3) NOT NULL DEFAULT 0 CHECK (balance_kg >= 0),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS feed_transactions (
  id TEXT PRIMARY KEY,
  flock_id TEXT NOT NULL REFERENCES flocks(id) ON DELETE CASCADE,
  at TIMESTAMPTZ NOT NULL DEFAULT now(),
  type TEXT NOT NULL CHECK (type IN ('procurement_receipt', 'feed_consumption', 'adjustment')),
  quantity_kg NUMERIC(14,3) NOT NULL CHECK (quantity_kg >= 0),
  delta_kg NUMERIC(14,3) NOT NULL,
  reason_code TEXT NOT NULL DEFAULT 'other',
  reference TEXT NOT NULL DEFAULT '',
  entered_by_user_id TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_feed_tx_flock_at ON feed_transactions (flock_id, at DESC);

CREATE TABLE IF NOT EXISTS medicine_inventory (
  id TEXT PRIMARY KEY,
  flock_id TEXT NOT NULL REFERENCES flocks(id) ON DELETE CASCADE,
  medicine_name TEXT NOT NULL,
  balance_qty NUMERIC(14,3) NOT NULL DEFAULT 0 CHECK (balance_qty >= 0),
  unit TEXT NOT NULL DEFAULT 'ml',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (flock_id, medicine_name, unit)
);

CREATE TABLE IF NOT EXISTS treatments (
  id TEXT PRIMARY KEY,
  flock_id TEXT NOT NULL REFERENCES flocks(id) ON DELETE CASCADE,
  at TIMESTAMPTZ NOT NULL DEFAULT now(),
  medicine_name TEXT NOT NULL,
  dose NUMERIC(14,4) NOT NULL CHECK (dose > 0),
  dose_unit TEXT NOT NULL,
  route TEXT NOT NULL,
  duration_days INTEGER NOT NULL DEFAULT 1 CHECK (duration_days > 0),
  withdrawal_days INTEGER NOT NULL DEFAULT 0 CHECK (withdrawal_days >= 0),
  reason_code TEXT NOT NULL DEFAULT 'other',
  notes TEXT NOT NULL DEFAULT '',
  entered_by_user_id TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_treatments_flock_at ON treatments (flock_id, at DESC);

CREATE TABLE IF NOT EXISTS slaughter_records (
  id TEXT PRIMARY KEY,
  flock_id TEXT NOT NULL REFERENCES flocks(id) ON DELETE CASCADE,
  at TIMESTAMPTZ NOT NULL DEFAULT now(),
  birds_slaughtered INTEGER NOT NULL CHECK (birds_slaughtered > 0),
  avg_live_weight_kg NUMERIC(12,3) NOT NULL CHECK (avg_live_weight_kg > 0),
  avg_carcass_weight_kg NUMERIC(12,3),
  reason_code TEXT NOT NULL DEFAULT 'planned_market',
  notes TEXT NOT NULL DEFAULT '',
  entered_by_user_id TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_slaughter_flock_at ON slaughter_records (flock_id, at DESC);

CREATE TABLE IF NOT EXISTS check_in_schedules (
  flock_id TEXT PRIMARY KEY REFERENCES flocks(id) ON DELETE CASCADE,
  interval_hours INTEGER NOT NULL DEFAULT 6 CHECK (interval_hours > 0),
  photos_required_per_round INTEGER NOT NULL DEFAULT 1 CHECK (photos_required_per_round BETWEEN 1 AND 5),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS app_users (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  display_name TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL,
  business_unit_access TEXT NOT NULL DEFAULT 'farm',
  can_view_sensitive_financial BOOLEAN NOT NULL DEFAULT false,
  department_keys JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS app_sessions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_app_sessions_user ON app_sessions (user_id);

CREATE TABLE IF NOT EXISTS audit_events (
  id TEXT PRIMARY KEY,
  at TIMESTAMPTZ NOT NULL DEFAULT now(),
  actor_id TEXT NOT NULL,
  role TEXT NOT NULL,
  action TEXT NOT NULL,
  resource TEXT NOT NULL,
  resource_id TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb
);
CREATE INDEX IF NOT EXISTS idx_audit_at ON audit_events (at DESC);
