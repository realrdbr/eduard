-- SECURE RPC FUNCTIONS USING USERNAME/PASSWORD VERIFICATION

-- 1) THEME MANAGEMENT FUNCTIONS
CREATE OR REPLACE FUNCTION public.create_user_theme_secure(
  username_input text,
  password_input text,
  theme_name text,
  theme_colors jsonb
) RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  user_row RECORD;
  new_id uuid;
BEGIN
  -- Verify credentials securely (supports hashed passwords)
  SELECT * FROM public.verify_user_login_secure(username_input, password_input) INTO user_row;
  IF user_row.user_id IS NULL THEN
    RETURN json_build_object('success', false, 'error', 'Ungültige Anmeldedaten');
  END IF;

  INSERT INTO public.user_themes (user_id, name, colors, is_preset, is_active)
  VALUES (user_row.user_id, theme_name, theme_colors, false, true)
  RETURNING id INTO new_id;

  RETURN json_build_object('success', true, 'id', new_id);
END;
$$;

CREATE OR REPLACE FUNCTION public.update_user_theme_secure(
  username_input text,
  password_input text,
  theme_id uuid,
  theme_colors jsonb
) RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  user_row RECORD;
BEGIN
  SELECT * FROM public.verify_user_login_secure(username_input, password_input) INTO user_row;
  IF user_row.user_id IS NULL THEN
    RETURN json_build_object('success', false, 'error', 'Ungültige Anmeldedaten');
  END IF;

  -- Ensure ownership
  UPDATE public.user_themes
  SET colors = theme_colors, updated_at = now()
  WHERE id = theme_id AND user_id = user_row.user_id;

  IF NOT FOUND THEN
    RETURN json_build_object('success', false, 'error', 'Theme nicht gefunden oder keine Berechtigung');
  END IF;

  RETURN json_build_object('success', true);
END;
$$;

CREATE OR REPLACE FUNCTION public.delete_user_theme_secure(
  username_input text,
  password_input text,
  theme_id uuid
) RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  user_row RECORD;
BEGIN
  SELECT * FROM public.verify_user_login_secure(username_input, password_input) INTO user_row;
  IF user_row.user_id IS NULL THEN
    RETURN json_build_object('success', false, 'error', 'Ungültige Anmeldedaten');
  END IF;

  DELETE FROM public.user_themes
  WHERE id = theme_id AND user_id = user_row.user_id;

  IF NOT FOUND THEN
    RETURN json_build_object('success', false, 'error', 'Theme nicht gefunden oder keine Berechtigung');
  END IF;

  RETURN json_build_object('success', true);
END;
$$;

-- 2) VERTRETUNGSPLAN MANAGEMENT FUNCTIONS (Level >= 4 required)
CREATE OR REPLACE FUNCTION public.create_vertretung_secure(
  username_input text,
  password_input text,
  v_date date,
  v_class_name text,
  v_period smallint,
  v_original_subject text,
  v_original_teacher text,
  v_original_room text,
  v_substitute_teacher text,
  v_substitute_subject text,
  v_substitute_room text,
  v_note text
) RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  user_row RECORD;
  new_id uuid;
BEGIN
  SELECT * FROM public.verify_user_login_secure(username_input, password_input) INTO user_row;
  IF user_row.user_id IS NULL THEN
    RETURN json_build_object('success', false, 'error', 'Ungültige Anmeldedaten');
  END IF;
  IF COALESCE(user_row.permission_level, 0) < 4 THEN
    RETURN json_build_object('success', false, 'error', 'Keine Berechtigung (Level 4 erforderlich)');
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
$$;

CREATE OR REPLACE FUNCTION public.update_vertretung_secure(
  username_input text,
  password_input text,
  v_id uuid,
  v_substitute_teacher text,
  v_substitute_subject text,
  v_substitute_room text,
  v_note text
) RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  user_row RECORD;
BEGIN
  SELECT * FROM public.verify_user_login_secure(username_input, password_input) INTO user_row;
  IF user_row.user_id IS NULL THEN
    RETURN json_build_object('success', false, 'error', 'Ungültige Anmeldedaten');
  END IF;
  IF COALESCE(user_row.permission_level, 0) < 4 THEN
    RETURN json_build_object('success', false, 'error', 'Keine Berechtigung (Level 4 erforderlich)');
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
$$;

CREATE OR REPLACE FUNCTION public.delete_vertretung_secure(
  username_input text,
  password_input text,
  v_id uuid
) RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  user_row RECORD;
BEGIN
  SELECT * FROM public.verify_user_login_secure(username_input, password_input) INTO user_row;
  IF user_row.user_id IS NULL THEN
    RETURN json_build_object('success', false, 'error', 'Ungültige Anmeldedaten');
  END IF;
  IF COALESCE(user_row.permission_level, 0) < 4 THEN
    RETURN json_build_object('success', false, 'error', 'Keine Berechtigung (Level 4 erforderlich)');
  END IF;

  DELETE FROM public.vertretungsplan WHERE id = v_id;

  IF NOT FOUND THEN
    RETURN json_build_object('success', false, 'error', 'Eintrag nicht gefunden');
  END IF;

  RETURN json_build_object('success', true);
END;
$$;