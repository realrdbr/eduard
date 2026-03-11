-- Create function to remove a contact using session context
CREATE OR REPLACE FUNCTION public.remove_contact_session(contact_id_param uuid, v_session_id text DEFAULT NULL::text)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  current_user_id bigint;
  deleted_count integer := 0;
BEGIN
  IF v_session_id IS NOT NULL AND v_session_id <> '' THEN
    PERFORM set_config('app.current_session_id', v_session_id, true);
  END IF;

  current_user_id := get_current_user_from_session();

  IF current_user_id IS NULL THEN
    RETURN json_build_object('success', false, 'error', 'Nicht angemeldet');
  END IF;

  DELETE FROM user_contacts
  WHERE id = contact_id_param
    AND user_id = current_user_id;
  GET DIAGNOSTICS deleted_count = ROW_COUNT;

  IF deleted_count = 0 THEN
    RETURN json_build_object('success', false, 'error', 'Kontakt nicht gefunden oder keine Berechtigung');
  END IF;

  RETURN json_build_object('success', true);
EXCEPTION
  WHEN OTHERS THEN
    RETURN json_build_object('success', false, 'error', SQLERRM);
END;
$function$;