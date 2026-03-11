-- Fix security issues from previous migration

-- Fix function search path issue
CREATE OR REPLACE FUNCTION check_user_permission(user_id_param BIGINT, permission_id_param TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  user_level INTEGER;
  user_specific_permission BOOLEAN;
  level_permission BOOLEAN;
BEGIN
  -- Get user's permission level
  SELECT permission_lvl INTO user_level
  FROM permissions 
  WHERE id = user_id_param;
  
  IF user_level IS NULL THEN
    RETURN FALSE;
  END IF;
  
  -- Check for user-specific permission override first
  SELECT allowed INTO user_specific_permission
  FROM user_permissions 
  WHERE user_id = user_id_param AND permission_id = permission_id_param;
  
  -- If user has specific permission set, use that
  IF user_specific_permission IS NOT NULL THEN
    RETURN user_specific_permission;
  END IF;
  
  -- Otherwise check level-based permission
  SELECT allowed INTO level_permission
  FROM level_permissions 
  WHERE level = user_level AND permission_id = permission_id_param;
  
  RETURN COALESCE(level_permission, FALSE);
END;
$$;

-- Also fix the session timestamp function
CREATE OR REPLACE FUNCTION update_session_timestamp()
RETURNS TRIGGER 
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;