-- Create the missing send_private_message_session function
CREATE OR REPLACE FUNCTION public.send_private_message_session(
  conversation_id_param uuid,
  content_param text,
  v_session_id text DEFAULT NULL::text
) RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  current_user_id bigint;
BEGIN
  -- Set session context
  IF v_session_id IS NOT NULL AND v_session_id <> '' THEN
    PERFORM set_config('app.current_session_id', v_session_id, true);
  END IF;

  -- Get current user from session
  current_user_id := get_current_user_from_session();
  
  IF current_user_id IS NULL THEN
    RETURN json_build_object('success', false, 'error', 'Nicht angemeldet');
  END IF;

  -- Verify user is part of this conversation
  IF NOT EXISTS (
    SELECT 1 FROM private_conversations
    WHERE id = conversation_id_param
    AND (user1_id = current_user_id OR user2_id = current_user_id)
  ) THEN
    RETURN json_build_object('success', false, 'error', 'Keine Berechtigung für diese Unterhaltung');
  END IF;

  -- Insert the message
  INSERT INTO private_messages (conversation_id, sender_id, content, is_read)
  VALUES (conversation_id_param, current_user_id, content_param, false);

  RETURN json_build_object('success', true);
EXCEPTION
  WHEN OTHERS THEN
    RETURN json_build_object('success', false, 'error', SQLERRM);
END;
$function$;