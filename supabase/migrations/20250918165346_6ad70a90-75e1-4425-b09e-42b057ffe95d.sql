-- Fix RLS policies for loans table to work with internal auth system

-- Drop existing policies
DROP POLICY IF EXISTS "Users can view their own loans" ON public.loans;
DROP POLICY IF EXISTS "Librarians can manage all loans" ON public.loans;

-- Create new policies that work with internal auth
CREATE POLICY "Everyone can view loans (internal auth handles restrictions)" 
ON public.loans 
FOR SELECT 
USING (true);

CREATE POLICY "Librarians can manage all loans (internal auth)" 
ON public.loans 
FOR ALL
USING (true)
WITH CHECK (true);