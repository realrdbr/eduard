-- Fix create_user_session to upsert on unique user_id and avoid conflicts
CREATE OR REPLACE FUNCTION public.create_user_session(user_id_param bigint)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  new_session_id uuid := gen_random_uuid();
  new_token uuid := gen_random_uuid();
  result_id uuid;
BEGIN
  -- Upsert single row per user_id; refresh id and token
  INSERT INTO user_sessions (id, user_id, session_token, is_active, is_primary)
  VALUES (new_session_id, user_id_param, new_token, true, true)
  ON CONFLICT (user_id) DO UPDATE
    SET id = EXCLUDED.id,
        session_token = EXCLUDED.session_token,
        is_active = true,
        is_primary = true,
        updated_at = now()
  RETURNING id INTO result_id;

  -- Ensure all other sessions (if any still exist) are not primary
  UPDATE user_sessions 
  SET is_primary = false 
  WHERE user_id = user_id_param AND id != result_id;

  RETURN result_id;
END;
$$;