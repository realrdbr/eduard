-- Fix pgcrypto extension and password hashing
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Recreate hash_password function with proper salt generation
CREATE OR REPLACE FUNCTION public.hash_password(password_input text)
RETURNS text AS $$
BEGIN
  RETURN crypt(password_input, gen_salt('bf'));
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Create secure user creation function
CREATE OR REPLACE FUNCTION public.create_school_user_secure(username_input text, password_input text, full_name_input text, permission_level_input smallint, creator_user_id bigint)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
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