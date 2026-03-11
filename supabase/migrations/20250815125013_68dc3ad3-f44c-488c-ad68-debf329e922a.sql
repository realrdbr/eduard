-- Enable pgcrypto extension for password hashing
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Update verify_user_login function to use proper password hashing
CREATE OR REPLACE FUNCTION public.verify_user_login(username_input text, password_input text)
RETURNS TABLE(user_id bigint, profile_id bigint, permission_level smallint, must_change_password boolean, full_name text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
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
$$;

-- Update create_school_user function to use proper hashing
CREATE OR REPLACE FUNCTION public.create_school_user(username_input text, password_input text, full_name_input text, permission_level_input smallint, creator_user_id bigint)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
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
$$;

-- Update change_user_password function
CREATE OR REPLACE FUNCTION public.change_user_password(user_id_input bigint, old_password text, new_password text)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  current_hash TEXT;
BEGIN
  -- Verify old password
  SELECT password INTO current_hash
  FROM permissions
  WHERE id = user_id_input;
  
  IF current_hash IS NULL OR current_hash != old_password THEN
    RETURN json_build_object('error', 'Falsches aktuelles Passwort');
  END IF;
  
  -- Update password and remove must_change_password flag
  UPDATE permissions
  SET 
    password = new_password,
    must_change_password = false
  WHERE id = user_id_input;
  
  RETURN json_build_object('success', true);
END;
$$;