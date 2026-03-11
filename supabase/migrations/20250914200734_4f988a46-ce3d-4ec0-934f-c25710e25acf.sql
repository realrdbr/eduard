-- CRITICAL SECURITY FIXES

-- 1. Fix user_sessions table - remove overly permissive policies
DROP POLICY IF EXISTS "Users can manage their own sessions" ON user_sessions;

-- Create proper restrictive policies for user_sessions
CREATE POLICY "Users can view own sessions only" 
ON user_sessions 
FOR SELECT 
USING (user_id = get_current_user_id());

CREATE POLICY "Users can insert own sessions only" 
ON user_sessions 
FOR INSERT 
WITH CHECK (user_id = get_current_user_id());

CREATE POLICY "Users can update own sessions only" 
ON user_sessions 
FOR UPDATE 
USING (user_id = get_current_user_id()) 
WITH CHECK (user_id = get_current_user_id());

CREATE POLICY "Users can delete own sessions only" 
ON user_sessions 
FOR DELETE 
USING (user_id = get_current_user_id());

-- 2. Fix audio_announcements - remove conflicting public policies
DROP POLICY IF EXISTS "Public can delete audio announcements" ON audio_announcements;
DROP POLICY IF EXISTS "Public can insert audio announcements" ON audio_announcements;
DROP POLICY IF EXISTS "Public can update audio announcements" ON audio_announcements;
DROP POLICY IF EXISTS "Public can view audio announcements" ON audio_announcements;

-- Keep only the level 10+ policies for audio_announcements management
-- The "Enable read access for all users" policy can stay for viewing

-- 3. Fix announcements table - restrict to teachers only (level 4+)
DROP POLICY IF EXISTS "Teachers can create announcements" ON announcements;
DROP POLICY IF EXISTS "Teachers can delete announcements" ON announcements;
DROP POLICY IF EXISTS "Teachers can update announcements" ON announcements;

CREATE POLICY "Level 4+ users can create announcements" 
ON announcements 
FOR INSERT 
WITH CHECK (EXISTS (
  SELECT 1 FROM permissions p 
  WHERE p.username = ((current_setting('request.jwt.claims'::text, true))::json ->> 'sub'::text) 
  AND p.permission_lvl >= 4
));

CREATE POLICY "Level 4+ users can update announcements" 
ON announcements 
FOR UPDATE 
USING (EXISTS (
  SELECT 1 FROM permissions p 
  WHERE p.username = ((current_setting('request.jwt.claims'::text, true))::json ->> 'sub'::text) 
  AND p.permission_lvl >= 4
));

CREATE POLICY "Level 4+ users can delete announcements" 
ON announcements 
FOR DELETE 
USING (EXISTS (
  SELECT 1 FROM permissions p 
  WHERE p.username = ((current_setting('request.jwt.claims'::text, true))::json ->> 'sub'::text) 
  AND p.permission_lvl >= 4
));

-- 4. Fix user_themes - restrict to user's own themes only
DROP POLICY IF EXISTS "Allow theme operations" ON user_themes;

CREATE POLICY "Users can view own themes" 
ON user_themes 
FOR SELECT 
USING (user_id = get_current_user_id());

CREATE POLICY "Users can insert own themes" 
ON user_themes 
FOR INSERT 
WITH CHECK (user_id = get_current_user_id());

CREATE POLICY "Users can update own themes" 
ON user_themes 
FOR UPDATE 
USING (user_id = get_current_user_id()) 
WITH CHECK (user_id = get_current_user_id());

CREATE POLICY "Users can delete own themes" 
ON user_themes 
FOR DELETE 
USING (user_id = get_current_user_id());

-- 5. Secure database functions with proper search_path
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
    WHERE p.username = ((current_setting('request.jwt.claims'::text, true))::json ->> 'sub'::text)
    LIMIT 1
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.is_current_user_admin_safe()
RETURNS boolean
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  RETURN EXISTS (
    SELECT 1 
    FROM permissions p 
    WHERE p.username = ((current_setting('request.jwt.claims'::text, true))::json ->> 'sub'::text)
    AND p.permission_lvl >= 10
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.check_user_permission(user_id_param bigint, permission_id_param text)
RETURNS boolean
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
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
$function$;

-- 6. Restrict vertretungsplan access - only authenticated users with proper permissions
DROP POLICY IF EXISTS "Teachers can manage substitutions" ON vertretungsplan;

CREATE POLICY "Level 4+ users can manage vertretungsplan" 
ON vertretungsplan 
FOR ALL 
USING (EXISTS (
  SELECT 1 FROM permissions p 
  WHERE p.username = ((current_setting('request.jwt.claims'::text, true))::json ->> 'sub'::text) 
  AND p.permission_lvl >= 4
)) 
WITH CHECK (EXISTS (
  SELECT 1 FROM permissions p 
  WHERE p.username = ((current_setting('request.jwt.claims'::text, true))::json ->> 'sub'::text) 
  AND p.permission_lvl >= 4
));