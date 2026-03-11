-- Fix critical security issues

-- 1. Fix permissions table RLS - remove public access to passwords
DROP POLICY IF EXISTS "Everyone can view permissions" ON permissions;
DROP POLICY IF EXISTS "Allow inserting new users" ON permissions;
DROP POLICY IF EXISTS "Allow updating user data" ON permissions;

-- Create secure RLS policies for permissions table
CREATE POLICY "Users can view their own permission level only"
ON permissions FOR SELECT
USING (
  id = (
    SELECT permission_id 
    FROM profiles 
    WHERE user_id = auth.uid()
  )
);

CREATE POLICY "School admins can view all permissions"
ON permissions FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM profiles p
    LEFT JOIN permissions perm ON p.permission_id = perm.id
    WHERE p.user_id = auth.uid() AND perm.permission_lvl >= 10
  )
);

CREATE POLICY "School admins can manage permissions"
ON permissions FOR ALL
USING (
  EXISTS (
    SELECT 1 FROM profiles p
    LEFT JOIN permissions perm ON p.permission_id = perm.id
    WHERE p.user_id = auth.uid() AND perm.permission_lvl >= 10
  )
);

-- 2. Fix chat tables RLS - restrict to user's own conversations
DROP POLICY IF EXISTS "Anyone can manage chat conversations" ON chat_conversations;
DROP POLICY IF EXISTS "Anyone can manage chat messages" ON chat_messages;

-- Chat conversations - users can only see their own
CREATE POLICY "Users can view their own conversations"
ON chat_conversations FOR SELECT
USING (user_id = auth.uid()::text);

CREATE POLICY "Users can create their own conversations"
ON chat_conversations FOR INSERT
WITH CHECK (user_id = auth.uid()::text);

CREATE POLICY "Users can update their own conversations"
ON chat_conversations FOR UPDATE
USING (user_id = auth.uid()::text);

CREATE POLICY "Users can delete their own conversations"
ON chat_conversations FOR DELETE
USING (user_id = auth.uid()::text);

-- Chat messages - users can only access messages in their conversations
CREATE POLICY "Users can view messages in their conversations"
ON chat_messages FOR SELECT
USING (
  conversation_id IN (
    SELECT id FROM chat_conversations 
    WHERE user_id = auth.uid()::text
  )
);

CREATE POLICY "Users can create messages in their conversations"
ON chat_messages FOR INSERT
WITH CHECK (
  conversation_id IN (
    SELECT id FROM chat_conversations 
    WHERE user_id = auth.uid()::text
  )
);

CREATE POLICY "Users can update messages in their conversations"
ON chat_messages FOR UPDATE
USING (
  conversation_id IN (
    SELECT id FROM chat_conversations 
    WHERE user_id = auth.uid()::text
  )
);

CREATE POLICY "Users can delete messages in their conversations"
ON chat_messages FOR DELETE
USING (
  conversation_id IN (
    SELECT id FROM chat_conversations 
    WHERE user_id = auth.uid()::text
  )
);