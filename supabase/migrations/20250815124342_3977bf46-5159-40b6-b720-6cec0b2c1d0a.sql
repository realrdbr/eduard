-- Fix security warnings by setting search_path for functions

-- Update the permission level function
CREATE OR REPLACE FUNCTION public.get_current_user_permission_level()
RETURNS SMALLINT
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
BEGIN
  RETURN (
    SELECT perm.permission_lvl
    FROM profiles p
    LEFT JOIN permissions perm ON p.permission_id = perm.id
    WHERE p.user_id = auth.uid()
    LIMIT 1
  );
END;
$$;

-- Update the admin check function
CREATE OR REPLACE FUNCTION public.is_current_user_admin()
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
BEGIN
  RETURN COALESCE(public.get_current_user_permission_level() >= 10, false);
END;
$$;