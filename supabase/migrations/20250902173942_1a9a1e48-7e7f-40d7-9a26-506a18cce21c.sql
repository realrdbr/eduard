-- Ensure the ai-actions edge function can access schedule tables
-- Add RLS policies for schedule tables to allow service role access

-- For Stundenplan_10b_A
CREATE POLICY "Allow service role access to schedule 10b_A" 
ON public."Stundenplan_10b_A" 
FOR ALL 
TO service_role 
USING (true) 
WITH CHECK (true);

-- For Stundenplan_10c_A
CREATE POLICY "Allow service role access to schedule 10c_A" 
ON public."Stundenplan_10c_A" 
FOR ALL 
TO service_role 
USING (true) 
WITH CHECK (true);

-- For teachers table
CREATE POLICY "Allow service role access to teachers" 
ON public.teachers 
FOR ALL 
TO service_role 
USING (true) 
WITH CHECK (true);