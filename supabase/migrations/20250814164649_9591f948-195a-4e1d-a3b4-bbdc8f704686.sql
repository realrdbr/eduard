-- Create chat conversations table
CREATE TABLE public.chat_conversations (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  title TEXT NOT NULL DEFAULT 'Neuer Chat',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create chat messages table
CREATE TABLE public.chat_messages (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  conversation_id UUID NOT NULL REFERENCES public.chat_conversations(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
  content TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable Row Level Security
ALTER TABLE public.chat_conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chat_messages ENABLE ROW LEVEL SECURITY;

-- Create policies for chat_conversations
CREATE POLICY "Users can view their own conversations" 
ON public.chat_conversations 
FOR SELECT 
USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own conversations" 
ON public.chat_conversations 
FOR INSERT 
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own conversations" 
ON public.chat_conversations 
FOR UPDATE 
USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own conversations" 
ON public.chat_conversations 
FOR DELETE 
USING (auth.uid() = user_id);

-- Create policies for chat_messages
CREATE POLICY "Users can view messages from their conversations" 
ON public.chat_messages 
FOR SELECT 
USING (
  conversation_id IN (
    SELECT id FROM public.chat_conversations WHERE user_id = auth.uid()
  )
);

CREATE POLICY "Users can create messages in their conversations" 
ON public.chat_messages 
FOR INSERT 
WITH CHECK (
  conversation_id IN (
    SELECT id FROM public.chat_conversations WHERE user_id = auth.uid()
  )
);

-- Create trigger for automatic timestamp updates on conversations
CREATE TRIGGER update_chat_conversations_updated_at
BEFORE UPDATE ON public.chat_conversations
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Create function to automatically delete old conversations (older than 7 days)
CREATE OR REPLACE FUNCTION public.cleanup_old_conversations()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
BEGIN
  DELETE FROM public.chat_conversations 
  WHERE created_at < NOW() - INTERVAL '7 days';
END;
$$;

-- Create indexes for better performance
CREATE INDEX idx_chat_conversations_user_id_created_at ON public.chat_conversations(user_id, created_at DESC);
CREATE INDEX idx_chat_messages_conversation_id_created_at ON public.chat_messages(conversation_id, created_at ASC);