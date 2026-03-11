-- Create additional session-based functions and update RLS policies

-- Session-based theme management functions (no password required)
CREATE OR REPLACE FUNCTION public.create_user_theme_session(theme_name text, theme_colors jsonb)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  current_user_id bigint;
  new_id uuid;
BEGIN
  current_user_id := get_current_user_from_session();
  
  IF current_user_id IS NULL THEN
    RETURN json_build_object('success', false, 'error', 'Nicht angemeldet');
  END IF;

  INSERT INTO public.user_themes (user_id, name, colors, is_preset, is_active)
  VALUES (current_user_id, theme_name, theme_colors, false, true)
  RETURNING id INTO new_id;

  RETURN json_build_object('success', true, 'id', new_id);
END;
$$;

CREATE OR REPLACE FUNCTION public.update_user_theme_session(theme_id uuid, theme_colors jsonb)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  current_user_id bigint;
BEGIN
  current_user_id := get_current_user_from_session();
  
  IF current_user_id IS NULL THEN
    RETURN json_build_object('success', false, 'error', 'Nicht angemeldet');
  END IF;

  -- Ensure ownership
  UPDATE public.user_themes
  SET colors = theme_colors, updated_at = now()
  WHERE id = theme_id AND user_id = current_user_id;

  IF NOT FOUND THEN
    RETURN json_build_object('success', false, 'error', 'Theme nicht gefunden oder keine Berechtigung');
  END IF;

  RETURN json_build_object('success', true);
END;
$$;

CREATE OR REPLACE FUNCTION public.delete_user_theme_session(theme_id uuid)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  current_user_id bigint;
BEGIN
  current_user_id := get_current_user_from_session();
  
  IF current_user_id IS NULL THEN
    RETURN json_build_object('success', false, 'error', 'Nicht angemeldet');
  END IF;

  DELETE FROM public.user_themes
  WHERE id = theme_id AND user_id = current_user_id;

  IF NOT FOUND THEN
    RETURN json_build_object('success', false, 'error', 'Theme nicht gefunden oder keine Berechtigung');
  END IF;

  RETURN json_build_object('success', true);
END;
$$;

-- Session-based substitution management functions (requires level 10)
CREATE OR REPLACE FUNCTION public.create_vertretung_session(
  v_date date, v_class_name text, v_period smallint,
  v_original_subject text, v_original_teacher text, v_original_room text,
  v_substitute_teacher text, v_substitute_subject text, v_substitute_room text, v_note text
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  new_id uuid;
BEGIN
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
$$;

CREATE OR REPLACE FUNCTION public.update_vertretung_session(
  v_id uuid, v_substitute_teacher text, v_substitute_subject text, 
  v_substitute_room text, v_note text
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
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
$$;

CREATE OR REPLACE FUNCTION public.delete_vertretung_session(v_id uuid)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NOT current_user_has_permission_level(10::smallint) THEN
    RETURN json_build_object('success', false, 'error', 'Keine Berechtigung (Level 10 erforderlich)');
  END IF;

  DELETE FROM public.vertretungsplan WHERE id = v_id;

  IF NOT FOUND THEN
    RETURN json_build_object('success', false, 'error', 'Eintrag nicht gefunden');
  END IF;

  RETURN json_build_object('success', true);
END;
$$;

-- Update RLS policies to use session-based authentication
-- User themes policies
DROP POLICY IF EXISTS "Everyone can view themes for UI display" ON user_themes;
DROP POLICY IF EXISTS "Users can manage their own themes - delete" ON user_themes;
DROP POLICY IF EXISTS "Users can manage their own themes - insert" ON user_themes;
DROP POLICY IF EXISTS "Users can manage their own themes - update" ON user_themes;
DROP POLICY IF EXISTS "Users can manage their own themes via session - insert" ON user_themes;
DROP POLICY IF EXISTS "Users can manage their own themes via session - update" ON user_themes;
DROP POLICY IF EXISTS "Users can manage their own themes via session - delete" ON user_themes;

CREATE POLICY "Everyone can view themes for UI display" ON user_themes
  FOR SELECT USING (true);

CREATE POLICY "Users can manage their own themes via session - insert" ON user_themes
  FOR INSERT WITH CHECK (current_user_owns_resource(user_id));

CREATE POLICY "Users can manage their own themes via session - update" ON user_themes
  FOR UPDATE USING (current_user_owns_resource(user_id))
  WITH CHECK (current_user_owns_resource(user_id));

CREATE POLICY "Users can manage their own themes via session - delete" ON user_themes
  FOR DELETE USING (current_user_owns_resource(user_id));

-- Vertretungsplan policies
DROP POLICY IF EXISTS "Level 4+ users can delete vertretungsplan" ON vertretungsplan;
DROP POLICY IF EXISTS "Level 4+ users can insert vertretungsplan" ON vertretungsplan;
DROP POLICY IF EXISTS "Level 4+ users can update vertretungsplan" ON vertretungsplan;
DROP POLICY IF EXISTS "Level 10+ users can insert vertretungsplan via session" ON vertretungsplan;
DROP POLICY IF EXISTS "Level 10+ users can update vertretungsplan via session" ON vertretungsplan;
DROP POLICY IF EXISTS "Level 10+ users can delete vertretungsplan via session" ON vertretungsplan;

CREATE POLICY "Level 10+ users can insert vertretungsplan via session" ON vertretungsplan
  FOR INSERT WITH CHECK (current_user_has_permission_level(10::smallint));

CREATE POLICY "Level 10+ users can update vertretungsplan via session" ON vertretungsplan
  FOR UPDATE USING (current_user_has_permission_level(10::smallint))
  WITH CHECK (current_user_has_permission_level(10::smallint));

CREATE POLICY "Level 10+ users can delete vertretungsplan via session" ON vertretungsplan
  FOR DELETE USING (current_user_has_permission_level(10::smallint));