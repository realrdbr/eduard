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

-- 6. Fix database functions - add proper search paths and input validation
CREATE OR REPLACE FUNCTION public.verify_user_login_secure(username_input text, password_input text)
RETURNS TABLE(user_id bigint, permission_level smallint, must_change_password boolean)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  user_record RECORD;
  login_success BOOLEAN := FALSE;
BEGIN
  -- Input validation
  IF username_input IS NULL OR trim(username_input) = '' THEN
    RAISE EXCEPTION 'Username cannot be empty';
  END IF;
  
  IF password_input IS NULL OR trim(password_input) = '' THEN
    RAISE EXCEPTION 'Password cannot be empty';
  END IF;

  -- Check brute force protection
  IF NOT check_brute_force_protection(username_input) THEN
    -- Log failed attempt
    PERFORM log_login_attempt(username_input, false);
    RAISE EXCEPTION 'Too many failed login attempts. Please try again later.';
  END IF;

  -- Get user record
  SELECT p.id, p.password, p.permission_lvl, p.must_change_password
  INTO user_record
  FROM permissions p 
  WHERE p.username = username_input;

  IF user_record.id IS NULL THEN
    -- Log failed attempt
    PERFORM log_login_attempt(username_input, false);
    RETURN;
  END IF;

  -- Verify password (handles both hashed and plain text)
  IF user_record.password LIKE '$2%' THEN
    -- Hashed password
    login_success := verify_password(password_input, user_record.password);
  ELSE
    -- Plain text password (legacy)
    login_success := (password_input = user_record.password);
  END IF;

  -- Log attempt
  PERFORM log_login_attempt(username_input, login_success);

  IF login_success THEN
    RETURN QUERY SELECT user_record.id, user_record.permission_lvl, user_record.must_change_password;
  END IF;
END;
$function$;

-- 7. Add verify_password function for secure password checking
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