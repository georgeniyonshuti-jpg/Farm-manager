-- Ensure archive operations and sync queries can use status = 'archived' (matches server behavior).
-- Idempotent: safe if label already exists (e.g. after manual fix or re-run).

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
        AND e.enumlabel = 'archived'
    ) THEN
      ALTER TYPE poultry_flock_status ADD VALUE 'archived';
    END IF;
  END IF;
END $$;
