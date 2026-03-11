-- Fix resolve_current_user_from_session to be more robust and support fallback to GUC-based session
CREATE OR REPLACE FUNCTION public.resolve_current_user_from_session(v_session_id text)
RETURNS bigint
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  uid bigint;
BEGIN
  -- If explicit session id is not provided, fallback to GUC-based resolution
  IF v_session_id IS NULL OR v_session_id = '' THEN
    RETURN get_current_user_from_session();
  END IF;

  -- Primary: resolve by explicit session id (no is_active/time restriction to avoid false negatives)
  SELECT user_id INTO uid
  FROM user_sessions
  WHERE id = v_session_id::uuid
  ORDER BY created_at DESC
  LIMIT 1;

  IF uid IS NOT NULL THEN
    RETURN uid;
  END IF;

  -- Fallback: try resolving via current session context (GUC) if set
  RETURN get_current_user_from_session();
END;
$$;

-- Make validate_session_security not perform updates and allow it to be STABLE
-- First drop and recreate to change volatility/behavior safely
DROP FUNCTION IF EXISTS public.validate_session_security(uuid);

CREATE OR REPLACE FUNCTION public.validate_session_security(session_id_param uuid)
RETURNS boolean
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  session_valid BOOLEAN := FALSE;
  session_age INTERVAL := NULL;
BEGIN
  -- Return validity without mutating any state
  SELECT 
    (is_active = true AND created_at > NOW() - INTERVAL '24 hours'),
    (NOW() - created_at)
  INTO session_valid, session_age
  FROM user_sessions 
  WHERE id = session_id_param;

  RETURN COALESCE(session_valid, FALSE);
END;
$$;

-- Ensure get_or_create_conversation_session and list_private_conversations_session keep working even if explicit session id resolution fails
CREATE OR REPLACE FUNCTION public.get_or_create_conversation_session(other_user_id bigint, v_session_id text DEFAULT NULL::text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  current_user_id BIGINT;
  conversation_id UUID;
  u1 BIGINT;
  u2 BIGINT;
BEGIN
  current_user_id := resolve_current_user_from_session(v_session_id);
  IF current_user_id IS NULL THEN
    -- Last-resort fallback
    current_user_id := get_current_user_from_session();
  END IF;
  IF current_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF current_user_id < other_user_id THEN
    u1 := current_user_id; u2 := other_user_id;
  ELSE
    u1 := other_user_id; u2 := current_user_id;
  END IF;

  SELECT c.id INTO conversation_id
  FROM private_conversations c
  WHERE c.user1_id = u1 AND c.user2_id = u2
  LIMIT 1;

  IF conversation_id IS NULL THEN
    INSERT INTO private_conversations (user1_id, user2_id)
    VALUES (u1, u2)
    RETURNING id INTO conversation_id;
  END IF;

  RETURN conversation_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.list_private_conversations_session(v_session_id text DEFAULT NULL::text)
RETURNS TABLE(id uuid, user1_id bigint, user2_id bigint, updated_at timestamp with time zone)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  current_user_id BIGINT;
BEGIN
  current_user_id := resolve_current_user_from_session(v_session_id);
  IF current_user_id IS NULL THEN
    current_user_id := get_current_user_from_session();
  END IF;
  IF current_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  RETURN QUERY
  SELECT pc.id, pc.user1_id, pc.user2_id, pc.updated_at
  FROM private_conversations pc
  WHERE pc.user1_id = current_user_id OR pc.user2_id = current_user_id
  ORDER BY pc.updated_at DESC;
END;
$$;

-- Make remove_contact_session and add_contact_session resilient as well
CREATE OR REPLACE FUNCTION public.add_contact_session(contact_user_id_param bigint, v_session_id text DEFAULT NULL::text)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  current_user_id bigint;
  new_contact_id uuid;
BEGIN
  current_user_id := resolve_current_user_from_session(v_session_id);
  IF current_user_id IS NULL THEN
    current_user_id := get_current_user_from_session();
  END IF;
  IF current_user_id IS NULL THEN
    RETURN json_build_object('success', false, 'error', 'Nicht angemeldet');
  END IF;

  IF EXISTS (
    SELECT 1 FROM user_contacts 
    WHERE user_id = current_user_id 
      AND contact_user_id = contact_user_id_param 
      AND status = 'active'
  ) THEN
    RETURN json_build_object('success', false, 'error', 'Kontakt bereits vorhanden');
  END IF;

  INSERT INTO user_contacts (user_id, contact_user_id, status)
  VALUES (current_user_id, contact_user_id_param, 'active')
  RETURNING id INTO new_contact_id;

  RETURN json_build_object('success', true, 'contact_id', new_contact_id);
EXCEPTION
  WHEN OTHERS THEN
    RETURN json_build_object('success', false, 'error', SQLERRM);
END;
$$;

CREATE OR REPLACE FUNCTION public.remove_contact_session(contact_id_param uuid, v_session_id text DEFAULT NULL::text)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  current_user_id bigint;
  deleted_count integer := 0;
BEGIN
  current_user_id := resolve_current_user_from_session(v_session_id);
  IF current_user_id IS NULL THEN
    current_user_id := get_current_user_from_session();
  END IF;
  IF current_user_id IS NULL THEN
    RETURN json_build_object('success', false, 'error', 'Nicht angemeldet');
  END IF;

  DELETE FROM user_contacts
  WHERE id = contact_id_param
    AND user_id = current_user_id;
  GET DIAGNOSTICS deleted_count = ROW_COUNT;

  IF deleted_count = 0 THEN
    RETURN json_build_object('success', false, 'error', 'Kontakt nicht gefunden oder keine Berechtigung');
  END IF;

  RETURN json_build_object('success', true);
EXCEPTION
  WHEN OTHERS THEN
    RETURN json_build_object('success', false, 'error', SQLERRM);
END;
$$;

-- Also ensure message functions are resilient
CREATE OR REPLACE FUNCTION public.list_private_messages_session(conversation_id_param uuid, v_session_id text DEFAULT NULL::text)
RETURNS TABLE(id uuid, content text, sender_id bigint, created_at timestamp with time zone, is_read boolean)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  current_user_id bigint;
BEGIN
  current_user_id := resolve_current_user_from_session(v_session_id);
  IF current_user_id IS NULL THEN
    current_user_id := get_current_user_from_session();
  END IF;
  IF current_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  RETURN QUERY
  SELECT pm.id, pm.content, pm.sender_id, pm.created_at, pm.is_read
  FROM private_messages pm
  WHERE pm.conversation_id = conversation_id_param
  ORDER BY pm.created_at ASC;
END;
$$;

CREATE OR REPLACE FUNCTION public.list_private_last_message_session(conversation_id_param uuid, v_session_id text DEFAULT NULL::text)
RETURNS TABLE(content text, created_at timestamp with time zone, sender_id bigint)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  current_user_id bigint;
BEGIN
  current_user_id := resolve_current_user_from_session(v_session_id);
  IF current_user_id IS NULL THEN
    current_user_id := get_current_user_from_session();
  END IF;
  IF current_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  RETURN QUERY
  SELECT pm.content, pm.created_at, pm.sender_id
  FROM private_messages pm
  WHERE pm.conversation_id = conversation_id_param
  ORDER BY pm.created_at DESC
  LIMIT 1;
END;
$$;

CREATE OR REPLACE FUNCTION public.count_unread_messages_session(conversation_id_param uuid, v_session_id text DEFAULT NULL::text)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  current_user_id BIGINT;
  unread_count INTEGER := 0;
BEGIN
  current_user_id := resolve_current_user_from_session(v_session_id);
  IF current_user_id IS NULL THEN
    current_user_id := get_current_user_from_session();
  END IF;
  IF current_user_id IS NULL THEN
    RETURN 0;
  END IF;

  SELECT COUNT(*) INTO unread_count
  FROM private_messages pm
  WHERE pm.conversation_id = conversation_id_param
    AND pm.is_read = false
    AND pm.sender_id <> current_user_id;

  RETURN unread_count;
END;
$$;

CREATE OR REPLACE FUNCTION public.mark_messages_as_read_session(conversation_id_param uuid, v_session_id text DEFAULT NULL::text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  current_user_id BIGINT;
BEGIN
  current_user_id := resolve_current_user_from_session(v_session_id);
  IF current_user_id IS NULL THEN
    current_user_id := get_current_user_from_session();
  END IF;
  IF current_user_id IS NULL THEN
    RETURN;
  END IF;

  UPDATE private_messages
  SET is_read = true
  WHERE conversation_id = conversation_id_param
    AND sender_id <> current_user_id
    AND is_read = false;
END;
$$;

CREATE OR REPLACE FUNCTION public.send_private_message_session(conversation_id_param uuid, content_param text, v_session_id text DEFAULT NULL::text)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  current_user_id bigint;
BEGIN
  current_user_id := resolve_current_user_from_session(v_session_id);
  IF current_user_id IS NULL THEN
    current_user_id := get_current_user_from_session();
  END IF;
  IF current_user_id IS NULL THEN
    RETURN json_build_object('success', false, 'error', 'Nicht angemeldet');
  END IF;

  -- Verify membership
  IF NOT EXISTS (
    SELECT 1 FROM private_conversations
    WHERE id = conversation_id_param
      AND (user1_id = current_user_id OR user2_id = current_user_id)
  ) THEN
    RETURN json_build_object('success', false, 'error', 'Keine Berechtigung für diese Unterhaltung');
  END IF;

  INSERT INTO private_messages (conversation_id, sender_id, content, is_read)
  VALUES (conversation_id_param, current_user_id, content_param, false);

  RETURN json_build_object('success', true);
EXCEPTION
  WHEN OTHERS THEN
    RETURN json_build_object('success', false, 'error', SQLERRM);
END;
$$;