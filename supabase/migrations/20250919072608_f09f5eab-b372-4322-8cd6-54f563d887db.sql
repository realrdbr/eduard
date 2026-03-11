-- Create a function to get or create a conversation between two users
CREATE OR REPLACE FUNCTION public.get_or_create_conversation(
  other_user_id bigint
)
RETURNS uuid AS $$
DECLARE
  current_user_id BIGINT;
  conversation_id UUID;
  user1_id BIGINT;
  user2_id BIGINT;
BEGIN
  current_user_id := get_current_user_from_session();
  
  IF current_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;
  
  -- Ensure consistent ordering (smaller ID first)
  IF current_user_id < other_user_id THEN
    user1_id := current_user_id;
    user2_id := other_user_id;
  ELSE
    user1_id := other_user_id;
    user2_id := current_user_id;
  END IF;
  
  -- Try to get existing conversation
  SELECT id INTO conversation_id
  FROM private_conversations
  WHERE user1_id = user1_id AND user2_id = user2_id;
  
  -- Create if doesn't exist
  IF conversation_id IS NULL THEN
    INSERT INTO private_conversations (user1_id, user2_id)
    VALUES (user1_id, user2_id)
    RETURNING id INTO conversation_id;
  END IF;
  
  RETURN conversation_id;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public;