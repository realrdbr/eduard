-- Fix RLS policies to make private messaging and library functions work again
-- The issue is that get_current_user_from_session() might not be working reliably

-- 1) Fix private_messages RLS to allow authenticated users with proper session context
ALTER TABLE public.private_messages DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.private_messages ENABLE ROW LEVEL SECURITY;

-- Drop existing policies
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

-- More permissive but still secure policies for private_messages
CREATE POLICY "Users can view messages in their conversations"
ON public.private_messages
FOR SELECT
USING (
  -- Allow if user is authenticated via session system OR regular auth
  (get_current_user_from_session() IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.private_conversations c
    WHERE c.id = private_messages.conversation_id
      AND (c.user1_id = get_current_user_from_session() OR c.user2_id = get_current_user_from_session())
  ))
  OR
  (is_custom_user_authenticated() AND EXISTS (
    SELECT 1 FROM public.private_conversations c
    JOIN public.permissions p ON (p.id = c.user1_id OR p.id = c.user2_id)
    WHERE c.id = private_messages.conversation_id
      AND p.username = ((current_setting('request.jwt.claims', true))::json ->> 'sub')
  ))
);

CREATE POLICY "Users can send messages in their conversations"
ON public.private_messages
FOR INSERT
WITH CHECK (
  -- Allow if user is authenticated and is participant in conversation
  (get_current_user_from_session() IS NOT NULL 
   AND sender_id = get_current_user_from_session()
   AND EXISTS (
     SELECT 1 FROM public.private_conversations c
     WHERE c.id = private_messages.conversation_id
       AND (c.user1_id = get_current_user_from_session() OR c.user2_id = get_current_user_from_session())
   ))
  OR
  (is_custom_user_authenticated() 
   AND EXISTS (
     SELECT 1 FROM public.permissions p
     WHERE p.id = sender_id 
       AND p.username = ((current_setting('request.jwt.claims', true))::json ->> 'sub')
   )
   AND EXISTS (
     SELECT 1 FROM public.private_conversations c
     WHERE c.id = private_messages.conversation_id
       AND (c.user1_id = sender_id OR c.user2_id = sender_id)
   ))
);

CREATE POLICY "Users can update their own messages"
ON public.private_messages
FOR UPDATE
USING (
  (get_current_user_from_session() = sender_id)
  OR
  (is_custom_user_authenticated() AND EXISTS (
    SELECT 1 FROM public.permissions p
    WHERE p.id = sender_id 
      AND p.username = ((current_setting('request.jwt.claims', true))::json ->> 'sub')
  ))
)
WITH CHECK (
  (get_current_user_from_session() = sender_id)
  OR
  (is_custom_user_authenticated() AND EXISTS (
    SELECT 1 FROM public.permissions p
    WHERE p.id = sender_id 
      AND p.username = ((current_setting('request.jwt.claims', true))::json ->> 'sub')
  ))
);

-- 2) Fix private_conversations RLS
ALTER TABLE public.private_conversations DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.private_conversations ENABLE ROW LEVEL SECURITY;

-- Drop existing policies
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

-- More permissive policies for private_conversations
CREATE POLICY "Users can view their conversations"
ON public.private_conversations
FOR SELECT
USING (
  (get_current_user_from_session() IS NOT NULL
   AND (get_current_user_from_session() = user1_id OR get_current_user_from_session() = user2_id))
  OR
  (is_custom_user_authenticated() AND EXISTS (
    SELECT 1 FROM public.permissions p
    WHERE (p.id = user1_id OR p.id = user2_id)
      AND p.username = ((current_setting('request.jwt.claims', true))::json ->> 'sub')
  ))
);

CREATE POLICY "Users can create conversations"
ON public.private_conversations
FOR INSERT
WITH CHECK (
  (get_current_user_from_session() IS NOT NULL
   AND (get_current_user_from_session() = user1_id OR get_current_user_from_session() = user2_id))
  OR
  (is_custom_user_authenticated() AND EXISTS (
    SELECT 1 FROM public.permissions p
    WHERE (p.id = user1_id OR p.id = user2_id)
      AND p.username = ((current_setting('request.jwt.claims', true))::json ->> 'sub')
  ))
);

CREATE POLICY "Users can update their conversations"
ON public.private_conversations
FOR UPDATE
USING (
  (get_current_user_from_session() IS NOT NULL
   AND (get_current_user_from_session() = user1_id OR get_current_user_from_session() = user2_id))
  OR
  (is_custom_user_authenticated() AND EXISTS (
    SELECT 1 FROM public.permissions p
    WHERE (p.id = user1_id OR p.id = user2_id)
      AND p.username = ((current_setting('request.jwt.claims', true))::json ->> 'sub')
  ))
)
WITH CHECK (
  (get_current_user_from_session() IS NOT NULL
   AND (get_current_user_from_session() = user1_id OR get_current_user_from_session() = user2_id))
  OR
  (is_custom_user_authenticated() AND EXISTS (
    SELECT 1 FROM public.permissions p
    WHERE (p.id = user1_id OR p.id = user2_id)
      AND p.username = ((current_setting('request.jwt.claims', true))::json ->> 'sub')
  ))
);

-- 3) Make permissions table more accessible for library searches
-- The library system needs to search users by keycard_number
ALTER TABLE public.permissions DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.permissions ENABLE ROW LEVEL SECURITY;

-- Drop existing policies
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE schemaname='public' AND tablename='permissions'
  ) THEN
    EXECUTE (
      SELECT string_agg('DROP POLICY IF EXISTS ' || quote_ident(policyname) || ' ON public.permissions;', ' ')
      FROM pg_policies WHERE schemaname='public' AND tablename='permissions'
    );
  END IF;
END $$;

-- More accessible permissions policies
CREATE POLICY "Authenticated users can view basic user info"
ON public.permissions
FOR SELECT
USING (
  (get_current_user_id() IS NOT NULL) 
  OR is_custom_user_authenticated() 
  OR is_current_user_admin_secure()
  OR current_user_has_permission_level(1::smallint)  -- Any authenticated user can view basic info
);

CREATE POLICY "Users can update own profile"
ON public.permissions
FOR UPDATE
USING (
  (username = ((current_setting('request.jwt.claims', true))::json ->> 'sub'))
  OR (get_current_user_from_session() = id)
)
WITH CHECK (
  (username = ((current_setting('request.jwt.claims', true))::json ->> 'sub'))
  OR (get_current_user_from_session() = id)
);

CREATE POLICY "Admins have full access"
ON public.permissions  
FOR ALL
USING (is_current_user_admin_secure())
WITH CHECK (is_current_user_admin_secure());