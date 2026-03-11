-- Phase 2: Additional Security Functions and Improvements

-- Enable leaked password protection
UPDATE auth.config SET value = 'true' WHERE key = 'PASSWORD_HIBP_ENABLED';

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