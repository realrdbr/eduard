-- Allow INSERT operations on permissions table 
CREATE POLICY "Allow inserting new users" 
ON public.permissions 
FOR INSERT 
WITH CHECK (true);

-- Allow UPDATE operations on permissions table for password changes
CREATE POLICY "Allow updating user data" 
ON public.permissions 
FOR UPDATE 
USING (true);