-- Phase 2: Additional Security Functions and Improvements (without auth config)

-- Update function search paths for security functions that were missing them
CREATE OR REPLACE FUNCTION public.check_brute_force_protection(username_input text, ip_address_input inet DEFAULT NULL::inet)
RETURNS boolean
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  failed_attempts INTEGER := 0;
  last_attempt TIMESTAMP WITH TIME ZONE;
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

-- Fix search paths for other critical functions
CREATE OR REPLACE FUNCTION public.cleanup_expired_sessions()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  -- Deactivate sessions older than 24 hours
  UPDATE user_sessions 
  SET is_active = false 
  WHERE created_at < NOW() - INTERVAL '24 hours' 
    AND is_active = true;
    
  -- Log cleanup event
  INSERT INTO security_audit_log (
    event_type, 
    event_details
  ) VALUES (
    'session_cleanup',
    jsonb_build_object(
      'cleaned_at', NOW(),
      'action', 'expired_sessions_deactivated'
    )
  );
END;
$function$;

-- Improve audit log security - make it append-only
DROP POLICY IF EXISTS "System can log security events" ON public.security_audit_log;
DROP POLICY IF EXISTS "Admins can view audit logs" ON public.security_audit_log;

CREATE POLICY "Security audit logs are append-only for system"
ON public.security_audit_log
FOR INSERT
TO authenticated
WITH CHECK (true);

CREATE POLICY "Only admins can read security audit logs"
ON public.security_audit_log
FOR SELECT
TO authenticated
USING (is_current_user_admin_secure());

-- Fix other functions with missing search paths
CREATE OR REPLACE FUNCTION public.log_login_attempt(username_input text, success_input boolean, ip_address_input inet DEFAULT NULL::inet, user_agent_input text DEFAULT NULL::text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  -- Input validation
  IF username_input IS NULL OR trim(username_input) = '' THEN
    RETURN;
  END IF;

  INSERT INTO login_attempts (username, success, ip_address, user_agent)
  VALUES (username_input, success_input, ip_address_input, user_agent_input);
  
  -- Clean up old attempts (older than 24 hours)
  DELETE FROM login_attempts 
  WHERE attempted_at < NOW() - INTERVAL '24 hours';
END;
$function$;