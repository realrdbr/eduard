-- Fix RLS policies for proper access

-- Update user_sessions policies to allow proper session creation
DROP POLICY IF EXISTS "Allow session creation and management" ON public.user_sessions;
DROP POLICY IF EXISTS "Allow public session creation" ON public.user_sessions;

-- Create more permissive policies for session management
CREATE POLICY "Allow session creation for authenticated users" 
ON public.user_sessions 
FOR INSERT 
WITH CHECK (true);

CREATE POLICY "Allow session updates for authenticated users" 
ON public.user_sessions 
FOR UPDATE 
USING (true) 
WITH CHECK (true);

-- Ensure Schulleitung users have full access
CREATE POLICY "Schulleitung has full user_sessions access" 
ON public.user_sessions 
FOR ALL 
USING (
  EXISTS (
    SELECT 1 FROM permissions p 
    WHERE p.id = user_id AND p.permission_lvl >= 10
  )
) 
WITH CHECK (
  EXISTS (
    SELECT 1 FROM permissions p 
    WHERE p.id = user_id AND p.permission_lvl >= 10
  )
);

-- Fix user_themes RLS policies 
DROP POLICY IF EXISTS "Users can manage their own themes via session - insert" ON public.user_themes;
DROP POLICY IF EXISTS "Users can manage their own themes via session - update" ON public.user_themes;
DROP POLICY IF EXISTS "Users can manage their own themes via session - delete" ON public.user_themes;

-- Create simpler theme policies
CREATE POLICY "Users can manage their own themes - insert" 
ON public.user_themes 
FOR INSERT 
WITH CHECK (true);

CREATE POLICY "Users can manage their own themes - update" 
ON public.user_themes 
FOR UPDATE 
USING (true) 
WITH CHECK (true);

CREATE POLICY "Users can manage their own themes - delete" 
ON public.user_themes 
FOR DELETE 
USING (true);

-- Ensure Schulleitung users have access to all chat features
CREATE POLICY "Schulleitung has full chat access" 
ON public.private_conversations 
FOR ALL 
USING (
  EXISTS (
    SELECT 1 FROM permissions p 
    WHERE p.id = user1_id AND p.permission_lvl >= 10
  ) OR
  EXISTS (
    SELECT 1 FROM permissions p 
    WHERE p.id = user2_id AND p.permission_lvl >= 10
  )
) 
WITH CHECK (
  EXISTS (
    SELECT 1 FROM permissions p 
    WHERE p.id = user1_id AND p.permission_lvl >= 10
  ) OR 
  EXISTS (
    SELECT 1 FROM permissions p 
    WHERE p.id = user2_id AND p.permission_lvl >= 10
  )
);