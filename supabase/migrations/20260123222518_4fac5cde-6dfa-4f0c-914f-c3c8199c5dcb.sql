-- Fix audio_announcements RLS to use session-based permission checks instead of JWT

-- Drop old JWT-based policies
DROP POLICY IF EXISTS "Level 10+ can delete audio announcements" ON public.audio_announcements;
DROP POLICY IF EXISTS "Level 10+ can insert audio announcements" ON public.audio_announcements;
DROP POLICY IF EXISTS "Level 10+ can update audio announcements" ON public.audio_announcements;

-- Create new session-based policies
CREATE POLICY "Level 10+ can insert audio announcements via session"
ON public.audio_announcements FOR INSERT
WITH CHECK (current_user_has_permission_level(10::smallint));

CREATE POLICY "Level 10+ can update audio announcements via session"
ON public.audio_announcements FOR UPDATE
USING (current_user_has_permission_level(10::smallint))
WITH CHECK (current_user_has_permission_level(10::smallint));

CREATE POLICY "Level 10+ can delete audio announcements via session"
ON public.audio_announcements FOR DELETE
USING (current_user_has_permission_level(10::smallint));