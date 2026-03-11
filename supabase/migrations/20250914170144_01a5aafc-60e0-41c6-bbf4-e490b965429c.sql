BEGIN;
-- Allow multiple concurrent sessions per user: drop unique constraint on user_id
ALTER TABLE public.user_sessions DROP CONSTRAINT IF EXISTS user_sessions_user_id_key;
COMMIT;