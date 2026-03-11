-- Fix remaining functions without proper search_path

CREATE OR REPLACE FUNCTION public.update_session_timestamp()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.is_session_valid(session_id_param uuid)
RETURNS boolean
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
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
$function$;

CREATE OR REPLACE FUNCTION public.invalidate_user_sessions(target_user_id bigint, keep_session_id uuid DEFAULT NULL::uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  -- Only deactivate the session to keep if specified, otherwise do nothing
  -- This allows multiple active sessions per user
  IF keep_session_id IS NOT NULL THEN
    UPDATE user_sessions 
    SET is_active = false 
    WHERE id = keep_session_id;
  END IF;
END;
$function$;

CREATE OR REPLACE FUNCTION public.set_primary_session(target_user_id bigint, session_id_param uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
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
$function$;

CREATE OR REPLACE FUNCTION public.session_has_admin_rights(session_id_param uuid)
RETURNS boolean
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
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
$function$;

CREATE OR REPLACE FUNCTION public.release_primary_session(target_user_id bigint)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  -- Remove primary status from all sessions for this user
  UPDATE user_sessions 
  SET is_primary = false 
  WHERE user_id = target_user_id 
    AND is_active = true;
END;
$function$;

CREATE OR REPLACE FUNCTION public.auto_assign_primary_session(target_user_id bigint)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
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
$function$;

CREATE OR REPLACE FUNCTION public.has_active_sessions(target_user_id bigint)
RETURNS boolean
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  RETURN EXISTS(
    SELECT 1 FROM user_sessions 
    WHERE user_id = target_user_id 
    AND is_active = true
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.hash_password(password_input text)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  RETURN extensions.crypt(password_input, extensions.gen_salt('bf', 10));
END;
$function$;

CREATE OR REPLACE FUNCTION public.verify_password(password_input text, password_hash text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  RETURN password_hash = extensions.crypt(password_input, password_hash);
END;
$function$;

CREATE OR REPLACE FUNCTION public.change_user_password_secure(user_id_input bigint, old_password text, new_password text)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  current_hash text;
BEGIN
  -- Verify old password
  SELECT password INTO current_hash
  FROM permissions
  WHERE id = user_id_input;
  
  IF current_hash IS NULL THEN
    RETURN json_build_object('error', 'Benutzer nicht gefunden');
  END IF;
  
  IF NOT verify_password(old_password, current_hash) THEN
    RETURN json_build_object('error', 'Altes Passwort ist falsch');
  END IF;
  
  -- Update with new hashed password
  UPDATE permissions
  SET 
    password = hash_password(new_password),
    must_change_password = false
  WHERE id = user_id_input;
  
  RETURN json_build_object('success', true);
END;
$function$;

CREATE OR REPLACE FUNCTION public.create_school_user_secure(username_input text, password_input text, full_name_input text, permission_level_input smallint, creator_user_id bigint)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  new_user_id BIGINT;
  creator_permission SMALLINT;
BEGIN
  -- Check if creator has permission level 10 (Schulleitung)
  SELECT permission_lvl INTO creator_permission
  FROM permissions
  WHERE id = creator_user_id;
  
  IF creator_permission IS NULL OR creator_permission < 10 THEN
    RETURN json_build_object('error', 'Keine Berechtigung zum Erstellen von Benutzern');
  END IF;
  
  -- Check if username already exists
  IF EXISTS (SELECT 1 FROM permissions WHERE username = username_input) THEN
    RETURN json_build_object('error', 'Benutzername bereits vergeben');
  END IF;
  
  -- Create user with hashed password
  INSERT INTO permissions (
    username,
    password,
    name,
    permission_lvl,
    must_change_password
  ) VALUES (
    username_input,
    hash_password(password_input),
    full_name_input,
    permission_level_input,
    true
  ) RETURNING id INTO new_user_id;
  
  RETURN json_build_object('success', true, 'user_id', new_user_id);
END;
$function$;

CREATE OR REPLACE FUNCTION public.admin_change_user_password(admin_user_id bigint, target_user_id bigint, new_password text)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  admin_permission SMALLINT;
BEGIN
  -- Check if admin has permission level 10
  SELECT permission_lvl INTO admin_permission
  FROM permissions
  WHERE id = admin_user_id;
  
  IF admin_permission IS NULL OR admin_permission < 10 THEN
    RETURN json_build_object('error', 'Keine Berechtigung zum Ändern von Passwörtern');
  END IF;
  
  -- Update target user password with hash
  UPDATE permissions
  SET 
    password = hash_password(new_password),
    must_change_password = false
  WHERE id = target_user_id;
  
  IF NOT FOUND THEN
    RETURN json_build_object('error', 'Benutzer nicht gefunden');
  END IF;
  
  RETURN json_build_object('success', true);
END;
$function$;

CREATE OR REPLACE FUNCTION public.check_brute_force_protection(username_input text, ip_address_input inet DEFAULT NULL::inet)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  failed_attempts INTEGER := 0;
  last_attempt TIMESTAMP WITH TIME ZONE;
BEGIN
  -- Count failed attempts in last 15 minutes
  SELECT COUNT(*), MAX(attempted_at) INTO failed_attempts, last_attempt
  FROM login_attempts 
  WHERE username = username_input 
    AND success = false 
    AND attempted_at > NOW() - INTERVAL '15 minutes';
  
  -- If more than 5 failed attempts in 15 minutes, block
  IF failed_attempts >= 5 THEN
    -- If last attempt was less than 15 minutes ago, still blocked
    IF last_attempt > NOW() - INTERVAL '15 minutes' THEN
      RETURN FALSE;
    END IF;
  END IF;
  
  RETURN TRUE;
END;
$function$;

CREATE OR REPLACE FUNCTION public.log_login_attempt(username_input text, success_input boolean, ip_address_input inet DEFAULT NULL::inet, user_agent_input text DEFAULT NULL::text)
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

CREATE OR REPLACE FUNCTION public.verify_user_login_secure(username_input text, password_input text, ip_address_input inet DEFAULT NULL::inet, user_agent_input text DEFAULT NULL::text)
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