-- Persist failed flock creation lifecycle so deploys/restarts are safe.

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_type t
    JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE t.typname = 'poultry_flock_status'
  ) THEN
    IF NOT EXISTS (
      SELECT 1
      FROM pg_enum e
      JOIN pg_type t ON t.oid = e.enumtypid
      WHERE t.typname = 'poultry_flock_status'
        AND e.enumlabel = 'failed'
    ) THEN
      ALTER TYPE poultry_flock_status ADD VALUE 'failed';
    END IF;
  END IF;
END $$;

ALTER TABLE poultry_flocks
  ADD COLUMN IF NOT EXISTS failed_reason TEXT,
  ADD COLUMN IF NOT EXISTS failed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS create_draft JSONB;

CREATE INDEX IF NOT EXISTS idx_poultry_flocks_failed_at
  ON poultry_flocks (failed_at)
  WHERE failed_at IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_poultry_flocks_failed_status
  ON poultry_flocks (status);
