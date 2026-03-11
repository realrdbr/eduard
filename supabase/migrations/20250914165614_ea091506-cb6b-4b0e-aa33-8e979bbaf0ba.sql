-- Modify session system for primary/secondary sessions
BEGIN;

-- Remove unique constraint to allow multiple sessions per user
DROP INDEX IF EXISTS idx_user_sessions_active_user;

-- Add primary session tracking
ALTER TABLE public.user_sessions 
ADD COLUMN IF NOT EXISTS is_primary BOOLEAN DEFAULT false;

-- Create unique constraint for primary sessions per user
CREATE UNIQUE INDEX IF NOT EXISTS idx_user_sessions_primary_user 
ON public.user_sessions (user_id) 
WHERE is_primary = true AND is_active = true;

-- Function to set a session as primary (and demote others)
CREATE OR REPLACE FUNCTION public.set_primary_session(target_user_id BIGINT, session_id_param UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Remove primary status from all other sessions for this user
  UPDATE user_sessions 
  SET is_primary = false 
  WHERE user_id = target_user_id 
    AND id != session_id_param;
  
  -- Set the specified session as primary
  UPDATE user_sessions 
  SET is_primary = true 
  WHERE id = session_id_param 
    AND user_id = target_user_id;
END;
$$;

-- Function to check if session has admin rights
CREATE OR REPLACE FUNCTION public.session_has_admin_rights(session_id_param UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  has_rights BOOLEAN := FALSE;
BEGIN
  SELECT EXISTS(
    SELECT 1 FROM user_sessions 
    WHERE id = session_id_param 
    AND is_active = true 
    AND is_primary = true
    AND created_at > NOW() - INTERVAL '7 days'
  ) INTO has_rights;
  
  RETURN has_rights;
END;
$$;

-- Update invalidate function to not remove all sessions
CREATE OR REPLACE FUNCTION public.invalidate_user_sessions(target_user_id BIGINT, keep_session_id UUID DEFAULT NULL)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Only deactivate the session to keep if specified, otherwise do nothing
  -- This allows multiple active sessions per user
  IF keep_session_id IS NOT NULL THEN
    UPDATE user_sessions 
    SET is_active = false 
    WHERE id = keep_session_id;
  END IF;
END;
$$;

COMMIT;