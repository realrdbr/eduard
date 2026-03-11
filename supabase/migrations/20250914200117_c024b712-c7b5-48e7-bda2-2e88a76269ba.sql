-- Continue with permission table security fixes
DROP POLICY IF EXISTS "Public read user perms" ON user_permissions;
DROP POLICY IF EXISTS "Admins manage user perms" ON user_permissions;
DROP POLICY IF EXISTS "Public read level perms" ON level_permissions;
DROP POLICY IF EXISTS "Admins manage level perms" ON level_permissions;
DROP POLICY IF EXISTS "Public can read permissions" ON permission_definitions;
DROP POLICY IF EXISTS "Admins manage permission defs" ON permission_definitions;

-- Secure user_permissions table
CREATE POLICY "Authenticated users can view user permissions" 
ON user_permissions FOR SELECT 
USING (get_current_user_id() IS NOT NULL);

CREATE POLICY "Admins can manage user permissions" 
ON user_permissions FOR ALL 
USING (is_current_user_admin_safe())
WITH CHECK (is_current_user_admin_safe());

-- Secure level_permissions table  
CREATE POLICY "Authenticated users can view level permissions" 
ON level_permissions FOR SELECT 
USING (get_current_user_id() IS NOT NULL);

CREATE POLICY "Admins can manage level permissions" 
ON level_permissions FOR ALL 
USING (is_current_user_admin_safe())
WITH CHECK (is_current_user_admin_safe());

-- Secure permission_definitions table
CREATE POLICY "Authenticated users can view permission definitions" 
ON permission_definitions FOR SELECT 
USING (get_current_user_id() IS NOT NULL);

CREATE POLICY "Admins can manage permission definitions" 
ON permission_definitions FOR ALL 
USING (is_current_user_admin_safe())
WITH CHECK (is_current_user_admin_safe());