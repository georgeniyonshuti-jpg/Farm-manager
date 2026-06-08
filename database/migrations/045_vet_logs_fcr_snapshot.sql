-- Snapshot flock FCR at vet log write time (point-in-time audit, not source of truth).

ALTER TABLE farm_vet_logs
  ADD COLUMN IF NOT EXISTS fcr_at_log_time NUMERIC(8, 4),
  ADD COLUMN IF NOT EXISTS fcr_status TEXT,
  ADD COLUMN IF NOT EXISTS fcr_target_min NUMERIC(6, 3),
  ADD COLUMN IF NOT EXISTS fcr_target_max NUMERIC(6, 3);
