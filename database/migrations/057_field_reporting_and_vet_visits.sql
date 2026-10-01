-- Field reporting modes + scheduled vet visits (junior vet single workflow)

ALTER TABLE companies
  ADD COLUMN IF NOT EXISTS field_reporting_mode TEXT NOT NULL DEFAULT 'vet_only';

ALTER TABLE companies DROP CONSTRAINT IF EXISTS companies_field_reporting_mode_check;
ALTER TABLE companies
  ADD CONSTRAINT companies_field_reporting_mode_check
  CHECK (field_reporting_mode IN ('laborer_rounds', 'vet_only', 'both'));

COMMENT ON COLUMN companies.field_reporting_mode IS 'laborer_rounds | vet_only | both — who submits house-round data.';

ALTER TABLE log_schedule
  ADD COLUMN IF NOT EXISTS log_type TEXT NOT NULL DEFAULT 'check_in';

ALTER TABLE log_schedule DROP CONSTRAINT IF EXISTS log_schedule_log_type_check;
ALTER TABLE log_schedule
  ADD CONSTRAINT log_schedule_log_type_check
  CHECK (log_type IN ('check_in', 'vet_visit'));

COMMENT ON COLUMN log_schedule.log_type IS 'check_in = laborer rounds; vet_visit = scheduled vet house visits.';

ALTER TABLE farm_vet_logs
  ADD COLUMN IF NOT EXISTS visit_slot TEXT,
  ADD COLUMN IF NOT EXISTS visited_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS coop_temperature_c NUMERIC,
  ADD COLUMN IF NOT EXISTS feed_available BOOLEAN,
  ADD COLUMN IF NOT EXISTS water_available BOOLEAN,
  ADD COLUMN IF NOT EXISTS photo_urls JSONB;

ALTER TABLE farm_vet_logs DROP CONSTRAINT IF EXISTS farm_vet_logs_visit_slot_check;
ALTER TABLE farm_vet_logs
  ADD CONSTRAINT farm_vet_logs_visit_slot_check
  CHECK (visit_slot IS NULL OR visit_slot IN ('am', 'pm', 'spot'));

-- Allow two visits per day (AM + PM)
ALTER TABLE farm_vet_logs DROP CONSTRAINT IF EXISTS farm_vet_logs_flock_id_log_date_author_user_id_key;
CREATE UNIQUE INDEX IF NOT EXISTS idx_farm_vet_logs_flock_date_author_slot
  ON farm_vet_logs (flock_id, log_date, author_user_id, COALESCE(visit_slot, 'spot'));

INSERT INTO app_settings (setting_key, setting_value)
VALUES
  ('field_payroll_vet_visit_rwf', '500'),
  ('field_payroll_missed_vet_visit_rwf', '500'),
  ('field_payroll_late_vet_visit_deduction_rwf', '200')
ON CONFLICT (setting_key) DO NOTHING;

-- Default AM/PM vet visit windows for active flocks (role vet)
INSERT INTO log_schedule (flock_id, role, log_type, interval_hours, window_open, window_close)
SELECT f.id, 'vet', 'vet_visit', 12, '07:00'::time, '10:00'::time
  FROM poultry_flocks f
 WHERE f.status = 'active'
   AND NOT EXISTS (
     SELECT 1 FROM log_schedule ls
      WHERE ls.flock_id = f.id AND ls.role = 'vet' AND ls.log_type = 'vet_visit'
        AND ls.window_open = '07:00'::time
   );

INSERT INTO log_schedule (flock_id, role, log_type, interval_hours, window_open, window_close)
SELECT f.id, 'vet', 'vet_visit', 12, '17:00'::time, '20:00'::time
  FROM poultry_flocks f
 WHERE f.status = 'active'
   AND NOT EXISTS (
     SELECT 1 FROM log_schedule ls
      WHERE ls.flock_id = f.id AND ls.role = 'vet' AND ls.log_type = 'vet_visit'
        AND ls.window_open = '17:00'::time
   );
