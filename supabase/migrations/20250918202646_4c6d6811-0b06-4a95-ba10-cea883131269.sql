-- Add chat_access permission for private messaging

-- Insert the chat_access permission definition
INSERT INTO public.permission_definitions (id, name, description, requires_level)
VALUES ('chat_access', 'Chat-Zugriff', 'Berechtigung zum Verwenden des privaten Chat-Systems', 2)
ON CONFLICT (id) DO NOTHING;

-- Grant chat_access permission to level 2 and higher
INSERT INTO public.level_permissions (level, permission_id, allowed)
VALUES 
  (2, 'chat_access', true),
  (3, 'chat_access', true),
  (4, 'chat_access', true),
  (5, 'chat_access', true),
  (6, 'chat_access', true),
  (7, 'chat_access', true),
  (8, 'chat_access', true),
  (9, 'chat_access', true),
  (10, 'chat_access', true)
ON CONFLICT (level, permission_id) DO UPDATE SET allowed = EXCLUDED.allowed;