-- Drop the overly permissive policies on room_displays
DROP POLICY IF EXISTS "Enable All" ON public.room_displays;
DROP POLICY IF EXISTS "Enable delete for authenticated users" ON public.room_displays;
DROP POLICY IF EXISTS "Enable update for authenticated users" ON public.room_displays;

-- Keep public read access (displays need to be read by IoT devices)
CREATE POLICY "Everyone can view room displays"
ON public.room_displays
FOR SELECT
USING (true);

-- Level 8+ can insert room displays via session
CREATE POLICY "Level 8+ can insert room displays via session"
ON public.room_displays
FOR INSERT
WITH CHECK (current_user_has_permission_level(8::smallint));

-- Level 8+ can update room displays via session
CREATE POLICY "Level 8+ can update room displays via session"
ON public.room_displays
FOR UPDATE
USING (current_user_has_permission_level(8::smallint))
WITH CHECK (current_user_has_permission_level(8::smallint));

-- Level 8+ can delete room displays via session
CREATE POLICY "Level 8+ can delete room displays via session"
ON public.room_displays
FOR DELETE
USING (current_user_has_permission_level(8::smallint));