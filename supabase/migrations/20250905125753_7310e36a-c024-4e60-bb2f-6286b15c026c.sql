-- Make theme_settings allowed for level 1 by default
INSERT INTO level_permissions (level, permission_id, allowed)
VALUES (1, 'theme_settings', true)
ON CONFLICT (level, permission_id) DO UPDATE SET allowed = EXCLUDED.allowed;