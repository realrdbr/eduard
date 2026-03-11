-- CRITICAL SECURITY FIX: Implement proper password hashing
-- Create extension for password hashing
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Create secure password functions
CREATE OR REPLACE FUNCTION public.hash_password(password_input text)
RETURNS text AS $$
BEGIN
  RETURN crypt(password_input, gen_salt('bf', 10));
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE OR REPLACE FUNCTION public.verify_password(password_input text, password_hash text)
RETURNS boolean AS $$
BEGIN
  RETURN password_hash = crypt(password_input, password_hash);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Update verify_user_login to use proper password verification
CREATE OR REPLACE FUNCTION public.verify_user_login_secure(username_input text, password_input text)
RETURNS TABLE(user_id bigint, profile_id bigint, permission_level smallint, must_change_password boolean, full_name text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $function$
BEGIN
  RETURN QUERY
  SELECT 
    p.id::bigint as user_id,
    p.id::bigint as profile_id,
    p.permission_lvl,
    p.must_change_password,
    p.name as full_name
  FROM permissions p
  WHERE p.username = username_input 
    AND verify_password(password_input, p.password);
END;
$function$;

-- Create secure password change function
CREATE OR REPLACE FUNCTION public.change_user_password_secure(user_id_input bigint, old_password text, new_password text)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $function$
DECLARE
  current_hash text;
BEGIN
  -- Verify old password
  SELECT password INTO current_hash
  FROM permissions
  WHERE id = user_id_input;
  
  IF current_hash IS NULL THEN
    RETURN json_build_object('error', 'Benutzer nicht gefunden');
  END IF;
  
  IF NOT verify_password(old_password, current_hash) THEN
    RETURN json_build_object('error', 'Altes Passwort ist falsch');
  END IF;
  
  -- Update with new hashed password
  UPDATE permissions
  SET 
    password = hash_password(new_password),
    must_change_password = false
  WHERE id = user_id_input;
  
  RETURN json_build_object('success', true);
END;
$function$;

-- Create secure user creation function
CREATE OR REPLACE FUNCTION public.create_school_user_secure(username_input text, password_input text, full_name_input text, permission_level_input smallint, creator_user_id bigint)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $function$
DECLARE
  new_user_id BIGINT;
  creator_permission SMALLINT;
BEGIN
  -- Check if creator has permission level 10 (Schulleitung)
  SELECT permission_lvl INTO creator_permission
  FROM permissions
  WHERE id = creator_user_id;
  
  IF creator_permission IS NULL OR creator_permission < 10 THEN
    RETURN json_build_object('error', 'Keine Berechtigung zum Erstellen von Benutzern');
  END IF;
  
  -- Check if username already exists
  IF EXISTS (SELECT 1 FROM permissions WHERE username = username_input) THEN
    RETURN json_build_object('error', 'Benutzername bereits vergeben');
  END IF;
  
  -- Create user with hashed password
  INSERT INTO permissions (
    username,
    password,
    name,
    permission_lvl,
    must_change_password
  ) VALUES (
    username_input,
    hash_password(password_input),
    full_name_input,
    permission_level_input,
    true
  ) RETURNING id INTO new_user_id;
  
  RETURN json_build_object('success', true, 'user_id', new_user_id);
END;
$function$;

-- CRITICAL: Fix RLS policies for permissions table
DROP POLICY IF EXISTS "Admins can view all user data" ON permissions;
DROP POLICY IF EXISTS "School admins can view all permissions" ON permissions;

-- Create secure RLS policies for permissions table
CREATE POLICY "Admin users can view all permissions"
ON permissions FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM permissions p 
    WHERE p.username = ((current_setting('request.jwt.claims'::text, true))::json ->> 'sub'::text)
    AND p.permission_lvl >= 10
  )
);

CREATE POLICY "Users can view own permission data only"
ON permissions FOR SELECT
USING (
  username = ((current_setting('request.jwt.claims'::text, true))::json ->> 'sub'::text)
  OR id = get_current_user_id()
);

-- Secure user_permissions table
DROP POLICY IF EXISTS "Public read user perms" ON user_permissions;
CREATE POLICY "Admin only access to user permissions"
ON user_permissions FOR ALL
USING (
  EXISTS (
    SELECT 1 FROM permissions p 
    WHERE p.username = ((current_setting('request.jwt.claims'::text, true))::json ->> 'sub'::text)
    AND p.permission_lvl >= 10
  )
);

-- Secure level_permissions table  
DROP POLICY IF EXISTS "Public read level perms" ON level_permissions;
CREATE POLICY "Admin only access to level permissions"
ON level_permissions FOR ALL
USING (
  EXISTS (
    SELECT 1 FROM permissions p 
    WHERE p.username = ((current_setting('request.jwt.claims'::text, true))::json ->> 'sub'::text)
    AND p.permission_lvl >= 10
  )
);

-- Secure document_analysis table
DROP POLICY IF EXISTS "Everyone can view document analysis" ON document_analysis;
CREATE POLICY "Users can only view own document analysis"
ON document_analysis FOR SELECT
USING (uploaded_by = auth.uid());

-- Secure user_sessions table properly
DROP POLICY IF EXISTS "Users can manage their own sessions" ON user_sessions;
CREATE POLICY "Users can only access own sessions"
ON user_sessions FOR ALL
USING (
  user_id IN (
    SELECT p.id FROM permissions p 
    WHERE p.username = ((current_setting('request.jwt.claims'::text, true))::json ->> 'sub'::text)
  )
);

-- Create audit log table for security monitoring
CREATE TABLE IF NOT EXISTS public.security_audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id bigint,
  action text NOT NULL,
  resource text,
  ip_address inet,
  user_agent text,
  success boolean NOT NULL DEFAULT true,
  details jsonb,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Enable RLS on audit log
ALTER TABLE public.security_audit_log ENABLE ROW LEVEL SECURITY;

-- Only admins can access audit logs
CREATE POLICY "Admin only audit log access"
ON security_audit_log FOR ALL
USING (
  EXISTS (
    SELECT 1 FROM permissions p 
    WHERE p.username = ((current_setting('request.jwt.claims'::text, true))::json ->> 'sub'::text)
    AND p.permission_lvl >= 10
  )
);

-- Create function to log security events
CREATE OR REPLACE FUNCTION public.log_security_event(
  user_id_param bigint,
  action_param text,
  resource_param text DEFAULT NULL,
  ip_address_param inet DEFAULT NULL,
  user_agent_param text DEFAULT NULL,
  success_param boolean DEFAULT true,
  details_param jsonb DEFAULT NULL
)
RETURNS void AS $$
BEGIN
  INSERT INTO security_audit_log (
    user_id, action, resource, ip_address, user_agent, success, details
  ) VALUES (
    user_id_param, action_param, resource_param, ip_address_param, user_agent_param, success_param, details_param
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;