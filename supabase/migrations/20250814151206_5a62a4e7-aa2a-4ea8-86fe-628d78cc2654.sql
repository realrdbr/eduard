-- Fix RLS policies for vertretungsplan table
DROP POLICY IF EXISTS "Teachers can create substitutions" ON public.vertretungsplan;
DROP POLICY IF EXISTS "Teachers can update their substitutions" ON public.vertretungsplan;
DROP POLICY IF EXISTS "Teachers can delete substitutions" ON public.vertretungsplan;

-- Create fixed policies that don't cause recursive lookup
CREATE POLICY "Teachers can create substitutions" 
ON public.vertretungsplan 
FOR INSERT 
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.profiles p 
    LEFT JOIN public.permissions perm ON p.permission_id = perm.id 
    WHERE p.user_id = auth.uid() AND perm.permission_lvl >= 5
  )
);

CREATE POLICY "Teachers can update substitutions" 
ON public.vertretungsplan 
FOR UPDATE 
USING (
  EXISTS (
    SELECT 1 FROM public.profiles p 
    LEFT JOIN public.permissions perm ON p.permission_id = perm.id 
    WHERE p.user_id = auth.uid() AND perm.permission_lvl >= 5
  )
);

CREATE POLICY "Teachers can delete substitutions" 
ON public.vertretungsplan 
FOR DELETE 
USING (
  EXISTS (
    SELECT 1 FROM public.profiles p 
    LEFT JOIN public.permissions perm ON p.permission_id = perm.id 
    WHERE p.user_id = auth.uid() AND perm.permission_lvl >= 5
  )
);