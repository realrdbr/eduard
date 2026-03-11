-- Create a secure function to search for users
-- This bypasses RLS to allow searching for other users
CREATE OR REPLACE FUNCTION public.search_user_directory(
  search_term text,
  current_user_id bigint DEFAULT NULL
)
RETURNS TABLE (
  id bigint,
  username text,
  name text,
  permission_lvl smallint
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    p.id,
    p.username,
    p.name,
    p.permission_lvl
  FROM permissions p
  WHERE (
    p.name ILIKE '%' || search_term || '%' 
    OR p.username ILIKE '%' || search_term || '%'
  )
  AND (current_user_id IS NULL OR p.id != current_user_id)
  ORDER BY p.name
  LIMIT 20;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;