-- Fix ambiguous column reference in list_private_conversations_session
CREATE OR REPLACE FUNCTION public.list_private_conversations_session(v_session_id text DEFAULT NULL::text)
 RETURNS TABLE(id uuid, user1_id bigint, user2_id bigint, updated_at timestamp with time zone)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  current_user_id BIGINT;
BEGIN
  IF v_session_id IS NOT NULL AND v_session_id <> '' THEN
    PERFORM set_config('app.current_session_id', v_session_id, true);
  END IF;

  current_user_id := get_current_user_from_session();
  IF current_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  RETURN QUERY
  SELECT pc.id, pc.user1_id, pc.user2_id, pc.updated_at
  FROM private_conversations pc
  WHERE pc.user1_id = current_user_id OR pc.user2_id = current_user_id
  ORDER BY pc.updated_at DESC;
END;
$function$;

-- Fix mark_messages_as_read_session to allow UPDATE operations
CREATE OR REPLACE FUNCTION public.mark_messages_as_read_session(conversation_id_param uuid, v_session_id text DEFAULT NULL::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF v_session_id IS NOT NULL AND v_session_id <> '' THEN
    PERFORM set_config('app.current_session_id', v_session_id, true);
  END IF;

  PERFORM public.mark_messages_as_read(conversation_id_param);
END;
$function$;

-- Add function to manage contacts with session context
CREATE OR REPLACE FUNCTION public.add_contact_session(contact_user_id_param bigint, v_session_id text DEFAULT NULL::text)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  current_user_id bigint;
  new_contact_id uuid;
BEGIN
  IF v_session_id IS NOT NULL AND v_session_id <> '' THEN
    PERFORM set_config('app.current_session_id', v_session_id, true);
  END IF;

  current_user_id := get_current_user_from_session();
  
  IF current_user_id IS NULL THEN
    RETURN json_build_object('success', false, 'error', 'Nicht angemeldet');
  END IF;

  -- Check if contact already exists
  IF EXISTS (
    SELECT 1 FROM user_contacts 
    WHERE user_id = current_user_id 
    AND contact_user_id = contact_user_id_param 
    AND status = 'active'
  ) THEN
    RETURN json_build_object('success', false, 'error', 'Kontakt bereits vorhanden');
  END IF;

  -- Add the contact
  INSERT INTO user_contacts (user_id, contact_user_id, status)
  VALUES (current_user_id, contact_user_id_param, 'active')
  RETURNING id INTO new_contact_id;

  RETURN json_build_object('success', true, 'contact_id', new_contact_id);
EXCEPTION
  WHEN OTHERS THEN
    RETURN json_build_object('success', false, 'error', SQLERRM);
END;
$function$;