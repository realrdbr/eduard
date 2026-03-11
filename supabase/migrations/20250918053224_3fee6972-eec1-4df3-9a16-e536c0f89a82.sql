-- Fix library access permissions to only allow level 6+
DELETE FROM level_permissions WHERE permission_id = 'library_view' AND level < 6;

-- Ensure level 6+ have access
INSERT INTO level_permissions (level, permission_id, allowed) 
VALUES 
  (6, 'library_view', true),
  (8, 'library_view', true),
  (10, 'library_view', true)
ON CONFLICT (level, permission_id) DO UPDATE SET allowed = true;