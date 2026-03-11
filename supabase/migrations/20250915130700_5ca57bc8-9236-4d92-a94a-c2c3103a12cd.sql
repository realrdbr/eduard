-- SECURITY LINTER FIXES
-- Fix remaining security warnings from linter

-- 1. Fix Function Search Path Mutable issues
-- Update existing functions to have secure search_path settings

CREATE OR REPLACE FUNCTION public.check_brute_force_protection(username_input text, ip_address_input inet DEFAULT NULL::inet)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 STABLE
 SET search_path = 'public'
AS $$
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
$$;

CREATE OR REPLACE FUNCTION public.has_active_sessions(target_user_id bigint)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE 
 SECURITY DEFINER
 SET search_path = 'public'
AS $$
BEGIN
  RETURN EXISTS(
    SELECT 1 FROM user_sessions 
    WHERE user_id = target_user_id 
    AND is_active = true
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.check_user_permission(user_id_param bigint, permission_id_param text)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE 
 SECURITY DEFINER
 SET search_path = 'public'
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

CREATE OR REPLACE FUNCTION public.cleanup_old_conversations()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path = 'public'
AS $$
BEGIN
  DELETE FROM public.chat_conversations 
  WHERE created_at < NOW() - INTERVAL '7 days';
END;
$$;

CREATE OR REPLACE FUNCTION public.ensure_single_active_theme()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path = 'public'
AS $$
BEGIN
  IF NEW.is_active = true THEN
    -- Deactivate all other themes for this user
    UPDATE user_themes 
    SET is_active = false 
    WHERE user_id = NEW.user_id AND id != NEW.id;
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_current_user_id()
 RETURNS bigint
 LANGUAGE plpgsql
 STABLE 
 SECURITY DEFINER
 SET search_path = 'public'
AS $$
BEGIN
  RETURN (
    SELECT p.id 
    FROM permissions p 
    WHERE p.username = ((current_setting('request.jwt.claims'::text, true))::json ->> 'sub'::text)
    LIMIT 1
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.get_current_user_permission_level()
 RETURNS smallint
 LANGUAGE plpgsql
 STABLE 
 SECURITY DEFINER
 SET search_path = 'public'
AS $$
BEGIN
  RETURN (
    SELECT perm.permission_lvl
    FROM profiles p
    LEFT JOIN permissions perm ON p.permission_id = perm.id
    WHERE p.user_id = auth.uid()
    LIMIT 1
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.handle_new_user()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path = 'public'
AS $$
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
$$;

CREATE OR REPLACE FUNCTION public.hash_password(password_input text)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path = 'public'
AS $$
BEGIN
  RETURN extensions.crypt(password_input, extensions.gen_salt('bf', 10));
END;
$$;

CREATE OR REPLACE FUNCTION public.is_current_user_admin_safe()
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE 
 SECURITY DEFINER
 SET search_path = 'public'
AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 
    FROM permissions p 
    WHERE p.username = ((current_setting('request.jwt.claims'::text, true))::json ->> 'sub'::text)
    AND p.permission_lvl >= 10
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.is_session_valid(session_id_param uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE 
 SECURITY DEFINER
 SET search_path = 'public'
AS $$
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
$$;

CREATE OR REPLACE FUNCTION public.log_login_attempt(username_input text, success_input boolean, ip_address_input inet DEFAULT NULL::inet, user_agent_input text DEFAULT NULL::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path = 'public'
AS $$
BEGIN
  INSERT INTO login_attempts (username, success, ip_address, user_agent)
  VALUES (username_input, success_input, ip_address_input, user_agent_input);
  
  -- Clean up old attempts (older than 24 hours)
  DELETE FROM login_attempts 
  WHERE attempted_at < NOW() - INTERVAL '24 hours';
END;
$$;