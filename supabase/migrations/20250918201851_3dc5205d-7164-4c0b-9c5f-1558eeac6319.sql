-- Fix security warnings for function search paths

-- Update get_or_create_conversation function with proper search_path
CREATE OR REPLACE FUNCTION public.get_or_create_conversation(other_user_id BIGINT)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
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
$$;

-- Update mark_messages_as_read function with proper search_path
CREATE OR REPLACE FUNCTION public.mark_messages_as_read(conversation_id_param UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
DECLARE
  current_user_id BIGINT;
BEGIN
  current_user_id := get_current_user_from_session();
  
  IF current_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;
  
  -- Update messages as read (only messages not sent by current user)
  UPDATE private_messages
  SET is_read = true
  WHERE conversation_id = conversation_id_param
    AND sender_id != current_user_id
    AND is_read = false;
END;
$$;

-- Update trigger function with proper search_path
CREATE OR REPLACE FUNCTION update_conversation_timestamp()
RETURNS TRIGGER 
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE private_conversations
  SET updated_at = NOW()
  WHERE id = NEW.conversation_id;
  RETURN NEW;
END;
$$;