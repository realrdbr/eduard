-- Phase 1: Critical RLS Policy Fixes

-- 1. Remove overly permissive RLS policies on private_messages and private_conversations
DROP POLICY IF EXISTS "Users can view messages in their conversations" ON public.private_messages;
DROP POLICY IF EXISTS "Users can view their conversations" ON public.private_conversations;

-- 2. Create secure RLS policies for private messaging
CREATE POLICY "Users can view messages in their conversations - secure" 
ON public.private_messages 
FOR SELECT 
USING (
  get_current_user_from_session() IS NOT NULL 
  AND EXISTS (
    SELECT 1 FROM private_conversations c
    WHERE c.id = private_messages.conversation_id
    AND (c.user1_id = get_current_user_from_session() OR c.user2_id = get_current_user_from_session())
  )
);

CREATE POLICY "Users can view their conversations - secure" 
ON public.private_conversations 
FOR SELECT 
USING (
  get_current_user_from_session() IS NOT NULL 
  AND (user1_id = get_current_user_from_session() OR user2_id = get_current_user_from_session())
);

-- 3. Secure user_sessions table - users can only view their own sessions
DROP POLICY IF EXISTS "Users can view own sessions; admins can view all" ON public.user_sessions;

CREATE POLICY "Users can view own sessions only" 
ON public.user_sessions 
FOR SELECT 
USING (
  get_current_user_from_session() IS NOT NULL 
  AND user_id = get_current_user_from_session()
);

CREATE POLICY "Admins can view all sessions" 
ON public.user_sessions 
FOR SELECT 
USING (is_current_user_admin_secure());

-- 4. Secure loans table - borrowers and librarians only
DROP POLICY IF EXISTS "Everyone can view loans (internal auth handles restrictions)" ON public.loans;
DROP POLICY IF EXISTS "Librarians can manage all loans (internal auth)" ON public.loans;

CREATE POLICY "Users can view their own loans" 
ON public.loans 
FOR SELECT 
USING (
  get_current_user_from_session() IS NOT NULL 
  AND user_id = get_current_user_from_session()
);

CREATE POLICY "Librarians can view all loans" 
ON public.loans 
FOR SELECT 
USING (current_user_has_permission_level(6::smallint));

CREATE POLICY "Librarians can manage loans" 
ON public.loans 
FOR ALL 
USING (current_user_has_permission_level(6::smallint))
WITH CHECK (current_user_has_permission_level(6::smallint));

-- 5. Secure user_contacts - users can only access their own contacts
DROP POLICY IF EXISTS "Users can manage own contacts" ON public.user_contacts;
DROP POLICY IF EXISTS "Users can view own contacts" ON public.user_contacts;

CREATE POLICY "Users can manage own contacts only" 
ON public.user_contacts 
FOR ALL 
USING (
  get_current_user_from_session() IS NOT NULL 
  AND user_id = get_current_user_from_session()
)
WITH CHECK (
  get_current_user_from_session() IS NOT NULL 
  AND user_id = get_current_user_from_session()
);

-- 6. Add verify_password function for secure password checking
CREATE OR REPLACE FUNCTION public.verify_password(password_input text, hash_input text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  RETURN extensions.crypt(password_input, hash_input) = hash_input;
END;
$function$;