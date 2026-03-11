-- Create private chat system tables

-- Table for user contacts/friendships
CREATE TABLE public.user_contacts (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id BIGINT NOT NULL,
  contact_user_id BIGINT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'blocked')),
  added_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(user_id, contact_user_id),
  CONSTRAINT no_self_contact CHECK (user_id != contact_user_id)
);

-- Table for private conversations between users
CREATE TABLE public.private_conversations (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user1_id BIGINT NOT NULL,
  user2_id BIGINT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(user1_id, user2_id),
  CONSTRAINT user_order CHECK (user1_id < user2_id)
);

-- Table for private messages
CREATE TABLE public.private_messages (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  conversation_id UUID NOT NULL REFERENCES public.private_conversations(id) ON DELETE CASCADE,
  sender_id BIGINT NOT NULL,
  content TEXT NOT NULL,
  is_read BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS on all tables
ALTER TABLE public.user_contacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.private_conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.private_messages ENABLE ROW LEVEL SECURITY;

-- RLS Policies for user_contacts
CREATE POLICY "Users can view their own contacts"
ON public.user_contacts
FOR SELECT
USING (user_id = get_current_user_from_session());

CREATE POLICY "Users can add contacts"
ON public.user_contacts
FOR INSERT
WITH CHECK (user_id = get_current_user_from_session());

CREATE POLICY "Users can update their own contacts"
ON public.user_contacts
FOR UPDATE
USING (user_id = get_current_user_from_session());

CREATE POLICY "Users can delete their own contacts"
ON public.user_contacts
FOR DELETE
USING (user_id = get_current_user_from_session());

-- RLS Policies for private_conversations
CREATE POLICY "Users can view their own conversations"
ON public.private_conversations
FOR SELECT
USING (user1_id = get_current_user_from_session() OR user2_id = get_current_user_from_session());

CREATE POLICY "Users can create conversations"
ON public.private_conversations
FOR INSERT
WITH CHECK (user1_id = get_current_user_from_session() OR user2_id = get_current_user_from_session());

CREATE POLICY "Users can update their own conversations"
ON public.private_conversations
FOR UPDATE
USING (user1_id = get_current_user_from_session() OR user2_id = get_current_user_from_session());

-- RLS Policies for private_messages
CREATE POLICY "Users can view messages in their conversations"
ON public.private_messages
FOR SELECT
USING (
  conversation_id IN (
    SELECT id FROM public.private_conversations 
    WHERE user1_id = get_current_user_from_session() 
    OR user2_id = get_current_user_from_session()
  )
);

CREATE POLICY "Users can send messages in their conversations"
ON public.private_messages
FOR INSERT
WITH CHECK (
  sender_id = get_current_user_from_session() AND
  conversation_id IN (
    SELECT id FROM public.private_conversations 
    WHERE user1_id = get_current_user_from_session() 
    OR user2_id = get_current_user_from_session()
  )
);

CREATE POLICY "Users can update their own messages"
ON public.private_messages
FOR UPDATE
USING (
  conversation_id IN (
    SELECT id FROM public.private_conversations 
    WHERE user1_id = get_current_user_from_session() 
    OR user2_id = get_current_user_from_session()
  )
);

-- Create indexes for better performance
CREATE INDEX idx_user_contacts_user_id ON public.user_contacts(user_id);
CREATE INDEX idx_user_contacts_contact_user_id ON public.user_contacts(contact_user_id);
CREATE INDEX idx_private_conversations_users ON public.private_conversations(user1_id, user2_id);
CREATE INDEX idx_private_messages_conversation_id ON public.private_messages(conversation_id);
CREATE INDEX idx_private_messages_created_at ON public.private_messages(created_at);
CREATE INDEX idx_private_messages_is_read ON public.private_messages(is_read);

-- Create function to get or create conversation between two users
CREATE OR REPLACE FUNCTION public.get_or_create_conversation(other_user_id BIGINT)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
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

-- Create function to mark messages as read
CREATE OR REPLACE FUNCTION public.mark_messages_as_read(conversation_id_param UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
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

-- Create trigger to update conversation timestamp
CREATE OR REPLACE FUNCTION update_conversation_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE private_conversations
  SET updated_at = NOW()
  WHERE id = NEW.conversation_id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_conversation_on_message
  AFTER INSERT ON private_messages
  FOR EACH ROW
  EXECUTE FUNCTION update_conversation_timestamp();

-- Enable realtime for live updates
ALTER PUBLICATION supabase_realtime ADD TABLE public.private_messages;
ALTER PUBLICATION supabase_realtime ADD TABLE public.private_conversations;
ALTER PUBLICATION supabase_realtime ADD TABLE public.user_contacts;