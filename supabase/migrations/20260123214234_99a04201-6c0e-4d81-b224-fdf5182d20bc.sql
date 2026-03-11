-- =====================================================
-- SECURITY FIX MIGRATION
-- Addresses: permissions_public_readable, login_attempts_insufficient_protection, 
--            chat_conversations_auth_mismatch, security_definer_functions
-- =====================================================

-- 1. FIX: permissions table - Remove overly permissive SELECT policy
-- The current "Users can view basic public info" allows reading ALL fields including passwords
DROP POLICY IF EXISTS "Users can view basic public info" ON public.permissions;

-- Create a secure view for public user information (excludes sensitive fields)
CREATE OR REPLACE VIEW public.user_public_info_secure AS
SELECT 
  id,
  username,
  name,
  permission_lvl,
  user_class,
  created_at
FROM public.permissions;

-- Grant SELECT on the view to authenticated and anon roles
GRANT SELECT ON public.user_public_info_secure TO authenticated, anon;

-- Create restricted policies for permissions table
-- Users can only view their own record
CREATE POLICY "Users can view own record only"
ON public.permissions
FOR SELECT
USING (id = get_current_user_from_session());

-- Admins can view all records (for management purposes)
CREATE POLICY "Admins can view all permissions"
ON public.permissions
FOR SELECT
USING (is_current_user_admin_secure());

-- 2. FIX: login_attempts table - Restrict INSERT to service role only
-- Drop the current overly permissive INSERT policy
DROP POLICY IF EXISTS "System can insert login attempts" ON public.login_attempts;

-- Create a more restrictive INSERT policy that only allows service role
-- Since service role bypasses RLS, we use false for normal users
CREATE POLICY "Only service role can insert login attempts"
ON public.login_attempts
FOR INSERT
WITH CHECK (false);

-- 3. FIX: chat_conversations - Update policies to use custom auth
-- Drop auth.uid() based policies and replace with custom session auth
DROP POLICY IF EXISTS "Users can create their own conversations" ON public.chat_conversations;
DROP POLICY IF EXISTS "Users can delete their own conversations" ON public.chat_conversations;
DROP POLICY IF EXISTS "Users can update their own conversations" ON public.chat_conversations;
DROP POLICY IF EXISTS "Users can view their own conversations" ON public.chat_conversations;

-- Create new policies using the custom session system
-- Note: chat_conversations.user_id is TEXT type storing the profile_id as string
CREATE POLICY "Users can view their own conversations via session"
ON public.chat_conversations
FOR SELECT
USING (
  get_current_user_from_session() IS NOT NULL 
  AND user_id = get_current_user_from_session()::text
);

CREATE POLICY "Users can create their own conversations via session"
ON public.chat_conversations
FOR INSERT
WITH CHECK (
  get_current_user_from_session() IS NOT NULL 
  AND user_id = get_current_user_from_session()::text
);

CREATE POLICY "Users can update their own conversations via session"
ON public.chat_conversations
FOR UPDATE
USING (
  get_current_user_from_session() IS NOT NULL 
  AND user_id = get_current_user_from_session()::text
)
WITH CHECK (
  get_current_user_from_session() IS NOT NULL 
  AND user_id = get_current_user_from_session()::text
);

CREATE POLICY "Users can delete their own conversations via session"
ON public.chat_conversations
FOR DELETE
USING (
  get_current_user_from_session() IS NOT NULL 
  AND user_id = get_current_user_from_session()::text
);

-- 4. FIX: chat_messages - Update policies to use custom auth
DROP POLICY IF EXISTS "Users can create messages in their conversations" ON public.chat_messages;
DROP POLICY IF EXISTS "Users can delete messages in their conversations" ON public.chat_messages;
DROP POLICY IF EXISTS "Users can update messages in their conversations" ON public.chat_messages;
DROP POLICY IF EXISTS "Users can view messages in their conversations" ON public.chat_messages;

CREATE POLICY "Users can view messages in their conversations via session"
ON public.chat_messages
FOR SELECT
USING (
  get_current_user_from_session() IS NOT NULL 
  AND conversation_id IN (
    SELECT id FROM public.chat_conversations 
    WHERE user_id = get_current_user_from_session()::text
  )
);

CREATE POLICY "Users can create messages in their conversations via session"
ON public.chat_messages
FOR INSERT
WITH CHECK (
  get_current_user_from_session() IS NOT NULL 
  AND conversation_id IN (
    SELECT id FROM public.chat_conversations 
    WHERE user_id = get_current_user_from_session()::text
  )
);

CREATE POLICY "Users can update messages in their conversations via session"
ON public.chat_messages
FOR UPDATE
USING (
  get_current_user_from_session() IS NOT NULL 
  AND conversation_id IN (
    SELECT id FROM public.chat_conversations 
    WHERE user_id = get_current_user_from_session()::text
  )
)
WITH CHECK (
  get_current_user_from_session() IS NOT NULL 
  AND conversation_id IN (
    SELECT id FROM public.chat_conversations 
    WHERE user_id = get_current_user_from_session()::text
  )
);

CREATE POLICY "Users can delete messages in their conversations via session"
ON public.chat_messages
FOR DELETE
USING (
  get_current_user_from_session() IS NOT NULL 
  AND conversation_id IN (
    SELECT id FROM public.chat_conversations 
    WHERE user_id = get_current_user_from_session()::text
  )
);

-- 5. Create a secure session ownership validation function
-- This validates that a session belongs to a specific user
CREATE OR REPLACE FUNCTION public.validate_session_ownership(
  v_session_id uuid,
  expected_user_id bigint
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  actual_user_id bigint;
BEGIN
  -- Get the user_id from the session
  SELECT user_id INTO actual_user_id
  FROM public.user_sessions
  WHERE id = v_session_id
    AND is_active = true
    AND updated_at > NOW() - INTERVAL '24 hours';
  
  -- Return true only if session exists and belongs to expected user
  RETURN actual_user_id IS NOT NULL AND actual_user_id = expected_user_id;
END;
$$;

-- 6. Create improved admin_change_user_password that validates session ownership
CREATE OR REPLACE FUNCTION public.admin_change_user_password_secure(
  v_session_id uuid,
  target_user_id bigint,
  new_password text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  admin_user_id bigint;
  admin_permission_lvl smallint;
  hashed_password text;
BEGIN
  -- Resolve admin from session
  SELECT user_id INTO admin_user_id
  FROM public.user_sessions
  WHERE id = v_session_id
    AND is_active = true
    AND updated_at > NOW() - INTERVAL '24 hours';
  
  IF admin_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Invalid or expired session');
  END IF;
  
  -- Get admin permission level
  SELECT permission_lvl INTO admin_permission_lvl
  FROM public.permissions
  WHERE id = admin_user_id;
  
  IF admin_permission_lvl IS NULL OR admin_permission_lvl < 10 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Insufficient permissions - Level 10 required');
  END IF;
  
  -- Hash the new password using the existing hash_password function
  hashed_password := hash_password(new_password);
  
  -- Update the target user's password
  UPDATE public.permissions
  SET password = hashed_password, must_change_password = true
  WHERE id = target_user_id;
  
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Target user not found');
  END IF;
  
  -- Invalidate all sessions for the target user (force re-login)
  UPDATE public.user_sessions
  SET is_active = false
  WHERE user_id = target_user_id;
  
  RETURN jsonb_build_object('success', true, 'message', 'Password changed successfully');
END;
$$;

-- 7. Create a secure function to resolve session and get full actor info
CREATE OR REPLACE FUNCTION public.get_actor_from_session_secure(
  v_session_id uuid
)
RETURNS TABLE(
  id bigint,
  username text,
  name text,
  permission_lvl smallint,
  user_class text,
  keycard_number text,
  keycard_active boolean
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  resolved_user_id bigint;
BEGIN
  -- Resolve user from session
  SELECT us.user_id INTO resolved_user_id
  FROM public.user_sessions us
  WHERE us.id = v_session_id
    AND us.is_active = true
    AND us.updated_at > NOW() - INTERVAL '24 hours';
  
  IF resolved_user_id IS NULL THEN
    RETURN;
  END IF;
  
  -- Return actor info (excluding password)
  RETURN QUERY
  SELECT 
    p.id,
    p.username,
    p.name,
    p.permission_lvl,
    p.user_class,
    p.keycard_number,
    p.keycard_active
  FROM public.permissions p
  WHERE p.id = resolved_user_id;
END;
$$;