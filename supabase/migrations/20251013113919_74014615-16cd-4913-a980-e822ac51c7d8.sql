-- Fix remaining SECURITY DEFINER functions to have SET search_path
-- This addresses the "Function Search Path Mutable" warning

CREATE OR REPLACE FUNCTION public.resolve_current_user_from_session(v_session_id text)
RETURNS bigint
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  uid bigint;
BEGIN
  IF v_session_id IS NULL OR v_session_id = '' THEN
    RETURN get_current_user_from_session();
  END IF;

  SELECT user_id INTO uid
  FROM user_sessions
  WHERE id = v_session_id::uuid
  ORDER BY created_at DESC
  LIMIT 1;

  IF uid IS NOT NULL THEN
    RETURN uid;
  END IF;

  RETURN get_current_user_from_session();
END;
$function$;

CREATE OR REPLACE FUNCTION public.validate_session_security(session_id_param uuid)
RETURNS boolean
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  session_valid BOOLEAN := FALSE;
  session_age INTERVAL := NULL;
BEGIN
  SELECT 
    (is_active = true AND created_at > NOW() - INTERVAL '24 hours'),
    (NOW() - created_at)
  INTO session_valid, session_age
  FROM user_sessions 
  WHERE id = session_id_param;

  RETURN COALESCE(session_valid, FALSE);
END;
$function$;

CREATE OR REPLACE FUNCTION public.hash_password(password_input text)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $function$
BEGIN
  RETURN extensions.crypt(password_input, extensions.gen_salt('bf', 10));
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
  SELECT password INTO current_hash
  FROM permissions
  WHERE id = user_id_input;
  
  IF current_hash IS NULL THEN
    RETURN json_build_object('error', 'Benutzer nicht gefunden');
  END IF;
  
  IF NOT verify_password(old_password, current_hash) THEN
    RETURN json_build_object('error', 'Altes Passwort ist falsch');
  END IF;
  
  UPDATE permissions
  SET 
    password = hash_password(new_password),
    must_change_password = false
  WHERE id = user_id_input;
  
  RETURN json_build_object('success', true);
END;
$function$;

CREATE OR REPLACE FUNCTION public.change_user_password_forced_secure(user_id_input bigint, new_password text)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  UPDATE permissions
  SET 
    password = hash_password(new_password),
    must_change_password = false
  WHERE id = user_id_input;
  
  IF NOT FOUND THEN
    RETURN json_build_object('error', 'Benutzer nicht gefunden');
  END IF;
  
  RETURN json_build_object('success', true);
END;
$function$;

CREATE OR REPLACE FUNCTION public.create_school_user_secure(username_input text, password_input text, full_name_input text, permission_level_input smallint, creator_user_id bigint, keycard_number_input text DEFAULT NULL, keycard_active_input boolean DEFAULT true)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  new_user_id BIGINT;
  creator_permission SMALLINT;
BEGIN
  SELECT permission_lvl INTO creator_permission
  FROM permissions
  WHERE id = creator_user_id;
  
  IF creator_permission IS NULL OR creator_permission < 10 THEN
    RETURN json_build_object('error', 'Keine Berechtigung zum Erstellen von Benutzern');
  END IF;
  
  IF EXISTS (SELECT 1 FROM permissions WHERE username = username_input) THEN
    RETURN json_build_object('error', 'Benutzername bereits vergeben');
  END IF;
  
  IF keycard_number_input IS NOT NULL AND keycard_number_input != '' THEN
    IF EXISTS (SELECT 1 FROM permissions WHERE keycard_number = keycard_number_input) THEN
      RETURN json_build_object('error', 'Keycard-Nummer bereits vergeben');
    END IF;
  END IF;
  
  INSERT INTO permissions (
    username, password, name, permission_lvl, must_change_password,
    keycard_number, keycard_active
  ) VALUES (
    username_input, hash_password(password_input), full_name_input,
    permission_level_input, true,
    CASE WHEN keycard_number_input = '' THEN NULL ELSE keycard_number_input END,
    keycard_active_input
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
  SELECT permission_lvl INTO admin_permission
  FROM permissions
  WHERE id = admin_user_id;
  
  IF admin_permission IS NULL OR admin_permission < 10 THEN
    RETURN json_build_object('error', 'Keine Berechtigung zum Ändern von Passwörtern');
  END IF;
  
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

CREATE OR REPLACE FUNCTION public.log_login_attempt(username_input text, success_input boolean, ip_address_input inet DEFAULT NULL, user_agent_input text DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF username_input IS NULL OR trim(username_input) = '' THEN
    RETURN;
  END IF;

  INSERT INTO login_attempts (username, success, ip_address, user_agent)
  VALUES (username_input, success_input, ip_address_input, user_agent_input);
  
  DELETE FROM login_attempts 
  WHERE attempted_at < NOW() - INTERVAL '24 hours';
END;
$function$;

CREATE OR REPLACE FUNCTION public.create_user_session(user_id_param bigint)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  new_session_id uuid := gen_random_uuid();
  new_token uuid := gen_random_uuid();
  result_id uuid;
BEGIN
  INSERT INTO user_sessions (id, user_id, session_token, is_active, is_primary)
  VALUES (new_session_id, user_id_param, new_token, true, true)
  ON CONFLICT (user_id) DO UPDATE
    SET id = EXCLUDED.id,
        session_token = EXCLUDED.session_token,
        is_active = true,
        is_primary = true,
        updated_at = now()
  RETURNING id INTO result_id;

  UPDATE user_sessions 
  SET is_primary = false 
  WHERE user_id = user_id_param AND id != result_id;

  RETURN result_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.is_custom_user_authenticated()
RETURNS boolean
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  RETURN get_current_user_id() IS NOT NULL;
END;
$function$;

CREATE OR REPLACE FUNCTION public.current_user_owns_resource(resource_user_id bigint)
RETURNS boolean
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  current_user_id bigint;
BEGIN
  current_user_id := get_current_user_from_session();
  RETURN current_user_id = resource_user_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.is_current_user_admin()
RETURNS boolean
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  RETURN public.is_current_user_admin_secure();
END;
$function$;

CREATE OR REPLACE FUNCTION public.get_current_user_id()
RETURNS bigint
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  RETURN (
    SELECT p.id 
    FROM permissions p 
    WHERE p.username = ((current_setting('request.jwt.claims', true))::json ->> 'sub')
    LIMIT 1
  );
END;
$function$;