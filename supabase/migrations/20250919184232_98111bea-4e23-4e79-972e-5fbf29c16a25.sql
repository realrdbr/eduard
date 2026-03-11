-- Insert missing level permissions for private_messages
INSERT INTO public.level_permissions (level, permission_id, allowed, created_at, updated_at) VALUES
  (1, 'private_messages', false, NOW(), NOW()),
  (2, 'private_messages', true, NOW(), NOW()),
  (3, 'private_messages', true, NOW(), NOW()),
  (4, 'private_messages', true, NOW(), NOW()),
  (5, 'private_messages', true, NOW(), NOW()),
  (6, 'private_messages', true, NOW(), NOW()),
  (7, 'private_messages', true, NOW(), NOW()),
  (8, 'private_messages', true, NOW(), NOW()),
  (9, 'private_messages', true, NOW(), NOW()),
  (10, 'private_messages', true, NOW(), NOW())
ON CONFLICT (level, permission_id) DO NOTHING;

-- Also ensure the permission definition exists
INSERT INTO public.permission_definitions (id, name, description, requires_level, created_at) VALUES
  ('private_messages', 'Private Messages', 'Access to private messaging functionality', 2, NOW())
ON CONFLICT (id) DO NOTHING;