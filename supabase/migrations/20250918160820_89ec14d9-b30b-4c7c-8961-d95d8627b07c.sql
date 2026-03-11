-- Update the create_school_user_secure function to include keycard information
CREATE OR REPLACE FUNCTION public.create_school_user_secure(
  username_input text, 
  password_input text, 
  full_name_input text, 
  permission_level_input smallint, 
  creator_user_id bigint,
  keycard_number_input text DEFAULT NULL,
  keycard_active_input boolean DEFAULT true
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $function$
DECLARE
  new_user_id BIGINT;
  creator_permission SMALLINT;
BEGIN
  -- Check if creator has permission level 10 (Schulleitung)
  SELECT permission_lvl INTO creator_permission
  FROM permissions
  WHERE id = creator_user_id;
  
  IF creator_permission IS NULL OR creator_permission < 10 THEN
    RETURN json_build_object('error', 'Keine Berechtigung zum Erstellen von Benutzern');
  END IF;
  
  -- Check if username already exists
  IF EXISTS (SELECT 1 FROM permissions WHERE username = username_input) THEN
    RETURN json_build_object('error', 'Benutzername bereits vergeben');
  END IF;
  
  -- Check if keycard number already exists (if provided)
  IF keycard_number_input IS NOT NULL AND keycard_number_input != '' THEN
    IF EXISTS (SELECT 1 FROM permissions WHERE keycard_number = keycard_number_input) THEN
      RETURN json_build_object('error', 'Keycard-Nummer bereits vergeben');
    END IF;
  END IF;
  
  -- Create user with hashed password and keycard info
  INSERT INTO permissions (
    username,
    password,
    name,
    permission_lvl,
    must_change_password,
    keycard_number,
    keycard_active
  ) VALUES (
    username_input,
    hash_password(password_input),
    full_name_input,
    permission_level_input,
    true,
    CASE WHEN keycard_number_input = '' THEN NULL ELSE keycard_number_input END,
    keycard_active_input
  ) RETURNING id INTO new_user_id;
  
  RETURN json_build_object('success', true, 'user_id', new_user_id);
END;
$function$;