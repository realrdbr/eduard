-- Add private_messages permission
INSERT INTO permission_definitions (id, name, description, requires_level) 
VALUES ('private_messages', 'Private Nachrichten', 'Zugriff auf private Nachrichten und Chat-Funktionen', 2);

-- Set default level permissions for private messages (Level 2+ can use chat)
INSERT INTO level_permissions (level, permission_id, allowed) VALUES
(2, 'private_messages', true),
(3, 'private_messages', true),
(4, 'private_messages', true),
(5, 'private_messages', true),
(6, 'private_messages', true),
(7, 'private_messages', true),
(8, 'private_messages', true),
(9, 'private_messages', true),
(10, 'private_messages', true);