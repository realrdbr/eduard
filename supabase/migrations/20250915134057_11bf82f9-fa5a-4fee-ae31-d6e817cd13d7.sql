-- Create session management and authentication functions in correct order

-- Function to create a new user session
CREATE OR REPLACE FUNCTION public.create_user_session(user_id_param bigint)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  new_session_id uuid;
BEGIN
  -- Generate new session
  new_session_id := gen_random_uuid();
  
  -- Insert session
  INSERT INTO user_sessions (id, user_id, session_token, is_active, is_primary)
  VALUES (new_session_id, user_id_param, gen_random_uuid(), true, true);
  
  -- Deactivate other sessions for this user to keep single active session
  UPDATE user_sessions 
  SET is_primary = false 
  WHERE user_id = user_id_param AND id != new_session_id;
  
  RETURN new_session_id;
END;
$$;

-- Function to get current user from session token stored in request headers
CREATE OR REPLACE FUNCTION public.get_current_user_from_session()
RETURNS bigint
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  session_id_value text;
  user_id_value bigint;
BEGIN
  -- Try to get session ID from current_setting (will be set by frontend)
  BEGIN
    session_id_value := current_setting('app.current_session_id', true);
  EXCEPTION
    WHEN others THEN
      RETURN NULL;
  END;
  
  IF session_id_value IS NULL OR session_id_value = '' THEN
    RETURN NULL;
  END IF;
  
  -- Get user ID from active session
  SELECT user_id INTO user_id_value
  FROM user_sessions 
  WHERE id = session_id_value::uuid 
    AND is_active = true 
    AND created_at > NOW() - INTERVAL '7 days';
    
  RETURN user_id_value;
END;
$$;

-- Function to check if current session user has permission level
CREATE OR REPLACE FUNCTION public.current_user_has_permission_level(required_level smallint)
RETURNS boolean
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  current_user_id bigint;
  user_level smallint;
BEGIN
  -- Get current user from session
  current_user_id := get_current_user_from_session();
  
  IF current_user_id IS NULL THEN
    RETURN false;
  END IF;
  
  -- Get user's permission level
  SELECT permission_lvl INTO user_level
  FROM permissions 
  WHERE id = current_user_id;
  
  RETURN COALESCE(user_level >= required_level, false);
END;
$$;

-- Function to check if current session user owns a resource by user_id
CREATE OR REPLACE FUNCTION public.current_user_owns_resource(resource_user_id bigint)
RETURNS boolean
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  current_user_id bigint;
BEGIN
  current_user_id := get_current_user_from_session();
  RETURN current_user_id = resource_user_id;
END;
$$;