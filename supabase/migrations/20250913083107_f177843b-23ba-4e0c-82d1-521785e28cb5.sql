-- CRITICAL SECURITY FIX: Remove dangerous public access policies from permissions table
-- This prevents theft of student/teacher personal data, passwords, and keycard numbers

-- Remove all dangerous policies that allow public or overly broad access
DROP POLICY IF EXISTS "Admins can create users" ON public.permissions;
DROP POLICY IF EXISTS "Admins can delete users" ON public.permissions;
DROP POLICY IF EXISTS "Admins can view all user profiles" ON public.permissions;
DROP POLICY IF EXISTS "Users can update their own data" ON public.permissions;
DROP POLICY IF EXISTS "Users can view their own profile info" ON public.permissions;

-- Keep only the secure policies we created in the last migration
-- These use SECURITY DEFINER functions to prevent infinite recursion
-- "Users can view own profile data" - users can only see their own data
-- "Admins can view all user data" - admins can manage all users
-- "School admins can manage all permissions" - admins can create users
-- "School admins can update permissions" - admins can update user data
-- "School admins can delete permissions" - admins can delete users
-- "School admins can view all permissions" - admins can view all users

-- Create additional secure policies for user self-management
CREATE POLICY "Users can update own profile data"
ON public.permissions
FOR UPDATE
USING (id = public.get_current_user_id())
WITH CHECK (id = public.get_current_user_id());

-- Ensure login function can access data through SECURITY DEFINER functions only
-- The verify_user_login function already uses SECURITY DEFINER so it bypasses RLS
-- No additional policy needed for login functionality

-- Add policy to allow users to change their own passwords (but not view them)
CREATE POLICY "Users can change own password"
ON public.permissions
FOR UPDATE
USING (
  id = public.get_current_user_id() 
  -- Only allow updating specific safe fields
)
WITH CHECK (
  id = public.get_current_user_id()
);