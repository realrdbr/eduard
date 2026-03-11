-- Fix: Make teachers visible without Supabase Auth
CREATE POLICY IF NOT EXISTS "Everyone can view teachers"
ON public.teachers
FOR SELECT
USING (true);

-- Temporary fix: Allow themes CRUD without Supabase Auth
-- Note: This relaxes security. Replace with proper auth-based policies later.
CREATE POLICY IF NOT EXISTS "Public can view all user themes (temporary)"
ON public.user_themes
FOR SELECT
USING (true);

CREATE POLICY IF NOT EXISTS "Public can insert user themes (temporary)"
ON public.user_themes
FOR INSERT
WITH CHECK (true);

CREATE POLICY IF NOT EXISTS "Public can update user themes (temporary)"
ON public.user_themes
FOR UPDATE
USING (true)
WITH CHECK (true);

CREATE POLICY IF NOT EXISTS "Public can delete user themes (temporary)"
ON public.user_themes
FOR DELETE
USING (true);