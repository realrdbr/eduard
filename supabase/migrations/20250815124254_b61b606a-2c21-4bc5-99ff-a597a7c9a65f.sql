-- Fix infinite recursion in permissions table RLS policies
-- Use security definer functions to avoid recursive policy checks

-- First, drop the problematic policies
DROP POLICY IF EXISTS "Users can view their own permission level only" ON permissions;
DROP POLICY IF EXISTS "School admins can view all permissions" ON permissions;
DROP POLICY IF EXISTS "School admins can manage permissions" ON permissions;

-- Create security definer function to check user permission level
CREATE OR REPLACE FUNCTION public.get_current_user_permission_level()
RETURNS SMALLINT AS $$
BEGIN
  RETURN (
    SELECT perm.permission_lvl
    FROM profiles p
    LEFT JOIN permissions perm ON p.permission_id = perm.id
    WHERE p.user_id = auth.uid()
    LIMIT 1
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

-- Create security definer function to check if user is admin
CREATE OR REPLACE FUNCTION public.is_current_user_admin()
RETURNS BOOLEAN AS $$
BEGIN
  RETURN COALESCE(public.get_current_user_permission_level() >= 10, false);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

-- Create new RLS policies using security definer functions
CREATE POLICY "Users can view their own permission record"
ON permissions FOR SELECT
USING (
  id = (
    SELECT permission_id 
    FROM profiles 
    WHERE user_id = auth.uid()
    LIMIT 1
  )
);

CREATE POLICY "School admins can view all permissions"
ON permissions FOR SELECT
USING (public.is_current_user_admin());

CREATE POLICY "School admins can manage all permissions"
ON permissions FOR INSERT
WITH CHECK (public.is_current_user_admin());

CREATE POLICY "School admins can update permissions"
ON permissions FOR UPDATE
USING (public.is_current_user_admin());

CREATE POLICY "School admins can delete permissions"
ON permissions FOR DELETE
USING (public.is_current_user_admin());