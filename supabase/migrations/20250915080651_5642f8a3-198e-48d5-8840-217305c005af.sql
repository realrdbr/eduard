-- Fix RLS policies to work with custom authentication system

-- Create helper function to check if user is authenticated in custom system
CREATE OR REPLACE FUNCTION public.is_custom_user_authenticated()
RETURNS boolean
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = 'public'
AS $$
BEGIN
  RETURN get_current_user_id() IS NOT NULL;
END;
$$;

-- Fix user_themes table - allow users to see their own themes
DROP POLICY IF EXISTS "Users can view own themes" ON public.user_themes;
CREATE POLICY "Users can view own themes" 
ON public.user_themes 
FOR SELECT 
USING (user_id = get_current_user_id());

-- Fix teachers table - allow authenticated users to view teachers
DROP POLICY IF EXISTS "Authenticated users can view teachers" ON public.teachers;
CREATE POLICY "Authenticated users can view teachers" 
ON public.teachers 
FOR SELECT 
USING (is_custom_user_authenticated());

-- Fix document_analysis for AI access - allow authenticated users and admins
DROP POLICY IF EXISTS "Document owners and admins can view document analysis" ON public.document_analysis;
CREATE POLICY "Authenticated users can view document analysis" 
ON public.document_analysis 
FOR SELECT 
USING (
  uploaded_by = auth.uid() 
  OR is_custom_user_authenticated()
  OR EXISTS (
    SELECT 1 FROM permissions p 
    WHERE p.username = ((current_setting('request.jwt.claims'::text, true))::json ->> 'sub'::text) 
    AND p.permission_lvl >= 10
  )
);

-- Fix chat tables for AI functionality
DROP POLICY IF EXISTS "Users can view their own conversations" ON public.chat_conversations;
CREATE POLICY "Users can view their own conversations" 
ON public.chat_conversations 
FOR SELECT 
USING (
  user_id = (auth.uid())::text 
  OR is_custom_user_authenticated()
);

DROP POLICY IF EXISTS "Users can view messages in their conversations" ON public.chat_messages;
CREATE POLICY "Users can view messages in their conversations" 
ON public.chat_messages 
FOR SELECT 
USING (
  conversation_id IN (
    SELECT id FROM chat_conversations 
    WHERE user_id = (auth.uid())::text
  )
  OR is_custom_user_authenticated()
);