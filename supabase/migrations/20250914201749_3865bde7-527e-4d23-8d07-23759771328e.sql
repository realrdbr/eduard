-- Fix critical security vulnerabilities in RLS policies

-- 1. Fix document_analysis table - restrict public access to sensitive documents
DROP POLICY IF EXISTS "Everyone can view document analysis" ON public.document_analysis;

-- Only allow document owners and admin-level users (level 10+) to view document analysis
CREATE POLICY "Document owners and admins can view document analysis" 
ON public.document_analysis 
FOR SELECT 
USING (
  uploaded_by = auth.uid() 
  OR EXISTS (
    SELECT 1 FROM permissions p 
    WHERE p.username = ((current_setting('request.jwt.claims'::text, true))::json ->> 'sub'::text) 
    AND p.permission_lvl >= 10
  )
);

-- 2. Fix teachers table - restrict access to personal information
DROP POLICY IF EXISTS "Everyone can view teachers" ON public.teachers;

-- Only allow authenticated users to view teacher information
CREATE POLICY "Authenticated users can view teachers" 
ON public.teachers 
FOR SELECT 
USING (
  EXISTS (
    SELECT 1 FROM permissions p 
    WHERE p.username = ((current_setting('request.jwt.claims'::text, true))::json ->> 'sub'::text)
  )
);

-- 3. Ensure user_sessions has proper isolation (strengthen existing policy)
DROP POLICY IF EXISTS "Users can view their own sessions" ON public.user_sessions;
DROP POLICY IF EXISTS "Users can view own sessions only" ON public.user_sessions;

-- Create single, clear policy for session access
CREATE POLICY "Users can only access their own sessions" 
ON public.user_sessions 
FOR ALL
USING (user_id = get_current_user_id())
WITH CHECK (user_id = get_current_user_id());

-- 4. Add additional security to login_attempts - ensure only system and admins can access
ALTER TABLE public.login_attempts ENABLE ROW LEVEL SECURITY;

-- Allow system to insert and admins to view (policy already exists, but ensure it's correct)
DROP POLICY IF EXISTS "System can log login attempts" ON public.login_attempts;
DROP POLICY IF EXISTS "Admins can view login attempts" ON public.login_attempts;

CREATE POLICY "System can log login attempts" 
ON public.login_attempts 
FOR INSERT 
WITH CHECK (true);

CREATE POLICY "Only admins can view login attempts" 
ON public.login_attempts 
FOR SELECT 
USING (is_current_user_admin_safe());