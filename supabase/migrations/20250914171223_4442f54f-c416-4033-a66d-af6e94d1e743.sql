-- Add function to release primary session and auto-assign to next device
BEGIN;

-- Function to release primary session for a user
CREATE OR REPLACE FUNCTION public.release_primary_session(target_user_id BIGINT)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Remove primary status from all sessions for this user
  UPDATE user_sessions 
  SET is_primary = false 
  WHERE user_id = target_user_id 
    AND is_active = true;
END;
$$;

-- Function to auto-assign primary session to next available device
CREATE OR REPLACE FUNCTION public.auto_assign_primary_session(target_user_id BIGINT)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  next_session_id UUID;
BEGIN
  -- Find the most recent active session that isn't primary yet
  SELECT id INTO next_session_id
  FROM user_sessions 
  WHERE user_id = target_user_id 
    AND is_active = true 
    AND is_primary = false
  ORDER BY created_at DESC
  LIMIT 1;
  
  -- If we found a session, make it primary
  IF next_session_id IS NOT NULL THEN
    UPDATE user_sessions 
    SET is_primary = true 
    WHERE id = next_session_id;
  END IF;
  
  RETURN next_session_id;
END;
$$;

-- Function to check if user has any active sessions
CREATE OR REPLACE FUNCTION public.has_active_sessions(target_user_id BIGINT)
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN EXISTS(
    SELECT 1 FROM user_sessions 
    WHERE user_id = target_user_id 
    AND is_active = true
  );
END;
$$;

COMMIT;