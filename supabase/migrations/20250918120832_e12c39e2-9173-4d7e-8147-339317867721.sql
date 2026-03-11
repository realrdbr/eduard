-- Set correct library permissions by level
-- Level 1-5: Only view access
INSERT INTO level_permissions (level, permission_id, allowed) VALUES 
(1, 'library_view', true),
(2, 'library_view', true), 
(3, 'library_view', true),
(4, 'library_view', true),
(5, 'library_view', true)
ON CONFLICT (level, permission_id) DO UPDATE SET allowed = EXCLUDED.allowed;

-- Level 6+: Full library management (Bibliothekare)  
INSERT INTO level_permissions (level, permission_id, allowed) VALUES 
(6, 'library_view', true),
(6, 'library_manage_books', true),
(6, 'library_manage_loans', true),
(6, 'library_view_all_users', true),
(7, 'library_view', true),
(7, 'library_manage_books', true), 
(7, 'library_manage_loans', true),
(7, 'library_view_all_users', true),
(8, 'library_view', true),
(8, 'library_manage_books', true),
(8, 'library_manage_loans', true), 
(8, 'library_view_all_users', true),
(9, 'library_view', true),
(9, 'library_manage_books', true),
(9, 'library_manage_loans', true),
(9, 'library_view_all_users', true),
(10, 'library_view', true),
(10, 'library_manage_books', true),
(10, 'library_manage_loans', true),
(10, 'library_view_all_users', true)
ON CONFLICT (level, permission_id) DO UPDATE SET allowed = EXCLUDED.allowed;

-- Explicitly deny book management for levels 1-5
INSERT INTO level_permissions (level, permission_id, allowed) VALUES 
(1, 'library_manage_books', false),
(1, 'library_manage_loans', false),  
(1, 'library_view_all_users', false),
(2, 'library_manage_books', false),
(2, 'library_manage_loans', false),
(2, 'library_view_all_users', false),
(3, 'library_manage_books', false),
(3, 'library_manage_loans', false), 
(3, 'library_view_all_users', false),
(4, 'library_manage_books', false),
(4, 'library_manage_loans', false),
(4, 'library_view_all_users', false),
(5, 'library_manage_books', false),
(5, 'library_manage_loans', false),
(5, 'library_view_all_users', false)
ON CONFLICT (level, permission_id) DO UPDATE SET allowed = EXCLUDED.allowed;