-- Ensure pgcrypto is available in the public schema and recreate password functions safely
CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA public;

-- Recreate secure password hashing function using bcrypt via pgcrypto
CREATE OR REPLACE FUNCTION public.hash_password(password_input text)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN public.crypt(password_input, public.gen_salt('bf', 10));
END;
$$;

-- Recreate password verification function
CREATE OR REPLACE FUNCTION public.verify_password(password_input text, password_hash text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN password_hash = public.crypt(password_input, password_hash);
END;
$$;

-- Recreate secure login function to ensure it references the latest helpers
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

-- One-time safety migration: hash any remaining plaintext passwords
-- Detect non-bcrypt values (bcrypt hashes start with $2a$, $2b$, or $2y$)
UPDATE permissions
SET password = public.hash_password(password)
WHERE password IS NOT NULL
  AND NOT (password LIKE '$2a$%' OR password LIKE '$2b$%' OR password LIKE '$2y$%');