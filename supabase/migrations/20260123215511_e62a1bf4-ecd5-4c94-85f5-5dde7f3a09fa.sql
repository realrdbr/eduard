-- Fix: Use updated_at instead of created_at for session validity check
-- Sessions should remain valid as long as they're being used (updated_at is refreshed)

CREATE OR REPLACE FUNCTION public.get_current_user_from_session()
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  session_id_value text;
  user_id_value bigint;
BEGIN
  BEGIN
    session_id_value := current_setting('app.current_session_id', true);
  EXCEPTION
    WHEN others THEN
      RETURN NULL;
  END;
  
  IF session_id_value IS NULL OR session_id_value = '' THEN
    RETURN NULL;
  END IF;
  
  -- FIXED: Check updated_at instead of created_at
  -- Sessions remain valid as long as they're actively used
  SELECT user_id INTO user_id_value
  FROM user_sessions 
  WHERE id = session_id_value::uuid 
    AND is_active = true 
    AND updated_at > NOW() - INTERVAL '7 days';
    
  RETURN user_id_value;
END;
$$;