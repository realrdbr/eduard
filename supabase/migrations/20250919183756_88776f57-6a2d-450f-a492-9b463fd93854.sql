-- Create a secure function to fetch public info for a given user ID
CREATE OR REPLACE FUNCTION public.get_user_public_info(user_id_param bigint)
RETURNS TABLE(id bigint, username text, name text, permission_lvl smallint)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT p.id, p.username, p.name, p.permission_lvl
  FROM permissions p
  WHERE p.id = user_id_param
  LIMIT 1;
END;
$$;