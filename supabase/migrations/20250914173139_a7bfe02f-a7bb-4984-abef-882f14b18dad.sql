-- Add unique constraints to support reliable upserts for permissions
BEGIN;

-- Ensure unique pair for user_permissions
DO $$ BEGIN
  ALTER TABLE public.user_permissions
  ADD CONSTRAINT user_permissions_unique UNIQUE (user_id, permission_id);
EXCEPTION WHEN duplicate_table THEN
  -- constraint exists
  NULL;
END $$;

-- Ensure unique pair for level_permissions
DO $$ BEGIN
  ALTER TABLE public.level_permissions
  ADD CONSTRAINT level_permissions_unique UNIQUE (level, permission_id);
EXCEPTION WHEN duplicate_table THEN
  -- constraint exists
  NULL;
END $$;

COMMIT;