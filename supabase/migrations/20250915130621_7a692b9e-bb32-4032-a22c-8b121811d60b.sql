-- CRITICAL SECURITY FIXES - Phase 1 (Corrected)
-- Fixes for publicly exposed credentials and session vulnerabilities

-- 1. REMOVE ALL PUBLIC ACCESS TO PERMISSIONS TABLE (CRITICAL)
-- This table contains usernames and passwords and should NEVER be public
DROP POLICY IF EXISTS "Admins can view all user data" ON public.permissions;
DROP POLICY IF EXISTS "School admins can view all permissions" ON public.permissions;
DROP POLICY IF EXISTS "School admins can manage all permissions" ON public.permissions;
DROP POLICY IF EXISTS "School admins can update permissions" ON public.permissions;
DROP POLICY IF EXISTS "School admins can delete permissions" ON public.permissions;
DROP POLICY IF EXISTS "Users can change own password" ON public.permissions;
DROP POLICY IF EXISTS "Users can update own profile data" ON public.permissions;
DROP POLICY IF EXISTS "Users can view own profile data" ON public.permissions;

-- Create secure admin verification function
CREATE OR REPLACE FUNCTION public.is_current_user_admin_secure()
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  user_level SMALLINT;
BEGIN
  -- Get current user's permission level securely
  SELECT permission_lvl INTO user_level
  FROM permissions 
  WHERE username = ((current_setting('request.jwt.claims'::text, true))::json ->> 'sub'::text);
  
  RETURN COALESCE(user_level >= 10, false);
END;
$$;

-- Create secure permissions policies
CREATE POLICY "Users can view own data only" 
ON public.permissions 
FOR SELECT 
USING (username = ((current_setting('request.jwt.claims'::text, true))::json ->> 'sub'::text));

CREATE POLICY "Users can update own profile only" 
ON public.permissions 
FOR UPDATE 
USING (username = ((current_setting('request.jwt.claims'::text, true))::json ->> 'sub'::text))
WITH CHECK (username = ((current_setting('request.jwt.claims'::text, true))::json ->> 'sub'::text));

CREATE POLICY "Secure admin access only" 
ON public.permissions 
FOR ALL 
USING (is_current_user_admin_secure())
WITH CHECK (is_current_user_admin_secure());

-- 2. SECURE USER_SESSIONS TABLE
-- Remove conflicting policies
DROP POLICY IF EXISTS "Admins can manage all sessions" ON public.user_sessions;
DROP POLICY IF EXISTS "Users can create their own sessions" ON public.user_sessions;
DROP POLICY IF EXISTS "Users can delete own sessions only" ON public.user_sessions;
DROP POLICY IF EXISTS "Users can insert own sessions only" ON public.user_sessions;
DROP POLICY IF EXISTS "Users can modify their own sessions" ON public.user_sessions;
DROP POLICY IF EXISTS "Users can only access their own sessions" ON public.user_sessions;
DROP POLICY IF EXISTS "Users can remove their own sessions" ON public.user_sessions;
DROP POLICY IF EXISTS "Users can update own sessions only" ON public.user_sessions;

-- Create proper session policies
CREATE POLICY "Users access own sessions only" 
ON public.user_sessions 
FOR ALL 
USING (user_id = get_current_user_id())
WITH CHECK (user_id = get_current_user_id());

CREATE POLICY "Admins manage all sessions" 
ON public.user_sessions 
FOR ALL 
USING (is_current_user_admin_secure())
WITH CHECK (is_current_user_admin_secure());

-- 3. SECURE USER_THEMES TABLE - REMOVE PUBLIC ACCESS
DROP POLICY IF EXISTS "Public can delete user themes (temporary)" ON public.user_themes;
DROP POLICY IF EXISTS "Public can insert user themes (temporary)" ON public.user_themes;
DROP POLICY IF EXISTS "Public can update user themes (temporary)" ON public.user_themes;
DROP POLICY IF EXISTS "Public can view all user themes (temporary)" ON public.user_themes;

-- 4. SECURE AUDIO_ANNOUNCEMENTS - REMOVE PUBLIC READ ACCESS
DROP POLICY IF EXISTS "Enable read access for all users" ON public.audio_announcements;

-- Replace with authenticated access only
CREATE POLICY "Authenticated users can view announcements" 
ON public.audio_announcements 
FOR SELECT 
USING (get_current_user_id() IS NOT NULL);

-- 5. SECURE TEACHERS TABLE - REMOVE BROAD ACCESS AND RECREATE SAFELY
DROP POLICY IF EXISTS "Everyone can view teachers" ON public.teachers;
DROP POLICY IF EXISTS "Authenticated users can view teachers" ON public.teachers;

-- Replace with authenticated access only
CREATE POLICY "Secure authenticated teacher access" 
ON public.teachers 
FOR SELECT 
USING (get_current_user_id() IS NOT NULL);

-- 6. ADD SESSION SECURITY FUNCTIONS
CREATE OR REPLACE FUNCTION public.validate_session_security(session_id_param uuid)
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  session_valid BOOLEAN := FALSE;
  session_age INTERVAL;
BEGIN
  -- Check if session exists and is valid
  SELECT 
    (is_active = true AND created_at > NOW() - INTERVAL '24 hours'),
    (NOW() - created_at)
  INTO session_valid, session_age
  FROM user_sessions 
  WHERE id = session_id_param;
  
  -- Sessions older than 24 hours are invalid
  IF session_age > INTERVAL '24 hours' THEN
    -- Deactivate old session
    UPDATE user_sessions 
    SET is_active = false 
    WHERE id = session_id_param;
    RETURN FALSE;
  END IF;
  
  RETURN COALESCE(session_valid, FALSE);
END;
$$;

-- 7. ADD AUDIT LOGGING FOR SECURITY EVENTS
CREATE TABLE IF NOT EXISTS public.security_audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id BIGINT,
  event_type TEXT NOT NULL,
  event_details JSONB,
  ip_address INET,
  user_agent TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Enable RLS on audit log
ALTER TABLE public.security_audit_log ENABLE ROW LEVEL SECURITY;

-- Only admins can view audit logs
CREATE POLICY "Admins can view audit logs" 
ON public.security_audit_log 
FOR SELECT 
USING (is_current_user_admin_secure());

-- System can insert audit events
CREATE POLICY "System can log security events" 
ON public.security_audit_log 
FOR INSERT 
WITH CHECK (true);

-- 8. UPDATE EXISTING FUNCTIONS TO USE SECURE ADMIN CHECK
CREATE OR REPLACE FUNCTION public.is_current_user_admin()
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN public.is_current_user_admin_secure();
END;
$$;