-- Create function for forced password changes (no old password required)
CREATE OR REPLACE FUNCTION public.change_user_password_forced_secure(user_id_input bigint, new_password text)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
BEGIN
  -- Update with new hashed password for forced password changes
  UPDATE permissions
  SET 
    password = hash_password(new_password),
    must_change_password = false
  WHERE id = user_id_input;
  
  IF NOT FOUND THEN
    RETURN json_build_object('error', 'Benutzer nicht gefunden');
  END IF;
  
  RETURN json_build_object('success', true);
END;
$$;