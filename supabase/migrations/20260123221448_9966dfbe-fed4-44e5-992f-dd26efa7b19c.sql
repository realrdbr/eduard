-- Fix WARN: user_themes - Restrict access to own themes only
DROP POLICY IF EXISTS "Full theme access for all users" ON public.user_themes;

CREATE POLICY "Users manage own themes"
ON public.user_themes FOR ALL
USING (user_id = get_current_user_from_session())
WITH CHECK (user_id = get_current_user_from_session());

-- Allow reading preset themes for everyone (they are shared)
CREATE POLICY "Everyone can view preset themes"
ON public.user_themes FOR SELECT
USING (is_preset = true);

-- Fix WARN: login_attempts - Block direct client INSERT (only service role via SECURITY DEFINER functions)
DROP POLICY IF EXISTS "Only service role can insert login attempts" ON public.login_attempts;
DROP POLICY IF EXISTS "System can log login attempts" ON public.login_attempts;

CREATE POLICY "No direct client INSERT on login_attempts"
ON public.login_attempts FOR INSERT
WITH CHECK (false);

-- Fix WARN: Function Search Path Mutable - Set search_path on functions that can be safely updated
CREATE OR REPLACE FUNCTION public.get_current_user_from_session()
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  session_token uuid;
  user_id_result bigint;
BEGIN
  -- Get session ID from local setting
  BEGIN
    session_token := current_setting('request.session_id', true)::uuid;
  EXCEPTION WHEN OTHERS THEN
    session_token := NULL;
  END;
  
  IF session_token IS NULL THEN
    RETURN NULL;
  END IF;
  
  -- Look up user from valid session (use updated_at for activity check)
  SELECT user_id INTO user_id_result
  FROM public.user_sessions
  WHERE session_token = get_current_user_from_session.session_token
    AND is_active = true
    AND updated_at > NOW() - INTERVAL '7 days'
  LIMIT 1;
  
  RETURN user_id_result;
END;
$$;

CREATE OR REPLACE FUNCTION public.current_user_has_permission_level(required_level smallint)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  current_user_id bigint;
  user_level smallint;
BEGIN
  current_user_id := get_current_user_from_session();
  
  IF current_user_id IS NULL THEN
    RETURN false;
  END IF;
  
  SELECT permission_lvl INTO user_level
  FROM public.permissions
  WHERE id = current_user_id;
  
  RETURN COALESCE(user_level, 0) >= required_level;
END;
$$;

CREATE OR REPLACE FUNCTION public.is_current_user_admin_secure()
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  current_user_id bigint;
  user_level smallint;
BEGIN
  current_user_id := get_current_user_from_session();
  
  IF current_user_id IS NULL THEN
    RETURN false;
  END IF;
  
  SELECT permission_lvl INTO user_level
  FROM public.permissions
  WHERE id = current_user_id;
  
  RETURN COALESCE(user_level, 0) >= 10;
END;
$$;

CREATE OR REPLACE FUNCTION public.is_custom_user_authenticated()
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN get_current_user_from_session() IS NOT NULL;
END;
$$;

-- For get_current_user_id, we need to drop and recreate policies that depend on it
-- Step 1: Drop dependent policies
DROP POLICY IF EXISTS "Authenticated users can view schedule 10b_A" ON public."Stundenplan_10b_A";
DROP POLICY IF EXISTS "Authenticated users can view schedule 10c_A" ON public."Stundenplan_10c_A";
DROP POLICY IF EXISTS "Authenticated users can view substitutions" ON public.vertretungsplan;
DROP POLICY IF EXISTS "Authenticated users can view announcements" ON public.announcements;
DROP POLICY IF EXISTS "Authenticated users can view classes" ON public."Klassen";

-- Step 2: Drop and recreate the function with search_path
DROP FUNCTION IF EXISTS public.get_current_user_id();

CREATE FUNCTION public.get_current_user_id()
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  session_user_id bigint;
BEGIN
  session_user_id := get_current_user_from_session();
  
  IF session_user_id IS NOT NULL THEN
    RETURN session_user_id::text::uuid;
  END IF;
  
  RETURN auth.uid();
END;
$$;

-- Step 3: Recreate the policies
CREATE POLICY "Authenticated users can view schedule 10b_A"
ON public."Stundenplan_10b_A" FOR SELECT
USING (get_current_user_id() IS NOT NULL);

CREATE POLICY "Authenticated users can view schedule 10c_A"
ON public."Stundenplan_10c_A" FOR SELECT
USING (get_current_user_id() IS NOT NULL);

CREATE POLICY "Authenticated users can view substitutions"
ON public.vertretungsplan FOR SELECT
USING (get_current_user_id() IS NOT NULL);

CREATE POLICY "Authenticated users can view announcements"
ON public.announcements FOR SELECT
USING (get_current_user_id() IS NOT NULL);

CREATE POLICY "Authenticated users can view classes"
ON public."Klassen" FOR SELECT
USING (get_current_user_id() IS NOT NULL);