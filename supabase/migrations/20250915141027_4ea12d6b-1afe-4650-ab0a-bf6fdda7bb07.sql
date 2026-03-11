-- Update session-aware Vertretung RPCs to accept an optional session id and set it internally to avoid connection pooling issues

-- 1) delete_vertretung_session
DROP FUNCTION IF EXISTS public.delete_vertretung_session(uuid);
CREATE OR REPLACE FUNCTION public.delete_vertretung_session(
  v_id uuid,
  v_session_id text DEFAULT NULL
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  -- Ensure session context is set within this transaction to avoid pool/handoff issues
  IF v_session_id IS NOT NULL AND v_session_id <> '' THEN
    PERFORM set_config('app.current_session_id', v_session_id, true);
  END IF;

  IF NOT current_user_has_permission_level(10::smallint) THEN
    RETURN json_build_object('success', false, 'error', 'Keine Berechtigung (Level 10 erforderlich)');
  END IF;

  DELETE FROM public.vertretungsplan WHERE id = v_id;

  IF NOT FOUND THEN
    RETURN json_build_object('success', false, 'error', 'Eintrag nicht gefunden');
  END IF;

  RETURN json_build_object('success', true);
END;
$function$;

-- 2) update_vertretung_session
DROP FUNCTION IF EXISTS public.update_vertretung_session(uuid, text, text, text, text);
CREATE OR REPLACE FUNCTION public.update_vertretung_session(
  v_id uuid,
  v_substitute_teacher text,
  v_substitute_subject text,
  v_substitute_room text,
  v_note text,
  v_session_id text DEFAULT NULL
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF v_session_id IS NOT NULL AND v_session_id <> '' THEN
    PERFORM set_config('app.current_session_id', v_session_id, true);
  END IF;

  IF NOT current_user_has_permission_level(10::smallint) THEN
    RETURN json_build_object('success', false, 'error', 'Keine Berechtigung (Level 10 erforderlich)');
  END IF;

  UPDATE public.vertretungsplan
  SET substitute_teacher = v_substitute_teacher,
      substitute_subject = v_substitute_subject,
      substitute_room = v_substitute_room,
      note = v_note,
      updated_at = now()
  WHERE id = v_id;

  IF NOT FOUND THEN
    RETURN json_build_object('success', false, 'error', 'Eintrag nicht gefunden');
  END IF;

  RETURN json_build_object('success', true);
END;
$function$;

-- 3) create_vertretung_session
DROP FUNCTION IF EXISTS public.create_vertretung_session(date, text, smallint, text, text, text, text, text, text, text);
CREATE OR REPLACE FUNCTION public.create_vertretung_session(
  v_date date,
  v_class_name text,
  v_period smallint,
  v_original_subject text,
  v_original_teacher text,
  v_original_room text,
  v_substitute_teacher text,
  v_substitute_subject text,
  v_substitute_room text,
  v_note text,
  v_session_id text DEFAULT NULL
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  new_id uuid;
BEGIN
  IF v_session_id IS NOT NULL AND v_session_id <> '' THEN
    PERFORM set_config('app.current_session_id', v_session_id, true);
  END IF;

  IF NOT current_user_has_permission_level(10::smallint) THEN
    RETURN json_build_object('success', false, 'error', 'Keine Berechtigung (Level 10 erforderlich)');
  END IF;

  INSERT INTO public.vertretungsplan (
    date, class_name, period,
    original_subject, original_teacher, original_room,
    substitute_teacher, substitute_subject, substitute_room,
    note, created_by
  ) VALUES (
    v_date, v_class_name, v_period,
    v_original_subject, v_original_teacher, v_original_room,
    v_substitute_teacher, v_substitute_subject, v_substitute_room,
    v_note, NULL
  ) RETURNING id INTO new_id;

  RETURN json_build_object('success', true, 'id', new_id);
END;
$function$;
