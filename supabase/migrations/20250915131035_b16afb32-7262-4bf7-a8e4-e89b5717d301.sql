-- FINAL SECURITY HARDENING - Secure remaining public data
-- Address remaining security warnings for school data exposure

-- 1. SECURE SCHEDULE TABLES - Remove public access
DROP POLICY IF EXISTS "Everyone can view schedule 10b_A" ON public."Stundenplan_10b_A";
DROP POLICY IF EXISTS "Everyone can view schedule 10c_A" ON public."Stundenplan_10c_A";

-- Replace with authenticated access
CREATE POLICY "Authenticated users can view schedule 10b_A" 
ON public."Stundenplan_10b_A" 
FOR SELECT 
USING (get_current_user_id() IS NOT NULL);

CREATE POLICY "Authenticated users can view schedule 10c_A" 
ON public."Stundenplan_10c_A" 
FOR SELECT 
USING (get_current_user_id() IS NOT NULL);

-- 2. SECURE VERTRETUNGSPLAN - Remove public read access
DROP POLICY IF EXISTS "Users can view all substitutions" ON public.vertretungsplan;

-- Replace with authenticated access only
CREATE POLICY "Authenticated users can view substitutions" 
ON public.vertretungsplan 
FOR SELECT 
USING (get_current_user_id() IS NOT NULL);

-- 3. SECURE ANNOUNCEMENTS - Remove public access
DROP POLICY IF EXISTS "Everyone can view announcements" ON public.announcements;

-- Replace with authenticated access only
CREATE POLICY "Authenticated users can view announcements" 
ON public.announcements 
FOR SELECT 
USING (get_current_user_id() IS NOT NULL);

-- 4. SECURE CLASS LIST - Remove public access  
DROP POLICY IF EXISTS "Enable read access for all users" ON public."Klassen";

-- Replace with authenticated access only
CREATE POLICY "Authenticated users can view classes" 
ON public."Klassen" 
FOR SELECT 
USING (get_current_user_id() IS NOT NULL);

-- 5. ADD SECURITY MONITORING TRIGGERS
CREATE OR REPLACE FUNCTION public.log_security_access_attempt()
RETURNS TRIGGER AS $$
BEGIN
  -- Log unauthorized access attempts to security audit
  INSERT INTO security_audit_log (
    user_id, 
    event_type, 
    event_details,
    created_at
  ) VALUES (
    NULL, -- No user ID for failed access
    'unauthorized_access_attempt',
    jsonb_build_object(
      'table', TG_TABLE_NAME,
      'operation', TG_OP,
      'attempted_at', NOW()
    ),
    NOW()
  );
  RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = 'public';

-- 6. ENHANCE LOGIN ATTEMPT TRACKING
CREATE INDEX IF NOT EXISTS idx_login_attempts_username_time 
ON login_attempts(username, attempted_at DESC);

CREATE INDEX IF NOT EXISTS idx_login_attempts_ip_time 
ON login_attempts(ip_address, attempted_at DESC);

-- 7. ADD SESSION CLEANUP JOB (Manual cleanup for now)
CREATE OR REPLACE FUNCTION public.cleanup_expired_sessions()
RETURNS void AS $$
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
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = 'public';