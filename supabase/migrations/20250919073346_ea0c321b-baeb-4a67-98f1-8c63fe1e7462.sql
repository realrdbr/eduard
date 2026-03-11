-- Fix ambiguous column references in get_or_create_conversation
CREATE OR REPLACE FUNCTION public.get_or_create_conversation(
  other_user_id bigint
)
RETURNS uuid AS $$
DECLARE
  current_user_id BIGINT;
  conversation_id UUID;
  u1 BIGINT;
  u2 BIGINT;
BEGIN
  current_user_id := get_current_user_from_session();
  
  IF current_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;
  
  -- Ensure consistent ordering (smaller ID first)
  IF current_user_id < other_user_id THEN
    u1 := current_user_id;
    u2 := other_user_id;
  ELSE
    u1 := other_user_id;
    u2 := current_user_id;
  END IF;
  
  -- Try to get existing conversation with qualified column references
  SELECT c.id INTO conversation_id
  FROM private_conversations c
  WHERE c.user1_id = u1 AND c.user2_id = u2
  LIMIT 1;
  
  -- Create if doesn't exist
  IF conversation_id IS NULL THEN
    INSERT INTO private_conversations (user1_id, user2_id)
    VALUES (u1, u2)
    RETURNING id INTO conversation_id;
  END IF;
  
  RETURN conversation_id;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public;