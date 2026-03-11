-- Fix regression: get_current_user_from_session must read app.current_session_id (used by set_session_context and vertretung RPCs)
CREATE OR REPLACE FUNCTION public.get_current_user_from_session()
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_session_id uuid;
  v_user_id bigint;
BEGIN
  -- Session id is stored in GUC 'app.current_session_id'
  BEGIN
    v_session_id := current_setting('app.current_session_id', true)::uuid;
  EXCEPTION WHEN OTHERS THEN
    v_session_id := NULL;
  END;

  IF v_session_id IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT us.user_id
    INTO v_user_id
  FROM public.user_sessions us
  WHERE us.id = v_session_id
    AND us.is_active = true
    AND us.updated_at > now() - interval '7 days'
  LIMIT 1;

  RETURN v_user_id;
END;
$$;