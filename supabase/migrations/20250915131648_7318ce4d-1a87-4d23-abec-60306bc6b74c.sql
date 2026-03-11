-- RLS FIXES FOR UI VISIBILITY WHILE KEEPING SENSITIVE DATA PROTECTED
-- 1) USER THEMES: allow read-only public access so users can see custom themes in UI
DROP POLICY IF EXISTS "Public can view all user themes (temporary)" ON public.user_themes;
CREATE POLICY "Public can view all user themes (temporary)"
ON public.user_themes
FOR SELECT
USING (true);

-- 2) ANNOUNCEMENTS: restore public read so TTS/announcements page shows items
DROP POLICY IF EXISTS "Everyone can view announcements" ON public.announcements;
CREATE POLICY "Everyone can view announcements"
ON public.announcements
FOR SELECT
USING (true);

-- 3) VERTRETUNGSPLAN: restore public read so plan is visible
DROP POLICY IF EXISTS "Users can view all substitutions" ON public.vertretungsplan;
CREATE POLICY "Users can view all substitutions"
ON public.vertretungsplan
FOR SELECT
USING (true);

-- 4) STUNDENPLAN TABLES: restore public read for timetable pages
DROP POLICY IF EXISTS "Everyone can view schedule 10b_A" ON public."Stundenplan_10b_A";
CREATE POLICY "Everyone can view schedule 10b_A"
ON public."Stundenplan_10b_A"
FOR SELECT
USING (true);

DROP POLICY IF EXISTS "Everyone can view schedule 10c_A" ON public."Stundenplan_10c_A";
CREATE POLICY "Everyone can view schedule 10c_A"
ON public."Stundenplan_10c_A"
FOR SELECT
USING (true);

-- 5) TEACHERS: ensure teacher list is readable for generator UI
DROP POLICY IF EXISTS "Secure authenticated teacher access" ON public.teachers;
DROP POLICY IF EXISTS "Everyone can view teachers" ON public.teachers;
DROP POLICY IF EXISTS "Authenticated users can view teachers" ON public.teachers;
CREATE POLICY "Everyone can view teachers"
ON public.teachers
FOR SELECT
USING (true);
CREATE POLICY "Authenticated users can view teachers"
ON public.teachers
FOR SELECT
USING (is_custom_user_authenticated());

-- 6) KLASSEN: restore public read for class lists used across UI
DROP POLICY IF EXISTS "Enable read access for all users" ON public."Klassen";
CREATE POLICY "Enable read access for all users"
ON public."Klassen"
FOR SELECT
USING (true);
