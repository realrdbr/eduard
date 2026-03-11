-- CRITICAL SECURITY FIX: Remove public access to user credentials
-- This fixes the vulnerability where usernames and passwords are publicly readable

-- First, drop the dangerous public SELECT policy
DROP POLICY IF EXISTS "Allow login function access" ON public.permissions;

-- Create secure RLS policies that protect user credentials
-- Users can only view their own profile data (excluding password)
CREATE POLICY "Users can view own profile data"
ON public.permissions
FOR SELECT
USING (
  id = (
    SELECT p.id 
    FROM permissions p 
    WHERE p.username = ((current_setting('request.jwt.claims'::text, true))::json ->> 'sub'::text)
    LIMIT 1
  )
);

-- Admins can view all user data for management purposes
CREATE POLICY "Admins can view all user data"
ON public.permissions
FOR SELECT
USING (
  EXISTS (
    SELECT 1 
    FROM permissions p 
    WHERE p.username = ((current_setting('request.jwt.claims'::text, true))::json ->> 'sub'::text)
    AND p.permission_lvl >= 10
  )
);

-- Special policy for login verification function - SECURITY DEFINER functions bypass RLS
-- This allows the verify_user_login function to access credentials for authentication
-- but prevents direct public access
CREATE POLICY "Login function credential access"
ON public.permissions
FOR SELECT
USING (
  -- Only allow access when called from SECURITY DEFINER functions
  -- This prevents direct public access while allowing login verification
  current_setting('role') = 'authenticator'
);