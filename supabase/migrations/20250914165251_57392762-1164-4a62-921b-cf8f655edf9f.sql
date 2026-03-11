-- Add session management for single-device login
BEGIN;

-- Add unique constraint to ensure one active session per user
-- First drop existing sessions to avoid conflicts
DELETE FROM public.user_sessions;

-- Add session token and active status
ALTER TABLE public.user_sessions 
ADD COLUMN IF NOT EXISTS session_token UUID DEFAULT gen_random_uuid(),
ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT true,
ADD COLUMN IF NOT EXISTS device_info TEXT;

-- Create unique constraint for active sessions per user
CREATE UNIQUE INDEX IF NOT EXISTS idx_user_sessions_active_user 
ON public.user_sessions (user_id) 
WHERE is_active = true;

-- Function to invalidate other sessions when user logs in
CREATE OR REPLACE FUNCTION public.invalidate_user_sessions(target_user_id BIGINT, keep_session_id UUID DEFAULT NULL)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Deactivate all sessions for the user except the one to keep
  UPDATE user_sessions 
  SET is_active = false 
  WHERE user_id = target_user_id 
    AND (keep_session_id IS NULL OR id != keep_session_id);
END;
$$;

-- Function to check if session is valid
CREATE OR REPLACE FUNCTION public.is_session_valid(session_id_param UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  session_exists BOOLEAN := FALSE;
BEGIN
  SELECT EXISTS(
    SELECT 1 FROM user_sessions 
    WHERE id = session_id_param 
    AND is_active = true 
    AND created_at > NOW() - INTERVAL '7 days'
  ) INTO session_exists;
  
  RETURN session_exists;
END;
$$;

COMMIT;