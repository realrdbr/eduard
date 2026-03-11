-- Create a secure function to insert audio announcements with session validation
CREATE OR REPLACE FUNCTION public.create_audio_announcement_session(
  v_session_id text,
  v_title text,
  v_description text DEFAULT NULL,
  v_is_tts boolean DEFAULT false,
  v_tts_text text DEFAULT NULL,
  v_voice_id text DEFAULT NULL,
  v_schedule_date timestamptz DEFAULT NULL,
  v_audio_file_path text DEFAULT NULL,
  v_duration_seconds integer DEFAULT NULL
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  current_user_id bigint;
  user_level smallint;
  new_id uuid;
BEGIN
  -- Resolve user from session
  SELECT user_id INTO current_user_id
  FROM public.user_sessions
  WHERE id = v_session_id::uuid
    AND is_active = true
    AND updated_at > NOW() - INTERVAL '7 days';
  
  IF current_user_id IS NULL THEN
    RETURN json_build_object('success', false, 'error', 'Ungültige oder abgelaufene Session');
  END IF;
  
  -- Check permission level
  SELECT permission_lvl INTO user_level
  FROM public.permissions
  WHERE id = current_user_id;
  
  IF COALESCE(user_level, 0) < 10 THEN
    RETURN json_build_object('success', false, 'error', 'Keine Berechtigung (Level 10 erforderlich)');
  END IF;
  
  -- Insert the announcement
  INSERT INTO public.audio_announcements (
    title,
    description,
    is_tts,
    tts_text,
    voice_id,
    schedule_date,
    audio_file_path,
    duration_seconds,
    is_active,
    created_by
  ) VALUES (
    v_title,
    v_description,
    v_is_tts,
    v_tts_text,
    v_voice_id,
    v_schedule_date,
    v_audio_file_path,
    v_duration_seconds,
    true,
    NULL
  ) RETURNING id INTO new_id;
  
  RETURN json_build_object('success', true, 'id', new_id);
EXCEPTION
  WHEN OTHERS THEN
    RETURN json_build_object('success', false, 'error', SQLERRM);
END;
$$;

-- Create function to toggle announcement status
CREATE OR REPLACE FUNCTION public.toggle_audio_announcement_session(
  v_session_id text,
  v_announcement_id uuid,
  v_is_active boolean
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  current_user_id bigint;
  user_level smallint;
BEGIN
  -- Resolve user from session
  SELECT user_id INTO current_user_id
  FROM public.user_sessions
  WHERE id = v_session_id::uuid
    AND is_active = true
    AND updated_at > NOW() - INTERVAL '7 days';
  
  IF current_user_id IS NULL THEN
    RETURN json_build_object('success', false, 'error', 'Ungültige oder abgelaufene Session');
  END IF;
  
  -- Check permission level
  SELECT permission_lvl INTO user_level
  FROM public.permissions
  WHERE id = current_user_id;
  
  IF COALESCE(user_level, 0) < 10 THEN
    RETURN json_build_object('success', false, 'error', 'Keine Berechtigung (Level 10 erforderlich)');
  END IF;
  
  -- Update the announcement
  UPDATE public.audio_announcements
  SET is_active = v_is_active, updated_at = NOW()
  WHERE id = v_announcement_id;
  
  IF NOT FOUND THEN
    RETURN json_build_object('success', false, 'error', 'Durchsage nicht gefunden');
  END IF;
  
  RETURN json_build_object('success', true);
END;
$$;

-- Create function to delete announcement
CREATE OR REPLACE FUNCTION public.delete_audio_announcement_session(
  v_session_id text,
  v_announcement_id uuid
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  current_user_id bigint;
  user_level smallint;
BEGIN
  -- Resolve user from session
  SELECT user_id INTO current_user_id
  FROM public.user_sessions
  WHERE id = v_session_id::uuid
    AND is_active = true
    AND updated_at > NOW() - INTERVAL '7 days';
  
  IF current_user_id IS NULL THEN
    RETURN json_build_object('success', false, 'error', 'Ungültige oder abgelaufene Session');
  END IF;
  
  -- Check permission level
  SELECT permission_lvl INTO user_level
  FROM public.permissions
  WHERE id = current_user_id;
  
  IF COALESCE(user_level, 0) < 10 THEN
    RETURN json_build_object('success', false, 'error', 'Keine Berechtigung (Level 10 erforderlich)');
  END IF;
  
  -- Delete the announcement
  DELETE FROM public.audio_announcements
  WHERE id = v_announcement_id;
  
  IF NOT FOUND THEN
    RETURN json_build_object('success', false, 'error', 'Durchsage nicht gefunden');
  END IF;
  
  RETURN json_build_object('success', true);
END;
$$;