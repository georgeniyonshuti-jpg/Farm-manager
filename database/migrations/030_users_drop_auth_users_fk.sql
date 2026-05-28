-- App uses server-side session auth; new users are created via API and stored in
-- public.users only. They must not require a matching row in auth.users.
DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT c.conname
    FROM pg_constraint c
    JOIN pg_class t ON c.conrelid = t.oid
    JOIN pg_namespace n ON t.relnamespace = n.oid
    WHERE t.relname = 'users'
      AND n.nspname = 'public'
      AND c.contype = 'f'
      AND pg_get_constraintdef(c.oid) LIKE '%auth.users%'
  LOOP
    EXECUTE format('ALTER TABLE public.users DROP CONSTRAINT %I', r.conname);
  END LOOP;
END $$;
