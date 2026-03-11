-- Fix RLS policies for books table to ensure proper deletion
-- Drop existing policies and recreate them with proper session-based permission checking

DROP POLICY IF EXISTS "Everyone can view books" ON public.books;
DROP POLICY IF EXISTS "Librarians can manage books" ON public.books;

-- Create new policies with better session handling
CREATE POLICY "Everyone can view books" 
ON public.books 
FOR SELECT 
USING (true);

CREATE POLICY "Librarians can manage books - select"
ON public.books 
FOR SELECT 
USING (current_user_has_permission_level(6::smallint));

CREATE POLICY "Librarians can manage books - insert"
ON public.books 
FOR INSERT 
WITH CHECK (current_user_has_permission_level(6::smallint));

CREATE POLICY "Librarians can manage books - update"
ON public.books 
FOR UPDATE 
USING (current_user_has_permission_level(6::smallint))
WITH CHECK (current_user_has_permission_level(6::smallint));

CREATE POLICY "Librarians can manage books - delete"
ON public.books 
FOR DELETE 
USING (current_user_has_permission_level(6::smallint));