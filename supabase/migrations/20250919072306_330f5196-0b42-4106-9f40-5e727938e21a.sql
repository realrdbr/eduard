-- Create a secure function to load user contacts with user details
-- This bypasses RLS to get contact user information
CREATE OR REPLACE FUNCTION public.get_user_contacts(
  user_id_param bigint
)
RETURNS TABLE (
  contact_id uuid,
  contact_user_id bigint,
  contact_username text,
  contact_name text,
  contact_permission_lvl smallint,
  added_at timestamp with time zone
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    uc.id as contact_id,
    uc.contact_user_id,
    p.username as contact_username,
    p.name as contact_name,
    p.permission_lvl as contact_permission_lvl,
    uc.added_at
  FROM user_contacts uc
  JOIN permissions p ON p.id = uc.contact_user_id
  WHERE uc.user_id = user_id_param 
    AND uc.status = 'active'
  ORDER BY uc.added_at DESC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;