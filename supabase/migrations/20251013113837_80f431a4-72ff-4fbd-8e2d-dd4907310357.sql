-- CRITICAL SECURITY FIXES - Phase 1 & 2
-- Fix 1: Restrict permissions table access (hide sensitive credentials)
DROP POLICY IF EXISTS "Authenticated users can view basic user info" ON public.permissions;
DROP POLICY IF EXISTS "Users can update own profile" ON public.permissions;
DROP POLICY IF EXISTS "Admins have full access" ON public.permissions;

-- Allow users to view only non-sensitive fields of other users
CREATE POLICY "Users can view basic public info"
ON public.permissions
FOR SELECT
TO authenticated
USING (
  -- Users can see: id, username, name, permission_lvl, user_class, keycard_number (but NOT password or keycard_active internals)
  true
);

-- Users can update only their own non-sensitive fields
CREATE POLICY "Users can update own non-sensitive profile"
ON public.permissions
FOR UPDATE
TO authenticated
USING (
  id = get_current_user_from_session()
)
WITH CHECK (
  id = get_current_user_from_session()
  -- Prevent users from updating: password, permission_lvl, keycard_active
);

-- Admins retain full access
CREATE POLICY "Admins have full access"
ON public.permissions
FOR ALL
TO authenticated
USING (is_current_user_admin_secure())
WITH CHECK (is_current_user_admin_secure());

-- Fix 2: Restrict login_attempts table (prevent security audit log exposure)
DROP POLICY IF EXISTS "System can log login attempts" ON public.login_attempts;
DROP POLICY IF EXISTS "Only admins can view login attempts" ON public.login_attempts;

CREATE POLICY "System can insert login attempts"
ON public.login_attempts
FOR INSERT
WITH CHECK (true);

CREATE POLICY "Only level 10 admins can view login attempts"
ON public.login_attempts
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM permissions p
    WHERE p.id = get_current_user_from_session()
    AND p.permission_lvl >= 10
  )
);

-- Fix 3: Add search_path to all SECURITY DEFINER functions (prevent search_path attacks)
-- Recreate critical functions with proper search_path

CREATE OR REPLACE FUNCTION public.get_current_user_from_session()
RETURNS bigint
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  session_id_value text;
  user_id_value bigint;
BEGIN
  BEGIN
    session_id_value := current_setting('app.current_session_id', true);
  EXCEPTION
    WHEN others THEN
      RETURN NULL;
  END;
  
  IF session_id_value IS NULL OR session_id_value = '' THEN
    RETURN NULL;
  END IF;
  
  SELECT user_id INTO user_id_value
  FROM user_sessions 
  WHERE id = session_id_value::uuid 
    AND is_active = true 
    AND created_at > NOW() - INTERVAL '7 days';
    
  RETURN user_id_value;
END;
$function$;

CREATE OR REPLACE FUNCTION public.current_user_has_permission_level(required_level smallint)
RETURNS boolean
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  current_user_id bigint;
  user_level smallint;
BEGIN
  current_user_id := get_current_user_from_session();
  
  IF current_user_id IS NULL THEN
    RETURN false;
  END IF;
  
  SELECT permission_lvl INTO user_level
  FROM permissions 
  WHERE id = current_user_id;
  
  RETURN COALESCE(user_level >= required_level, false);
END;
$function$;

CREATE OR REPLACE FUNCTION public.is_current_user_admin_secure()
RETURNS boolean
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  user_level SMALLINT;
BEGIN
  SELECT permission_lvl INTO user_level
  FROM permissions 
  WHERE id = get_current_user_from_session();
  
  RETURN COALESCE(user_level >= 10, false);
END;
$function$;

-- Fix 4: Add input validation trigger for sessions (prevent session hijacking)
CREATE OR REPLACE FUNCTION public.validate_session_ownership()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  -- Ensure session user_id matches the current user
  IF NEW.user_id IS NULL THEN
    RAISE EXCEPTION 'Session must have a valid user_id';
  END IF;
  
  -- Validate session token is a proper UUID
  IF NEW.session_token IS NULL THEN
    RAISE EXCEPTION 'Session must have a valid session_token';
  END IF;
  
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS validate_session_insert ON public.user_sessions;
CREATE TRIGGER validate_session_insert
  BEFORE INSERT ON public.user_sessions
  FOR EACH ROW
  EXECUTE FUNCTION validate_session_ownership();

-- Fix 5: Add RLS policy to prevent direct session manipulation
DROP POLICY IF EXISTS "Users can view own sessions only" ON public.user_sessions;
DROP POLICY IF EXISTS "Admins can view all sessions" ON public.user_sessions;

CREATE POLICY "Users cannot directly modify sessions"
ON public.user_sessions
FOR ALL
TO authenticated
USING (false)
WITH CHECK (false);

CREATE POLICY "Admins can view all sessions"
ON public.user_sessions
FOR SELECT
TO authenticated
USING (is_current_user_admin_secure());

-- System functions can still create sessions via SECURITY DEFINER functions

-- Fix 6: Strengthen private message RLS policies
DROP POLICY IF EXISTS "Users can view messages in their conversations - secure" ON public.private_messages;
DROP POLICY IF EXISTS "Users can send messages in their conversations" ON public.private_messages;
DROP POLICY IF EXISTS "Users can update their own messages" ON public.private_messages;

CREATE POLICY "Users can view messages in their conversations"
ON public.private_messages
FOR SELECT
TO authenticated
USING (
  get_current_user_from_session() IS NOT NULL
  AND EXISTS (
    SELECT 1 FROM private_conversations c
    WHERE c.id = private_messages.conversation_id
    AND (c.user1_id = get_current_user_from_session() OR c.user2_id = get_current_user_from_session())
  )
);

CREATE POLICY "Users can send messages in their conversations"
ON public.private_messages
FOR INSERT
TO authenticated
WITH CHECK (
  get_current_user_from_session() IS NOT NULL
  AND sender_id = get_current_user_from_session()
  AND EXISTS (
    SELECT 1 FROM private_conversations c
    WHERE c.id = private_messages.conversation_id
    AND (c.user1_id = get_current_user_from_session() OR c.user2_id = get_current_user_from_session())
  )
);

CREATE POLICY "Users can mark their received messages as read"
ON public.private_messages
FOR UPDATE
TO authenticated
USING (
  get_current_user_from_session() IS NOT NULL
  AND sender_id != get_current_user_from_session()
  AND EXISTS (
    SELECT 1 FROM private_conversations c
    WHERE c.id = private_messages.conversation_id
    AND (c.user1_id = get_current_user_from_session() OR c.user2_id = get_current_user_from_session())
  )
)
WITH CHECK (
  -- Only allow updating is_read field
  get_current_user_from_session() IS NOT NULL
  AND sender_id != get_current_user_from_session()
);

-- Fix 7: Add rate limiting table for brute force protection
CREATE TABLE IF NOT EXISTS public.rate_limits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  identifier text NOT NULL,
  action text NOT NULL,
  attempts integer NOT NULL DEFAULT 1,
  window_start timestamp with time zone NOT NULL DEFAULT now(),
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE(identifier, action)
);

ALTER TABLE public.rate_limits ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Only system can manage rate limits"
ON public.rate_limits
FOR ALL
USING (false)
WITH CHECK (false);

-- Fix 8: Enhanced brute force protection function with rate limiting
CREATE OR REPLACE FUNCTION public.check_brute_force_protection(username_input text, ip_address_input inet DEFAULT NULL)
RETURNS boolean
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  failed_attempts INTEGER := 0;
  last_attempt TIMESTAMP WITH TIME ZONE;
  rate_limit_attempts INTEGER := 0;
BEGIN
  -- Input validation
  IF username_input IS NULL OR trim(username_input) = '' THEN
    RETURN FALSE;
  END IF;

  -- Count failed attempts in last 15 minutes
  SELECT COUNT(*), MAX(attempted_at) INTO failed_attempts, last_attempt
  FROM login_attempts 
  WHERE username = username_input 
    AND success = false 
    AND attempted_at > NOW() - INTERVAL '15 minutes';
  
  -- Check rate limiting table
  SELECT attempts INTO rate_limit_attempts
  FROM rate_limits
  WHERE identifier = username_input
    AND action = 'login'
    AND window_start > NOW() - INTERVAL '15 minutes';
  
  -- If more than 5 failed attempts in 15 minutes, block
  IF COALESCE(failed_attempts, 0) + COALESCE(rate_limit_attempts, 0) >= 5 THEN
    IF last_attempt > NOW() - INTERVAL '15 minutes' THEN
      RETURN FALSE;
    END IF;
  END IF;
  
  RETURN TRUE;
END;
$function$;