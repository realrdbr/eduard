-- Fix RLS: use custom session-based admin check for managing permissions
-- Update user_permissions policies
ALTER TABLE public.user_permissions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins can manage user permissions" ON public.user_permissions;
CREATE POLICY "Admins can manage user permissions"
ON public.user_permissions
FOR ALL
USING (public.current_user_has_permission_level(10::smallint))
WITH CHECK (public.current_user_has_permission_level(10::smallint));

DROP POLICY IF EXISTS "Authenticated users can view user permissions" ON public.user_permissions;
CREATE POLICY "Authenticated users can view user permissions"
ON public.user_permissions
FOR SELECT
USING (public.is_custom_user_authenticated() OR public.current_user_has_permission_level(1::smallint));

-- Update level_permissions policies
ALTER TABLE public.level_permissions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins can manage level permissions" ON public.level_permissions;
CREATE POLICY "Admins can manage level permissions"
ON public.level_permissions
FOR ALL
USING (public.current_user_has_permission_level(10::smallint))
WITH CHECK (public.current_user_has_permission_level(10::smallint));

DROP POLICY IF EXISTS "Authenticated users can view level permissions" ON public.level_permissions;
CREATE POLICY "Authenticated users can view level permissions"
ON public.level_permissions
FOR SELECT
USING (public.is_custom_user_authenticated() OR public.current_user_has_permission_level(1::smallint));

-- Update permission_definitions manage policy to session-based admin
ALTER TABLE public.permission_definitions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins can manage permission definitions" ON public.permission_definitions;
CREATE POLICY "Admins can manage permission definitions"
ON public.permission_definitions
FOR ALL
USING (public.current_user_has_permission_level(10::smallint))
WITH CHECK (public.current_user_has_permission_level(10::smallint));

DROP POLICY IF EXISTS "Authenticated users can view permission definitions" ON public.permission_definitions;
CREATE POLICY "Authenticated users can view permission definitions"
ON public.permission_definitions
FOR SELECT
USING (public.is_custom_user_authenticated() OR public.current_user_has_permission_level(1::smallint));
