-- Step 1: Create secure password hashing functions
CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE OR REPLACE FUNCTION public.hash_password(password_input text)
RETURNS text AS $$
BEGIN
  RETURN crypt(password_input, gen_salt('bf', 10));
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE OR REPLACE FUNCTION public.verify_password(password_input text, password_hash text)
RETURNS boolean AS $$
BEGIN
  RETURN password_hash = crypt(password_input, password_hash);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;