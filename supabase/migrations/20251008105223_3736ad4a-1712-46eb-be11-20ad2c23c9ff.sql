-- Ensure unique pairs for user_permissions to allow UPSERT
CREATE UNIQUE INDEX IF NOT EXISTS user_permissions_user_permission_uidx
ON public.user_permissions (user_id, permission_id);

-- Ensure unique pairs for level_permissions to allow UPSERT
CREATE UNIQUE INDEX IF NOT EXISTS level_permissions_level_permission_uidx
ON public.level_permissions (level, permission_id);
