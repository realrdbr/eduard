-- SECURE RLS POLICIES FOR PERMANENT SOLUTION

-- 1) USER THEMES: Users can manage their own themes, everyone can view for UI
DROP POLICY IF EXISTS "Public can view all user themes (temporary)" ON public.user_themes;
DROP POLICY IF EXISTS "Users can view own themes" ON public.user_themes;
DROP POLICY IF EXISTS "Users can insert own themes" ON public.user_themes;
DROP POLICY IF EXISTS "Users can update own themes" ON public.user_themes;
DROP POLICY IF EXISTS "Users can delete own themes" ON public.user_themes;

-- Allow viewing all themes for UI display
CREATE POLICY "Everyone can view themes for UI display"
ON public.user_themes
FOR SELECT
USING (true);

-- Users can manage their own themes
CREATE POLICY "Users can manage their own themes - insert"
ON public.user_themes
FOR INSERT
WITH CHECK (user_id = get_current_user_id());

CREATE POLICY "Users can manage their own themes - update"
ON public.user_themes
FOR UPDATE
USING (user_id = get_current_user_id())
WITH CHECK (user_id = get_current_user_id());

CREATE POLICY "Users can manage their own themes - delete"
ON public.user_themes
FOR DELETE
USING (user_id = get_current_user_id());

-- 2) VERTRETUNGSPLAN: Proper permission-based access
DROP POLICY IF EXISTS "Level 4+ users can manage vertretungsplan" ON public.vertretungsplan;

-- Everyone can view substitutions
-- Users with level 4+ can manage substitutions
CREATE POLICY "Level 4+ users can insert vertretungsplan"
ON public.vertretungsplan
FOR INSERT
WITH CHECK (EXISTS (
  SELECT 1 FROM permissions p 
  WHERE p.username = ((current_setting('request.jwt.claims'::text, true))::json ->> 'sub'::text) 
  AND p.permission_lvl >= 4
));

CREATE POLICY "Level 4+ users can update vertretungsplan"
ON public.vertretungsplan
FOR UPDATE
USING (EXISTS (
  SELECT 1 FROM permissions p 
  WHERE p.username = ((current_setting('request.jwt.claims'::text, true))::json ->> 'sub'::text) 
  AND p.permission_lvl >= 4
))
WITH CHECK (EXISTS (
  SELECT 1 FROM permissions p 
  WHERE p.username = ((current_setting('request.jwt.claims'::text, true))::json ->> 'sub'::text) 
  AND p.permission_lvl >= 4
));

CREATE POLICY "Level 4+ users can delete vertretungsplan"
ON public.vertretungsplan
FOR DELETE
USING (EXISTS (
  SELECT 1 FROM permissions p 
  WHERE p.username = ((current_setting('request.jwt.claims'::text, true))::json ->> 'sub'::text) 
  AND p.permission_lvl >= 4
));

-- 3) USER SESSIONS: Users can manage their own sessions
DROP POLICY IF EXISTS "Users access own sessions only" ON public.user_sessions;
DROP POLICY IF EXISTS "Admins manage all sessions" ON public.user_sessions;

CREATE POLICY "Users can view own sessions"
ON public.user_sessions
FOR SELECT
USING (user_id = get_current_user_id());

CREATE POLICY "Users can insert own sessions"
ON public.user_sessions
FOR INSERT
WITH CHECK (user_id = get_current_user_id());

CREATE POLICY "Users can update own sessions"
ON public.user_sessions
FOR UPDATE
USING (user_id = get_current_user_id())
WITH CHECK (user_id = get_current_user_id());

CREATE POLICY "Users can delete own sessions"
ON public.user_sessions
FOR DELETE
USING (user_id = get_current_user_id());

CREATE POLICY "Admins can manage all sessions"
ON public.user_sessions
FOR ALL
USING (is_current_user_admin_secure())
WITH CHECK (is_current_user_admin_secure());

-- 4) AUDIO ANNOUNCEMENTS: Restore proper level-based management
DROP POLICY IF EXISTS "Level 10+ users can create audio announcements" ON public.audio_announcements;
DROP POLICY IF EXISTS "Level 10+ users can update audio announcements" ON public.audio_announcements;
DROP POLICY IF EXISTS "Level 10+ users can delete audio announcements" ON public.audio_announcements;
DROP POLICY IF EXISTS "Level 10+ users can view audio announcements" ON public.audio_announcements;
DROP POLICY IF EXISTS "Authenticated users can view announcements" ON public.audio_announcements;

-- Everyone can view audio announcements
CREATE POLICY "Everyone can view audio announcements"
ON public.audio_announcements
FOR SELECT
USING (true);

-- Level 10+ users can manage audio announcements
CREATE POLICY "Level 10+ can insert audio announcements"
ON public.audio_announcements
FOR INSERT
WITH CHECK (EXISTS (
  SELECT 1 FROM permissions p 
  WHERE p.username = ((current_setting('request.jwt.claims'::text, true))::json ->> 'sub'::text) 
  AND p.permission_lvl >= 10
));

CREATE POLICY "Level 10+ can update audio announcements"
ON public.audio_announcements
FOR UPDATE
USING (EXISTS (
  SELECT 1 FROM permissions p 
  WHERE p.username = ((current_setting('request.jwt.claims'::text, true))::json ->> 'sub'::text) 
  AND p.permission_lvl >= 10
))
WITH CHECK (EXISTS (
  SELECT 1 FROM permissions p 
  WHERE p.username = ((current_setting('request.jwt.claims'::text, true))::json ->> 'sub'::text) 
  AND p.permission_lvl >= 10
));

CREATE POLICY "Level 10+ can delete audio announcements"
ON public.audio_announcements
FOR DELETE
USING (EXISTS (
  SELECT 1 FROM permissions p 
  WHERE p.username = ((current_setting('request.jwt.claims'::text, true))::json ->> 'sub'::text) 
  AND p.permission_lvl >= 10
));