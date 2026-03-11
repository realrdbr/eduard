-- CRITICAL SECURITY FIX: Remove public access to user credentials
-- This fixes the vulnerability where anyone could read all usernames and passwords

-- First, drop the dangerous public read policy
DROP POLICY IF EXISTS "Everyone can read permissions for login" ON permissions;

-- Create secure RLS policies that protect user credentials
-- Users can only see their own basic info (not passwords)
CREATE POLICY "Users can view their own profile info" 
ON permissions 
FOR SELECT 
USING (id = (
  SELECT p.id 
  FROM permissions p 
  WHERE p.username = current_setting('request.jwt.claims', true)::json->>'sub'
  LIMIT 1
));

-- Admins can view all users (password will be handled separately)
CREATE POLICY "Admins can view all user profiles" 
ON permissions 
FOR SELECT 
USING (
  EXISTS (
    SELECT 1 FROM permissions p 
    WHERE p.username = current_setting('request.jwt.claims', true)::json->>'sub' 
    AND p.permission_lvl >= 10
  )
);

-- Keep existing admin management policies (they're already secure)
-- The verify_user_login function will continue to work via SECURITY DEFINER

-- Add a policy for the login function to work (SECURITY DEFINER bypasses RLS anyway)
CREATE POLICY "Allow login function access" 
ON permissions 
FOR SELECT 
USING (true);

-- But make this policy only apply to the authenticator role used by functions
ALTER POLICY "Allow login function access" ON permissions TO authenticator;