-- Update announcements RLS to support session-based permissions
DROP POLICY IF EXISTS "Level 4+ users can delete announcements" ON announcements;
DROP POLICY IF EXISTS "Level 4+ users can insert announcements" ON announcements;
DROP POLICY IF EXISTS "Level 4+ users can update announcements" ON announcements;

CREATE POLICY "Level 4+ users can insert announcements via session" ON announcements
  FOR INSERT
  WITH CHECK (current_user_has_permission_level(4::smallint));

CREATE POLICY "Level 4+ users can update announcements via session" ON announcements
  FOR UPDATE
  USING (current_user_has_permission_level(4::smallint))
  WITH CHECK (current_user_has_permission_level(4::smallint));

CREATE POLICY "Level 4+ users can delete announcements via session" ON announcements
  FOR DELETE
  USING (current_user_has_permission_level(4::smallint));