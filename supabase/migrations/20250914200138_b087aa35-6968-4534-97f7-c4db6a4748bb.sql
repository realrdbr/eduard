-- Add brute force protection and security functions
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