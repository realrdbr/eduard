-- Phase 1: Secure RLS for private messaging and sessions (Fixed)

-- 1) PRIVATE CONVERSATIONS: lock down to participants
ALTER TABLE public.private_conversations ENABLE ROW LEVEL SECURITY;

-- Drop overly permissive policies if they exist
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE schemaname='public' AND tablename='private_conversations'
  ) THEN
    EXECUTE (
      SELECT string_agg('DROP POLICY IF EXISTS ' || quote_ident(policyname) || ' ON public.private_conversations;', ' ')
      FROM pg_policies WHERE schemaname='public' AND tablename='private_conversations'
    );
  END IF;
END $$;

-- Participants can view conversation
CREATE POLICY "Participants can view conversations"
ON public.private_conversations
FOR SELECT
USING (
  public.get_current_user_from_session() IS NOT NULL
  AND (
    public.get_current_user_from_session() = user1_id
    OR public.get_current_user_from_session() = user2_id
  )
);

-- Participants can insert conversation (current user must be one of the two)
CREATE POLICY "Participants can create conversations"
ON public.private_conversations
FOR INSERT
WITH CHECK (
  public.get_current_user_from_session() IS NOT NULL
  AND (
    public.get_current_user_from_session() = user1_id
    OR public.get_current_user_from_session() = user2_id
  )
);

-- Participants can update conversation (e.g., updated_at by trigger)
CREATE POLICY "Participants can update conversations"
ON public.private_conversations
FOR UPDATE
USING (
  public.get_current_user_from_session() IS NOT NULL
  AND (
    public.get_current_user_from_session() = user1_id
    OR public.get_current_user_from_session() = user2_id
  )
)
WITH CHECK (
  public.get_current_user_from_session() IS NOT NULL
  AND (
    public.get_current_user_from_session() = user1_id
    OR public.get_current_user_from_session() = user2_id
  )
);

-- Optional: allow participants to delete their conversation
CREATE POLICY "Participants can delete conversations"
ON public.private_conversations
FOR DELETE
USING (
  public.get_current_user_from_session() IS NOT NULL
  AND (
    public.get_current_user_from_session() = user1_id
    OR public.get_current_user_from_session() = user2_id
  )
);


-- 2) PRIVATE MESSAGES: lock down to conversation participants
ALTER TABLE public.private_messages ENABLE ROW LEVEL SECURITY;

-- Drop overly permissive policies
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE schemaname='public' AND tablename='private_messages'
  ) THEN
    EXECUTE (
      SELECT string_agg('DROP POLICY IF EXISTS ' || quote_ident(policyname) || ' ON public.private_messages;', ' ')
      FROM pg_policies WHERE schemaname='public' AND tablename='private_messages'
    );
  END IF;
END $$;

-- Helper check: current user is participant in the message's conversation
-- Implemented inline using EXISTS on private_conversations

CREATE POLICY "Participants can view messages"
ON public.private_messages
FOR SELECT
USING (
  public.get_current_user_from_session() IS NOT NULL
  AND EXISTS (
    SELECT 1 FROM public.private_conversations c
    WHERE c.id = private_messages.conversation_id
      AND (c.user1_id = public.get_current_user_from_session() OR c.user2_id = public.get_current_user_from_session())
  )
);

CREATE POLICY "Sender (participant) can insert messages"
ON public.private_messages
FOR INSERT
WITH CHECK (
  public.get_current_user_from_session() IS NOT NULL
  AND sender_id = public.get_current_user_from_session()
  AND EXISTS (
    SELECT 1 FROM public.private_conversations c
    WHERE c.id = private_messages.conversation_id
      AND (c.user1_id = public.get_current_user_from_session() OR c.user2_id = public.get_current_user_from_session())
  )
);

-- Allow sender to update/delete own message (rare)
CREATE POLICY "Sender can update own message"
ON public.private_messages
FOR UPDATE
USING (
  public.get_current_user_from_session() = sender_id
)
WITH CHECK (
  public.get_current_user_from_session() = sender_id
);

CREATE POLICY "Sender can delete own message"
ON public.private_messages
FOR DELETE
USING (
  public.get_current_user_from_session() = sender_id
);


-- 3) USER_CONTACTS: restrict to owner
ALTER TABLE public.user_contacts ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE schemaname='public' AND tablename='user_contacts'
  ) THEN
    EXECUTE (
      SELECT string_agg('DROP POLICY IF EXISTS ' || quote_ident(policyname) || ' ON public.user_contacts;', ' ')
      FROM pg_policies WHERE schemaname='public' AND tablename='user_contacts'
    );
  END IF;
END $$;

CREATE POLICY "Users can view own contacts"
ON public.user_contacts
FOR SELECT
USING (
  public.get_current_user_from_session() = user_id
);

CREATE POLICY "Users can manage own contacts"
ON public.user_contacts
FOR ALL
USING (
  public.get_current_user_from_session() = user_id
)
WITH CHECK (
  public.get_current_user_from_session() = user_id
);


-- 4) USER_SESSIONS: restrict direct access; allow only viewing own and admins
ALTER TABLE public.user_sessions ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE schemaname='public' AND tablename='user_sessions'
  ) THEN
    EXECUTE (
      SELECT string_agg('DROP POLICY IF EXISTS ' || quote_ident(policyname) || ' ON public.user_sessions;', ' ')
      FROM pg_policies WHERE schemaname='public' AND tablename='user_sessions'
    );
  END IF;
END $$;

-- Allow users to view their own sessions and admins to view all
CREATE POLICY "Users can view own sessions; admins can view all"
ON public.user_sessions
FOR SELECT
USING (
  public.is_current_user_admin_safe() OR public.get_current_user_from_session() = user_id
);

-- Do NOT grant insert/update/delete via RLS (handled via SECURITY DEFINER functions)
-- No policies for I/U/D means default deny for direct table writes.