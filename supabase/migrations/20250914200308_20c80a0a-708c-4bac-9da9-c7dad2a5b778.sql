-- Add missing session management and logging functions
CREATE OR REPLACE FUNCTION public.log_login_attempt(username_input text, success_input boolean, ip_address_input inet DEFAULT NULL, user_agent_input text DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  INSERT INTO login_attempts (username, success, ip_address, user_agent)
  VALUES (username_input, success_input, ip_address_input, user_agent_input);
  
  -- Clean up old attempts (older than 24 hours)
  DELETE FROM login_attempts 
  WHERE attempted_at < NOW() - INTERVAL '24 hours';
END;
$function$;

-- Create session token rotation function
CREATE OR REPLACE FUNCTION public.rotate_session_token(old_session_token uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  new_token UUID := gen_random_uuid();
  user_id_result BIGINT;
BEGIN
  -- Get user_id from old session
  SELECT user_id INTO user_id_result
  FROM user_sessions 
  WHERE session_token = old_session_token 
    AND is_active = true;
  
  IF user_id_result IS NULL THEN
    RETURN NULL;
  END IF;
  
  -- Deactivate old session
  UPDATE user_sessions 
  SET is_active = false 
  WHERE session_token = old_session_token;
  
  -- Create new session
  INSERT INTO user_sessions (user_id, session_token, is_active, is_primary)
  VALUES (user_id_result, new_token, true, true);
  
  -- Remove primary flag from other sessions
  UPDATE user_sessions 
  SET is_primary = false 
  WHERE user_id = user_id_result 
    AND session_token != new_token;
  
  RETURN new_token;
END;
$function$;

-- Update the secure login function with brute force protection
CREATE OR REPLACE FUNCTION public.verify_user_login_secure(username_input text, password_input text, ip_address_input inet DEFAULT NULL, user_agent_input text DEFAULT NULL)
RETURNS TABLE(user_id bigint, profile_id bigint, permission_level smallint, must_change_password boolean, full_name text, error_message text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  user_record RECORD;
  is_allowed BOOLEAN;
BEGIN
  -- Check brute force protection
  SELECT check_brute_force_protection(username_input, ip_address_input) INTO is_allowed;
  
  IF NOT is_allowed THEN
    -- Log failed attempt due to rate limiting
    PERFORM log_login_attempt(username_input, false, ip_address_input, user_agent_input);
    
    RETURN QUERY SELECT 
      NULL::bigint, NULL::bigint, NULL::smallint, NULL::boolean, NULL::text, 
      'Zu viele fehlgeschlagene Anmeldeversuche. Versuchen Sie es in 15 Minuten erneut.'::text;
    RETURN;
  END IF;
  
  -- Try to find and verify user
  SELECT p.id, p.permission_lvl, p.must_change_password, p.name, p.password
  INTO user_record
  FROM permissions p
  WHERE p.username = username_input;
  
  -- Check if user exists and password is correct
  IF user_record IS NULL OR NOT verify_password(password_input, user_record.password) THEN
    -- Log failed attempt
    PERFORM log_login_attempt(username_input, false, ip_address_input, user_agent_input);
    
    RETURN QUERY SELECT 
      NULL::bigint, NULL::bigint, NULL::smallint, NULL::boolean, NULL::text,
      'Ungültiger Benutzername oder Passwort.'::text;
    RETURN;
  END IF;
  
  -- Log successful attempt
  PERFORM log_login_attempt(username_input, true, ip_address_input, user_agent_input);
  
  -- Return user data
  RETURN QUERY SELECT 
    user_record.id::bigint,
    user_record.id::bigint,
    user_record.permission_lvl,
    user_record.must_change_password,
    user_record.name,
    NULL::text;
END;
$function$;