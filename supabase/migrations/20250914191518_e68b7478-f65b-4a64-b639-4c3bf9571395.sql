-- Create admin password override function
CREATE OR REPLACE FUNCTION public.admin_change_user_password(admin_user_id bigint, target_user_id bigint, new_password text)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $function$
DECLARE
  admin_permission SMALLINT;
BEGIN
  -- Check if admin has permission level 10
  SELECT permission_lvl INTO admin_permission
  FROM permissions
  WHERE id = admin_user_id;
  
  IF admin_permission IS NULL OR admin_permission < 10 THEN
    RETURN json_build_object('error', 'Keine Berechtigung zum Ändern von Passwörtern');
  END IF;
  
  -- Update target user password with hash
  UPDATE permissions
  SET 
    password = hash_password(new_password),
    must_change_password = false
  WHERE id = target_user_id;
  
  IF NOT FOUND THEN
    RETURN json_build_object('error', 'Benutzer nicht gefunden');
  END IF;
  
  RETURN json_build_object('success', true);
END;
$function$;

-- Migrate existing plaintext passwords (one-time operation)
-- Only migrate if password looks like plaintext (short length, common patterns)
DO $$ 
DECLARE
  user_record RECORD;
BEGIN
  FOR user_record IN 
    SELECT id, password FROM permissions 
    WHERE length(password) < 50 -- Hashed passwords are much longer
  LOOP
    -- Hash the plaintext password
    UPDATE permissions 
    SET password = crypt(user_record.password, gen_salt('bf'))
    WHERE id = user_record.id;
  END LOOP;
END $$;