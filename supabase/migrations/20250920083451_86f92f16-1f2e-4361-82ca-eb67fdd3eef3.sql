-- Fix RLS policies for private_messages and private_conversations
-- The issue is that the current policies are too restrictive and don't properly handle session-based authentication

-- Drop existing policies and recreate them with proper session handling
DROP POLICY IF EXISTS "Users can view their conversations" ON private_conversations;
DROP POLICY IF EXISTS "Users can create conversations" ON private_conversations;  
DROP POLICY IF EXISTS "Users can update their conversations" ON private_conversations;

DROP POLICY IF EXISTS "Users can view messages in their conversations" ON private_messages;
DROP POLICY IF EXISTS "Users can send messages in their conversations" ON private_messages;
DROP POLICY IF EXISTS "Users can update their own messages" ON private_messages;

-- Recreate conversation policies with better session support
CREATE POLICY "Users can view their conversations" ON private_conversations
  FOR SELECT USING (
    (get_current_user_from_session() IS NOT NULL) AND 
    ((get_current_user_from_session() = user1_id) OR (get_current_user_from_session() = user2_id))
  );

CREATE POLICY "Users can create conversations" ON private_conversations
  FOR INSERT WITH CHECK (
    (get_current_user_from_session() IS NOT NULL) AND 
    ((get_current_user_from_session() = user1_id) OR (get_current_user_from_session() = user2_id))
  );

CREATE POLICY "Users can update their conversations" ON private_conversations
  FOR UPDATE USING (
    (get_current_user_from_session() IS NOT NULL) AND 
    ((get_current_user_from_session() = user1_id) OR (get_current_user_from_session() = user2_id))
  ) WITH CHECK (
    (get_current_user_from_session() IS NOT NULL) AND 
    ((get_current_user_from_session() = user1_id) OR (get_current_user_from_session() = user2_id))
  );

-- Recreate message policies with better session support
CREATE POLICY "Users can view messages in their conversations" ON private_messages
  FOR SELECT USING (
    (get_current_user_from_session() IS NOT NULL) AND 
    (EXISTS (
      SELECT 1 FROM private_conversations c
      WHERE c.id = private_messages.conversation_id
      AND ((c.user1_id = get_current_user_from_session()) OR (c.user2_id = get_current_user_from_session()))
    ))
  );

CREATE POLICY "Users can send messages in their conversations" ON private_messages
  FOR INSERT WITH CHECK (
    (get_current_user_from_session() IS NOT NULL) AND 
    (sender_id = get_current_user_from_session()) AND
    (EXISTS (
      SELECT 1 FROM private_conversations c
      WHERE c.id = private_messages.conversation_id
      AND ((c.user1_id = get_current_user_from_session()) OR (c.user2_id = get_current_user_from_session()))
    ))
  );

CREATE POLICY "Users can update messages in their conversations" ON private_messages
  FOR UPDATE USING (
    (get_current_user_from_session() IS NOT NULL) AND 
    (sender_id = get_current_user_from_session())
  ) WITH CHECK (
    (get_current_user_from_session() IS NOT NULL) AND 
    (sender_id = get_current_user_from_session())
  );