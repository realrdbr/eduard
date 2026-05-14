-- Fix login lockout behavior and normalize username handling in secure login RPC
CREATE OR REPLACE FUNCTION public.verify_user_login_secure(
  username_input text,
  password_input text,
  ip_address_input inet DEFAULT NULL::inet,
  user_agent_input text DEFAULT NULL::text
)
RETURNS TABLE(
  user_id bigint,
  profile_id bigint,
  permission_level smallint,
  must_change_password boolean,
  full_name text,
  error_message text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  user_record RECORD;
  is_allowed BOOLEAN;
  normalized_username text;
BEGIN
  normalized_username := lower(trim(coalesce(username_input, '')));

  IF normalized_username = '' THEN
    RETURN QUERY SELECT
      NULL::bigint, NULL::bigint, NULL::smallint, NULL::boolean, NULL::text,
      'Ungültiger Benutzername oder Passwort.'::text;
    RETURN;
  END IF;

  SELECT check_brute_force_protection(normalized_username, ip_address_input) INTO is_allowed;

  IF NOT is_allowed THEN
    -- Do not log blocked attempts as normal failed logins, otherwise lockout extends forever while retrying.
    RETURN QUERY SELECT
      NULL::bigint, NULL::bigint, NULL::smallint, NULL::boolean, NULL::text,
      'Zu viele fehlgeschlagene Anmeldeversuche. Versuchen Sie es in 15 Minuten erneut.'::text;
    RETURN;
  END IF;

  IF coalesce(password_input, '') = '' THEN
    PERFORM log_login_attempt(normalized_username, false, ip_address_input, user_agent_input);
    RETURN QUERY SELECT
      NULL::bigint, NULL::bigint, NULL::smallint, NULL::boolean, NULL::text,
      'Ungültiger Benutzername oder Passwort.'::text;
    RETURN;
  END IF;

  SELECT p.id, p.permission_lvl, p.must_change_password, p.name, p.password
  INTO user_record
  FROM permissions p
  WHERE lower(p.username) = normalized_username
  LIMIT 1;

  IF user_record IS NULL OR NOT COALESCE(verify_password(password_input, user_record.password), false) THEN
    PERFORM log_login_attempt(normalized_username, false, ip_address_input, user_agent_input);

    RETURN QUERY SELECT
      NULL::bigint, NULL::bigint, NULL::smallint, NULL::boolean, NULL::text,
      'Ungültiger Benutzername oder Passwort.'::text;
    RETURN;
  END IF;

  PERFORM log_login_attempt(normalized_username, true, ip_address_input, user_agent_input);

  RETURN QUERY SELECT
    user_record.id::bigint,
    user_record.id::bigint,
    user_record.permission_lvl,
    COALESCE(user_record.must_change_password, false),
    user_record.name,
    NULL::text;
END;
$function$;
