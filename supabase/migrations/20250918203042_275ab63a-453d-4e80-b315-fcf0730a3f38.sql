-- Ensure Schulleitung users have chat_access permission

-- Grant chat_access directly to all Schulleitung users
INSERT INTO public.user_permissions (user_id, permission_id, allowed, created_at, updated_at)
SELECT 
    p.id as user_id,
    'chat_access' as permission_id,
    true as allowed,
    now() as created_at,
    now() as updated_at
FROM permissions p 
WHERE p.permission_lvl >= 10
ON CONFLICT (user_id, permission_id) 
DO UPDATE SET allowed = true, updated_at = now();