-- Remove old password requirement in change_user_password
CREATE OR REPLACE FUNCTION public.change_user_password(user_id_input bigint, old_password text, new_password text)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  UPDATE permissions
  SET 
    password = new_password,
    must_change_password = false
  WHERE id = user_id_input;
  
  RETURN json_build_object('success', true);
END;
$function$;