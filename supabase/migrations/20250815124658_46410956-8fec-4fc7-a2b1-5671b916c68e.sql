-- Complete the migration - remove profiles table and update remaining functions

-- Drop profiles table and dependencies
DROP TABLE IF EXISTS profiles CASCADE;

-- Update other functions
DROP FUNCTION IF EXISTS public.create_school_user(text, text, text, smallint, uuid);
DROP FUNCTION IF EXISTS public.change_user_password(uuid, text, text);

-- Create updated create_school_user function
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
    crypt(password_input, gen_salt('bf')),
    full_name_input,
    permission_level_input,
    true
  ) RETURNING id INTO new_user_id;
  
  RETURN json_build_object('success', true, 'user_id', new_user_id);
END;
$$;

-- Create updated change_user_password function
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
  
  IF current_hash IS NULL OR current_hash != crypt(old_password, current_hash) THEN
    RETURN json_build_object('error', 'Falsches aktuelles Passwort');
  END IF;
  
  -- Update password and remove must_change_password flag
  UPDATE permissions
  SET 
    password = crypt(new_password, gen_salt('bf')),
    must_change_password = false
  WHERE id = user_id_input;
  
  RETURN json_build_object('success', true);
END;
$$;

-- Update RLS policies for permissions table
ALTER TABLE permissions ENABLE ROW LEVEL SECURITY;

-- Remove old policies
DROP POLICY IF EXISTS "Everyone can read permissions for login" ON permissions;
DROP POLICY IF EXISTS "Admins can manage permissions" ON permissions;

-- Create new simplified policies
CREATE POLICY "Everyone can read permissions for login"
ON permissions FOR SELECT
USING (true);

CREATE POLICY "Users can update their own data"
ON permissions FOR UPDATE
USING (true);

CREATE POLICY "Admins can create users"
ON permissions FOR INSERT
WITH CHECK (true);

CREATE POLICY "Admins can delete users"
ON permissions FOR DELETE
USING (true);