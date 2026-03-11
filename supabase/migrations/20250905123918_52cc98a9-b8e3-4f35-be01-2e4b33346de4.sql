-- Add theme_settings permission to permission_definitions
INSERT INTO permission_definitions (id, name, description, requires_level)
VALUES ('theme_settings', 'Theme-Einstellungen', 'Zugriff auf Theme-Einstellungen und Farbkonfiguration', 1)
ON CONFLICT (id) DO NOTHING;

-- Add default level permissions for theme_settings
INSERT INTO level_permissions (level, permission_id, allowed)
VALUES 
  (1, 'theme_settings', false),
  (2, 'theme_settings', true),
  (3, 'theme_settings', true),
  (4, 'theme_settings', true),
  (5, 'theme_settings', true),
  (6, 'theme_settings', true),
  (7, 'theme_settings', true),
  (8, 'theme_settings', true),
  (9, 'theme_settings', true),
  (10, 'theme_settings', true)
ON CONFLICT (level, permission_id) DO NOTHING;