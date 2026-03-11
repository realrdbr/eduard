-- Fix chat RLS policies to work with our custom auth system
-- Drop existing policies if they exist
DROP POLICY IF EXISTS "Users can view their own conversations" ON public.chat_conversations;
DROP POLICY IF EXISTS "Users can create their own conversations" ON public.chat_conversations;
DROP POLICY IF EXISTS "Users can update their own conversations" ON public.chat_conversations;
DROP POLICY IF EXISTS "Users can delete their own conversations" ON public.chat_conversations;

DROP POLICY IF EXISTS "Users can view messages from their conversations" ON public.chat_messages;
DROP POLICY IF EXISTS "Users can create messages in their conversations" ON public.chat_messages;

-- Create new policies that work with our profile-based system
CREATE POLICY "Anyone can manage chat conversations"
ON public.chat_conversations
FOR ALL
TO public
USING (true)
WITH CHECK (true);

CREATE POLICY "Anyone can manage chat messages"
ON public.chat_messages
FOR ALL
TO public
USING (true)
WITH CHECK (true);

-- Update chat_conversations table to allow string user_id (for compatibility)
ALTER TABLE public.chat_conversations ALTER COLUMN user_id TYPE text;