-- Update permission system to support real database-backed permissions

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

-- Create default level permissions (users inherit permissions based on their level)
INSERT INTO level_permissions (level, permission_id, allowed) 
SELECT l.level, p.id, (l.level >= p.requires_level)
FROM (SELECT generate_series(1, 10) as level) l
CROSS JOIN permission_definitions p
ON CONFLICT (level, permission_id) DO UPDATE SET 
  allowed = (level_permissions.level >= (SELECT requires_level FROM permission_definitions WHERE id = level_permissions.permission_id));

-- Create session storage table for route tracking
CREATE TABLE IF NOT EXISTS user_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id BIGINT REFERENCES permissions(id) ON DELETE CASCADE,
  last_route TEXT DEFAULT '/',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  UNIQUE(user_id)
);

-- Enable RLS on session table
ALTER TABLE user_sessions ENABLE ROW LEVEL SECURITY;

-- Create policies for user sessions
CREATE POLICY "Users can manage their own sessions" 
ON user_sessions 
FOR ALL
USING (user_id = (SELECT id FROM permissions WHERE username = current_setting('request.jwt.claims', true)::json ->> 'sub'));

-- Create or replace function to check user permissions (enhanced version)
CREATE OR REPLACE FUNCTION check_user_permission(user_id_param BIGINT, permission_id_param TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  user_level INTEGER;
  user_specific_permission BOOLEAN;
  level_permission BOOLEAN;
BEGIN
  -- Get user's permission level
  SELECT permission_lvl INTO user_level
  FROM permissions 
  WHERE id = user_id_param;
  
  IF user_level IS NULL THEN
    RETURN FALSE;
  END IF;
  
  -- Check for user-specific permission override first
  SELECT allowed INTO user_specific_permission
  FROM user_permissions 
  WHERE user_id = user_id_param AND permission_id = permission_id_param;
  
  -- If user has specific permission set, use that
  IF user_specific_permission IS NOT NULL THEN
    RETURN user_specific_permission;
  END IF;
  
  -- Otherwise check level-based permission
  SELECT allowed INTO level_permission
  FROM level_permissions 
  WHERE level = user_level AND permission_id = permission_id_param;
  
  RETURN COALESCE(level_permission, FALSE);
END;
$$;

-- Create trigger to automatically update session timestamps
CREATE OR REPLACE FUNCTION update_session_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_user_sessions_timestamp
  BEFORE UPDATE ON user_sessions
  FOR EACH ROW
  EXECUTE FUNCTION update_session_timestamp();