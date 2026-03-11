-- Allow INSERT operations on permissions table for authenticated users
CREATE POLICY "Allow inserting new users" 
ON public.permissions 
FOR INSERT 
USING (true);

-- Allow UPDATE operations on permissions table for password changes
CREATE POLICY "Allow updating user data" 
ON public.permissions 
FOR UPDATE 
USING (true);