-- Add unique constraints to prevent duplicate permissions
ALTER TABLE user_permissions 
ADD CONSTRAINT unique_user_permission 
UNIQUE (user_id, permission_id);

ALTER TABLE level_permissions 
ADD CONSTRAINT unique_level_permission 
UNIQUE (level, permission_id);

-- Insert default permission definitions if they don't exist
INSERT INTO permission_definitions (id, name, description, requires_level) VALUES
('view_chat', 'KI-Chat verwenden', 'Zugriff auf den KI-Assistenten', 1),
('view_schedule', 'Stundenplan einsehen', 'Eigenen Stundenplan anzeigen', 1),
('view_announcements', 'Ankündigungen lesen', 'Schulankündigungen einsehen', 1),
('view_vertretungsplan', 'Vertretungsplan einsehen', 'Vertretungen anzeigen', 1),
('create_announcements', 'Ankündigungen erstellen', 'Neue Ankündigungen verfassen', 4),
('edit_announcements', 'Ankündigungen bearbeiten', 'Bestehende Ankündigungen ändern', 4),
('manage_substitutions', 'Vertretungen verwalten', 'Vertretungsplan bearbeiten', 9),
('manage_schedules', 'Stundenpläne verwalten', 'Stundenpläne erstellen/bearbeiten', 9),
('document_analysis', 'Dokumenten-Analyse', 'KI-Dokumentenanalyse verwenden', 4),
('audio_announcements', 'Audio-Durchsagen', 'TTS-Durchsagen erstellen/verwalten', 10),
('user_management', 'Benutzerverwaltung', 'Benutzer erstellen/bearbeiten/löschen', 10),
('permission_management', 'Berechtigungen verwalten', 'Benutzerberechtigungen ändern', 10),
('keycard_system', 'Keycard-System', 'Zugangskontrolle konfigurieren', 10),
('system_settings', 'Systemeinstellungen', 'Arduino-Geräte und System verwalten', 10)
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  requires_level = EXCLUDED.requires_level;