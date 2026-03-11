-- ============================================
-- COMPREHENSIVE SECURITY FIX MIGRATION
-- ============================================

-- Phase 1: Fix Critical RLS Policies

-- 1. Drop the overly permissive user_sessions policies
DROP POLICY IF EXISTS "Users can manage their own sessions" ON user_sessions;

-- Create secure user_sessions policies
CREATE POLICY "Users can view their own sessions" 
ON user_sessions FOR SELECT 
USING (user_id = get_current_user_id());

CREATE POLICY "Users can insert their own sessions" 
ON user_sessions FOR INSERT 
WITH CHECK (user_id = get_current_user_id());

CREATE POLICY "Users can update their own sessions" 
ON user_sessions FOR UPDATE 
USING (user_id = get_current_user_id())
WITH CHECK (user_id = get_current_user_id());

CREATE POLICY "Users can delete their own sessions" 
ON user_sessions FOR DELETE 
USING (user_id = get_current_user_id());

CREATE POLICY "Admins can manage all sessions" 
ON user_sessions FOR ALL 
USING (is_current_user_admin_safe())
WITH CHECK (is_current_user_admin_safe());

-- 2. Secure permissions table - remove overly broad policies
DROP POLICY IF EXISTS "Admins can view all user data" ON permissions;

-- Create more specific admin policies for permissions table
CREATE POLICY "Admins can view user management data" 
ON permissions FOR SELECT 
USING (is_current_user_admin_safe());

CREATE POLICY "Admins can create users" 
ON permissions FOR INSERT 
WITH CHECK (is_current_user_admin_safe());

-- 3. Secure user_permissions table
DROP POLICY IF EXISTS "Public read user perms" ON user_permissions;
DROP POLICY IF EXISTS "Admins manage user perms" ON user_permissions;

CREATE POLICY "Authenticated users can view user permissions" 
ON user_permissions FOR SELECT 
USING (get_current_user_id() IS NOT NULL);

CREATE POLICY "Admins can manage user permissions" 
ON user_permissions FOR ALL 
USING (is_current_user_admin_safe())
WITH CHECK (is_current_user_admin_safe());

-- 4. Secure level_permissions table
DROP POLICY IF EXISTS "Public read level perms" ON level_permissions;
DROP POLICY IF EXISTS "Admins manage level perms" ON level_permissions;

CREATE POLICY "Authenticated users can view level permissions" 
ON level_permissions FOR SELECT 
USING (get_current_user_id() IS NOT NULL);

CREATE POLICY "Admins can manage level permissions" 
ON level_permissions FOR ALL 
USING (is_current_user_admin_safe())
WITH CHECK (is_current_user_admin_safe());

-- 5. Secure permission_definitions table
DROP POLICY IF EXISTS "Public can read permissions" ON permission_definitions;
DROP POLICY IF EXISTS "Admins manage permission defs" ON permission_definitions;

CREATE POLICY "Authenticated users can view permission definitions" 
ON permission_definitions FOR SELECT 
USING (get_current_user_id() IS NOT NULL);

CREATE POLICY "Admins can manage permission definitions" 
ON permission_definitions FOR ALL 
USING (is_current_user_admin_safe())
WITH CHECK (is_current_user_admin_safe());

-- 6. Clean up duplicate policies on audio_announcements
DROP POLICY IF EXISTS "Public can view audio announcements" ON audio_announcements;
DROP POLICY IF EXISTS "Public can insert audio announcements" ON audio_announcements;
DROP POLICY IF EXISTS "Public can update audio announcements" ON audio_announcements;
DROP POLICY IF EXISTS "Public can delete audio announcements" ON audio_announcements;

-- Keep only the level-based policies for audio_announcements
-- The existing level 10+ policies are sufficient

-- Phase 2: Security Hardening Functions

-- Create secure session validation function
CREATE OR REPLACE FUNCTION public.validate_session_token(session_token_param uuid)
RETURNS boolean
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  session_valid BOOLEAN := FALSE;
  user_id_result BIGINT;
BEGIN
  -- Check if session exists, is active, and not expired
  SELECT user_id INTO user_id_result
  FROM user_sessions 
  WHERE session_token = session_token_param 
    AND is_active = true 
    AND created_at > NOW() - INTERVAL '7 days';
  
  session_valid := (user_id_result IS NOT NULL);
  
  -- Update last activity if session is valid
  IF session_valid THEN
    UPDATE user_sessions 
    SET updated_at = NOW() 
    WHERE session_token = session_token_param;
  END IF;
  
  RETURN session_valid;
END;
$function$;

-- Create function to rotate session tokens
CREATE OR REPLACE FUNCTION public.rotate_session_token(old_session_token uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  new_token UUID := gen_random_uuid();
  user_id_result BIGINT;
BEGIN
  -- Get user_id from old session
  SELECT user_id INTO user_id_result
  FROM user_sessions 
  WHERE session_token = old_session_token 
    AND is_active = true;
  
  IF user_id_result IS NULL THEN
    RETURN NULL;
  END IF;
  
  -- Deactivate old session
  UPDATE user_sessions 
  SET is_active = false 
  WHERE session_token = old_session_token;
  
  -- Create new session
  INSERT INTO user_sessions (user_id, session_token, is_active, is_primary)
  VALUES (user_id_result, new_token, true, true);
  
  -- Remove primary flag from other sessions
  UPDATE user_sessions 
  SET is_primary = false 
  WHERE user_id = user_id_result 
    AND session_token != new_token;
  
  RETURN new_token;
END;
$function$;

-- Create login attempt tracking table
CREATE TABLE IF NOT EXISTS login_attempts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  username TEXT NOT NULL,
  ip_address INET,
  attempted_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  success BOOLEAN DEFAULT FALSE,
  user_agent TEXT
);

-- Enable RLS on login_attempts
ALTER TABLE login_attempts ENABLE ROW LEVEL SECURITY;

-- Only admins can view login attempts
CREATE POLICY "Admins can view login attempts" 
ON login_attempts FOR SELECT 
USING (is_current_user_admin_safe());

CREATE POLICY "System can log login attempts" 
ON login_attempts FOR INSERT 
WITH CHECK (true);

-- Create brute force protection function
CREATE OR REPLACE FUNCTION public.check_brute_force_protection(username_input text, ip_address_input inet DEFAULT NULL)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
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
$function$;

-- Create function to log login attempts
CREATE OR REPLACE FUNCTION public.log_login_attempt(username_input text, success_input boolean, ip_address_input inet DEFAULT NULL, user_agent_input text DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  INSERT INTO login_attempts (username, success, ip_address, user_agent)
  VALUES (username_input, success_input, ip_address_input, user_agent_input);
  
  -- Clean up old attempts (older than 24 hours)
  DELETE FROM login_attempts 
  WHERE attempted_at < NOW() - INTERVAL '24 hours';
END;
$function$;

-- Update the secure login function with brute force protection
CREATE OR REPLACE FUNCTION public.verify_user_login_secure(username_input text, password_input text, ip_address_input inet DEFAULT NULL, user_agent_input text DEFAULT NULL)
RETURNS TABLE(user_id bigint, profile_id bigint, permission_level smallint, must_change_password boolean, full_name text, error_message text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  user_record RECORD;
  is_blocked BOOLEAN;
BEGIN
  -- Check brute force protection
  SELECT check_brute_force_protection(username_input, ip_address_input) INTO is_blocked;
  
  IF NOT is_blocked THEN
    -- Log failed attempt due to rate limiting
    PERFORM log_login_attempt(username_input, false, ip_address_input, user_agent_input);
    
    RETURN QUERY SELECT 
      NULL::bigint, NULL::bigint, NULL::smallint, NULL::boolean, NULL::text, 
      'Too many failed login attempts. Please try again in 15 minutes.'::text;
    RETURN;
  END IF;
  
  -- Try to find and verify user
  SELECT p.id, p.permission_lvl, p.must_change_password, p.name, p.password
  INTO user_record
  FROM permissions p
  WHERE p.username = username_input;
  
  -- Check if user exists and password is correct
  IF user_record IS NULL OR NOT verify_password(password_input, user_record.password) THEN
    -- Log failed attempt
    PERFORM log_login_attempt(username_input, false, ip_address_input, user_agent_input);
    
    RETURN QUERY SELECT 
      NULL::bigint, NULL::bigint, NULL::smallint, NULL::boolean, NULL::text,
      'Invalid username or password.'::text;
    RETURN;
  END IF;
  
  -- Log successful attempt
  PERFORM log_login_attempt(username_input, true, ip_address_input, user_agent_input);
  
  -- Return user data
  RETURN QUERY SELECT 
    user_record.id::bigint,
    user_record.id::bigint,
    user_record.permission_lvl,
    user_record.must_change_password,
    user_record.name,
    NULL::text;
END;
$function$;

-- Fix all database functions to use secure search paths
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