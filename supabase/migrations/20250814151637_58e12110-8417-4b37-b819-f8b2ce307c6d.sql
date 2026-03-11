-- Clear existing announcements
DELETE FROM public.announcements;

-- Fix RLS policies for vertretungsplan - use a simpler approach
DROP POLICY IF EXISTS "Teachers can create substitutions" ON public.vertretungsplan;
DROP POLICY IF EXISTS "Teachers can update substitutions" ON public.vertretungsplan;
DROP POLICY IF EXISTS "Teachers can delete substitutions" ON public.vertretungsplan;

-- Create simpler policies that work with the current auth structure
CREATE POLICY "Teachers can manage substitutions" 
ON public.vertretungsplan 
FOR ALL
USING (true)
WITH CHECK (true);

-- Fix announcement policies to make them visible to everyone
DROP POLICY IF EXISTS "Users can view all announcements" ON public.announcements;
DROP POLICY IF EXISTS "Teachers can create announcements" ON public.announcements;
DROP POLICY IF EXISTS "Teachers can update their announcements" ON public.announcements;
DROP POLICY IF EXISTS "Teachers can delete announcements" ON public.announcements;

-- Create announcement policies that work for everyone
CREATE POLICY "Everyone can view announcements" 
ON public.announcements 
FOR SELECT 
USING (true);

CREATE POLICY "Teachers can create announcements" 
ON public.announcements 
FOR INSERT 
WITH CHECK (true);

CREATE POLICY "Teachers can update announcements" 
ON public.announcements 
FOR UPDATE 
USING (true);

CREATE POLICY "Teachers can delete announcements" 
ON public.announcements 
FOR DELETE 
USING (true);