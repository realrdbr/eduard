-- Fix: Make teachers visible without Supabase Auth
DROP POLICY IF EXISTS "Everyone can view teachers" ON public.teachers;
CREATE POLICY "Everyone can view teachers"
ON public.teachers
FOR SELECT
USING (true);

-- Temporary fix: Allow themes CRUD without Supabase Auth
-- Note: This relaxes security. Replace with proper auth-based policies later.
DROP POLICY IF EXISTS "Public can view all user themes (temporary)" ON public.user_themes;
DROP POLICY IF EXISTS "Public can insert user themes (temporary)" ON public.user_themes;
DROP POLICY IF EXISTS "Public can update user themes (temporary)" ON public.user_themes;
DROP POLICY IF EXISTS "Public can delete user themes (temporary)" ON public.user_themes;

CREATE POLICY "Public can view all user themes (temporary)"
ON public.user_themes
FOR SELECT
USING (true);

CREATE POLICY "Public can insert user themes (temporary)"
ON public.user_themes
FOR INSERT
WITH CHECK (true);

CREATE POLICY "Public can update user themes (temporary)"
ON public.user_themes
FOR UPDATE
USING (true)
WITH CHECK (true);

CREATE POLICY "Public can delete user themes (temporary)"
ON public.user_themes
FOR DELETE
USING (true);