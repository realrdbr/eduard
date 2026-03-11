-- Fix RLS policies for private messages and conversations
-- Drop existing problematic policies
DROP POLICY IF EXISTS "Users can view messages in their conversations" ON private_messages;
DROP POLICY IF EXISTS "Users can send messages in their conversations" ON private_messages;
DROP POLICY IF EXISTS "Users can update messages in their conversations" ON private_messages;

DROP POLICY IF EXISTS "Users can view their conversations" ON private_conversations;
DROP POLICY IF EXISTS "Users can create conversations" ON private_conversations;
DROP POLICY IF EXISTS "Users can update their conversations" ON private_conversations;

-- Create proper RLS policies for private_messages
CREATE POLICY "Users can view messages in their conversations"
ON private_messages FOR SELECT
USING (
  get_current_user_from_session() IS NOT NULL 
  AND EXISTS (
    SELECT 1 FROM private_conversations c
    WHERE c.id = private_messages.conversation_id
    AND (c.user1_id = get_current_user_from_session() OR c.user2_id = get_current_user_from_session())
  )
);

CREATE POLICY "Users can send messages in their conversations"
ON private_messages FOR INSERT
WITH CHECK (
  get_current_user_from_session() IS NOT NULL 
  AND sender_id = get_current_user_from_session()
  AND EXISTS (
    SELECT 1 FROM private_conversations c
    WHERE c.id = private_messages.conversation_id
    AND (c.user1_id = get_current_user_from_session() OR c.user2_id = get_current_user_from_session())
  )
);

CREATE POLICY "Users can update their own messages"
ON private_messages FOR UPDATE
USING (
  get_current_user_from_session() IS NOT NULL 
  AND sender_id = get_current_user_from_session()
)
WITH CHECK (
  get_current_user_from_session() IS NOT NULL 
  AND sender_id = get_current_user_from_session()
);

-- Create proper RLS policies for private_conversations
CREATE POLICY "Users can view their conversations"
ON private_conversations FOR SELECT
USING (
  get_current_user_from_session() IS NOT NULL 
  AND (user1_id = get_current_user_from_session() OR user2_id = get_current_user_from_session())
);

CREATE POLICY "Users can create conversations"
ON private_conversations FOR INSERT
WITH CHECK (
  get_current_user_from_session() IS NOT NULL 
  AND (user1_id = get_current_user_from_session() OR user2_id = get_current_user_from_session())
);

CREATE POLICY "Users can update their conversations"
ON private_conversations FOR UPDATE
USING (
  get_current_user_from_session() IS NOT NULL 
  AND (user1_id = get_current_user_from_session() OR user2_id = get_current_user_from_session())
)
WITH CHECK (
  get_current_user_from_session() IS NOT NULL 
  AND (user1_id = get_current_user_from_session() OR user2_id = get_current_user_from_session())
);

-- Fix the loans table foreign key relationship
-- First, let's check if we need to fix the foreign key for loans table
ALTER TABLE loans DROP CONSTRAINT IF EXISTS loans_user_id_fkey;
ALTER TABLE loans ADD CONSTRAINT loans_user_id_fkey 
  FOREIGN KEY (user_id) REFERENCES permissions(id) ON DELETE CASCADE;