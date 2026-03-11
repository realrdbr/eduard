-- Fix pgcrypto usage: install extension and recreate functions to use public schema
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Secure hash using bcrypt via pgcrypto (functions live in public schema by default)
CREATE OR REPLACE FUNCTION public.hash_password(password_input text)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN crypt(password_input, gen_salt('bf', 10));
END;
$$;

-- Verify password (supports bcrypt hashes)
CREATE OR REPLACE FUNCTION public.verify_password(password_input text, password_hash text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN password_hash = crypt(password_input, password_hash);
END;
$$;

-- Login function referencing the updated verify_password
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
    AND (
      -- hashed path
      (p.password LIKE '$2%'
        AND verify_password(password_input, p.password))
      OR
      -- temporary fallback for legacy plaintext values
      (p.password NOT LIKE '$2%'
        AND p.password = password_input)
    );
END;
$$;

-- One-time migration: hash any remaining plaintext passwords safely
UPDATE permissions
SET password = hash_password(password)
WHERE password IS NOT NULL AND password NOT LIKE '$2%';