-- Fix remaining functions that still need search_path

CREATE OR REPLACE FUNCTION public.ensure_single_active_theme()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.is_active = true THEN
    -- Deactivate all other themes for this user
    UPDATE user_themes 
    SET is_active = false 
    WHERE user_id = NEW.user_id AND id != NEW.id;
  END IF;
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.update_updated_at_column()
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

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER 
SET search_path TO 'public'
AS $function$
BEGIN
  INSERT INTO public.profiles (user_id, email, full_name, permission_id)
  VALUES (
    NEW.id, 
    NEW.email, 
    NEW.raw_user_meta_data ->> 'full_name',
    (SELECT id FROM public.permissions WHERE permission_lvl = 1 LIMIT 1)
  );
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.cleanup_old_conversations()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  DELETE FROM public.chat_conversations 
  WHERE created_at < NOW() - INTERVAL '7 days';
END;
$function$;

CREATE OR REPLACE FUNCTION public.get_current_user_permission_level()
RETURNS smallint
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  RETURN (
    SELECT perm.permission_lvl
    FROM profiles p
    LEFT JOIN permissions perm ON p.permission_id = perm.id
    WHERE p.user_id = auth.uid()
    LIMIT 1
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.is_current_user_admin()
RETURNS boolean
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  RETURN COALESCE(public.get_current_user_permission_level() >= 10, false);
END;
$function$;

CREATE OR REPLACE FUNCTION public.verify_user_login(username_input text, password_input text)
RETURNS TABLE(user_id bigint, profile_id bigint, permission_level smallint, must_change_password boolean, full_name text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  -- For now, use simple text comparison until we migrate passwords
  RETURN QUERY
  SELECT 
    p.id::bigint as user_id,
    p.id::bigint as profile_id,
    p.permission_lvl,
    p.must_change_password,
    p.name as full_name
  FROM permissions p
  WHERE p.username = username_input 
    AND p.password = password_input;
END;
$function$;

CREATE OR REPLACE FUNCTION public.create_school_user(username_input text, password_input text, full_name_input text, permission_level_input smallint, creator_user_id bigint)
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
  
  -- Create user in permissions table
  INSERT INTO permissions (
    username,
    password,
    name,
    permission_lvl,
    must_change_password
  ) VALUES (
    username_input,
    password_input, -- Store as plain text for now
    full_name_input,
    permission_level_input,
    true
  ) RETURNING id INTO new_user_id;
  
  RETURN json_build_object('success', true, 'user_id', new_user_id);
END;
$function$;

CREATE OR REPLACE FUNCTION public.change_user_password(user_id_input bigint, old_password text, new_password text)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  UPDATE permissions
  SET 
    password = new_password,
    must_change_password = false
  WHERE id = user_id_input;
  
  RETURN json_build_object('success', true);
END;
$function$;