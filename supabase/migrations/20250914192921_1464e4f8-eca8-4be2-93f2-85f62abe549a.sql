-- Ensure pgcrypto extension is installed (default schema)
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Use pgcrypto schema-qualified calls to avoid search_path issues
CREATE OR REPLACE FUNCTION public.hash_password(password_input text)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN pgcrypto.crypt(password_input, pgcrypto.gen_salt('bf', 10));
END;
$$;

CREATE OR REPLACE FUNCTION public.verify_password(password_input text, password_hash text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN password_hash = pgcrypto.crypt(password_input, password_hash);
END;
$$;

-- Recreate login function to reference the updated verify_password
CREATE OR REPLACE FUNCTION public.verify_user_login_secure(username_input text, password_input text)
RETURNS TABLE(user_id bigint, profile_id bigint, permission_level smallint, must_change_password boolean, full_name text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    p.id::bigint as user_id,
    p.id::bigint as profile_id,
    p.permission_lvl,
    p.must_change_password,
    p.name as full_name
  FROM permissions p
  WHERE p.username = username_input 
    AND public.verify_password(password_input, p.password);
END;
$$;