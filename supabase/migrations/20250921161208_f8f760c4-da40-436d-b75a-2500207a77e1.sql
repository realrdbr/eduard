-- Session-safe wrappers and helpers for chats and keycard resolution

-- 1) Get or create conversation with session context
CREATE OR REPLACE FUNCTION public.get_or_create_conversation_session(
  other_user_id BIGINT,
  v_session_id TEXT DEFAULT NULL
) RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  current_user_id BIGINT;
  conversation_id UUID;
  u1 BIGINT;
  u2 BIGINT;
BEGIN
  IF v_session_id IS NOT NULL AND v_session_id <> '' THEN
    PERFORM set_config('app.current_session_id', v_session_id, true);
  END IF;

  current_user_id := get_current_user_from_session();
  IF current_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF current_user_id < other_user_id THEN
    u1 := current_user_id;
    u2 := other_user_id;
  ELSE
    u1 := other_user_id;
    u2 := current_user_id;
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

-- 2) List messages with session context
CREATE OR REPLACE FUNCTION public.list_private_messages_session(
  conversation_id_param UUID,
  v_session_id TEXT DEFAULT NULL
) RETURNS TABLE(
  id UUID,
  content TEXT,
  sender_id BIGINT,
  created_at TIMESTAMPTZ,
  is_read BOOLEAN
) LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF v_session_id IS NOT NULL AND v_session_id <> '' THEN
    PERFORM set_config('app.current_session_id', v_session_id, true);
  END IF;

  RETURN QUERY
  SELECT pm.id, pm.content, pm.sender_id, pm.created_at, pm.is_read
  FROM private_messages pm
  WHERE pm.conversation_id = conversation_id_param
  ORDER BY pm.created_at ASC;
END;
$$;

-- 3) List conversations for current user with session context
CREATE OR REPLACE FUNCTION public.list_private_conversations_session(
  v_session_id TEXT DEFAULT NULL
) RETURNS TABLE(
  id UUID,
  user1_id BIGINT,
  user2_id BIGINT,
  updated_at TIMESTAMPTZ
) LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  current_user_id BIGINT;
BEGIN
  IF v_session_id IS NOT NULL AND v_session_id <> '' THEN
    PERFORM set_config('app.current_session_id', v_session_id, true);
  END IF;

  current_user_id := get_current_user_from_session();
  IF current_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  RETURN QUERY
  SELECT id, user1_id, user2_id, updated_at
  FROM private_conversations
  WHERE user1_id = current_user_id OR user2_id = current_user_id
  ORDER BY updated_at DESC;
END;
$$;

-- 4) Last message of a conversation
CREATE OR REPLACE FUNCTION public.list_private_last_message_session(
  conversation_id_param UUID,
  v_session_id TEXT DEFAULT NULL
) RETURNS TABLE(
  content TEXT,
  created_at TIMESTAMPTZ,
  sender_id BIGINT
) LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF v_session_id IS NOT NULL AND v_session_id <> '' THEN
    PERFORM set_config('app.current_session_id', v_session_id, true);
  END IF;

  RETURN QUERY
  SELECT pm.content, pm.created_at, pm.sender_id
  FROM private_messages pm
  WHERE pm.conversation_id = conversation_id_param
  ORDER BY pm.created_at DESC
  LIMIT 1;
END;
$$;

-- 5) Count unread messages (not sent by current user)
CREATE OR REPLACE FUNCTION public.count_unread_messages_session(
  conversation_id_param UUID,
  v_session_id TEXT DEFAULT NULL
) RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  current_user_id BIGINT;
  unread_count INTEGER := 0;
BEGIN
  IF v_session_id IS NOT NULL AND v_session_id <> '' THEN
    PERFORM set_config('app.current_session_id', v_session_id, true);
  END IF;

  current_user_id := get_current_user_from_session();
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

-- 6) Mark messages as read with session context
CREATE OR REPLACE FUNCTION public.mark_messages_as_read_session(
  conversation_id_param UUID,
  v_session_id TEXT DEFAULT NULL
) RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF v_session_id IS NOT NULL AND v_session_id <> '' THEN
    PERFORM set_config('app.current_session_id', v_session_id, true);
  END IF;

  PERFORM public.mark_messages_as_read(conversation_id_param);
END;
$$;

-- 7) Resolve keycards to names for librarian views
CREATE OR REPLACE FUNCTION public.resolve_keycards_to_names(
  keycards TEXT[],
  v_session_id TEXT DEFAULT NULL
) RETURNS TABLE(
  keycard_number TEXT,
  name TEXT
) LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Session context optional here; function is SECURITY DEFINER and only returns minimal fields
  RETURN QUERY
  SELECT p.keycard_number, p.name
  FROM permissions p
  WHERE p.keycard_number = ANY(keycards);
END;
$$;