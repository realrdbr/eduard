-- Remove profiles table and migrate everything to permissions table

-- First, update the verify_user_login function to work only with permissions
CREATE OR REPLACE FUNCTION public.verify_user_login(username_input text, password_input text)
RETURNS TABLE(user_id bigint, profile_id bigint, permission_level smallint, must_change_password boolean, full_name text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    p.id::bigint as user_id,
    p.id::bigint as profile_id,
    p.permission_lvl,
    p.must_change_password,
    p.name as full_name
  FROM permissions p
  WHERE p.username = username_input 
    AND p.password = crypt(password_input, p.password);
END;
$$;

-- Update create_school_user function to use only permissions table
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

-- Update change_user_password function for permissions table
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

-- Update permission check functions for new structure
CREATE OR REPLACE FUNCTION public.get_current_user_permission_level()
RETURNS SMALLINT
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
BEGIN
  -- Since we don't have auth.uid() anymore, we'll need to handle this differently
  -- This function will be updated in the application layer
  RETURN NULL;
END;
$$;

-- Drop the profiles table and related policies
DROP TABLE IF EXISTS profiles CASCADE;

-- Update permissions table RLS policies
DROP POLICY IF EXISTS "Users can view their own permission record" ON permissions;
DROP POLICY IF EXISTS "School admins can view all permissions" ON permissions;
DROP POLICY IF EXISTS "School admins can manage all permissions" ON permissions;
DROP POLICY IF EXISTS "School admins can update permissions" ON permissions;
DROP POLICY IF EXISTS "School admins can delete permissions" ON permissions;

-- Create simple RLS policies for permissions table
CREATE POLICY "Everyone can read permissions for login"
ON permissions FOR SELECT
USING (true);

CREATE POLICY "Admins can manage permissions"
ON permissions FOR ALL
USING (permission_lvl >= 10);