-- Add username and password fields to profiles table
ALTER TABLE public.profiles 
ADD COLUMN username TEXT UNIQUE,
ADD COLUMN password_hash TEXT,
ADD COLUMN must_change_password BOOLEAN DEFAULT false,
ADD COLUMN created_by UUID REFERENCES auth.users(id);

-- Update profiles table to make email nullable since we'll use username
ALTER TABLE public.profiles 
ALTER COLUMN email DROP NOT NULL;

-- Create index on username for faster lookups
CREATE INDEX idx_profiles_username ON public.profiles(username);

-- Create function to verify username/password login
CREATE OR REPLACE FUNCTION public.verify_user_login(username_input TEXT, password_input TEXT)
RETURNS TABLE(
  user_id UUID,
  profile_id UUID,
  permission_level SMALLINT,
  must_change_password BOOLEAN,
  full_name TEXT
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    p.user_id,
    p.id as profile_id,
    perm.permission_lvl,
    p.must_change_password,
    p.full_name
  FROM public.profiles p
  LEFT JOIN public.permissions perm ON p.permission_id = perm.id
  WHERE p.username = username_input 
    AND p.password_hash = crypt(password_input, p.password_hash);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = '';

-- Create function to create new user (only callable by permission level 10)
CREATE OR REPLACE FUNCTION public.create_school_user(
  username_input TEXT,
  password_input TEXT,
  full_name_input TEXT,
  permission_level_input SMALLINT,
  creator_user_id UUID
)
RETURNS JSON AS $$
DECLARE
  new_user_id UUID;
  creator_permission SMALLINT;
  permission_id_val BIGINT;
BEGIN
  -- Check if creator has permission level 10 (Schulleitung)
  SELECT perm.permission_lvl INTO creator_permission
  FROM public.profiles prof
  LEFT JOIN public.permissions perm ON prof.permission_id = perm.id
  WHERE prof.user_id = creator_user_id;
  
  IF creator_permission IS NULL OR creator_permission < 10 THEN
    RETURN json_build_object('error', 'Keine Berechtigung zum Erstellen von Benutzern');
  END IF;
  
  -- Check if username already exists
  IF EXISTS (SELECT 1 FROM public.profiles WHERE username = username_input) THEN
    RETURN json_build_object('error', 'Benutzername bereits vergeben');
  END IF;
  
  -- Get permission id for the requested level
  SELECT id INTO permission_id_val 
  FROM public.permissions 
  WHERE permission_lvl = permission_level_input;
  
  IF permission_id_val IS NULL THEN
    RETURN json_build_object('error', 'Ungültiges Permission Level');
  END IF;
  
  -- Create auth user with dummy email
  INSERT INTO auth.users (
    instance_id,
    id,
    aud,
    role,
    email,
    encrypted_password,
    email_confirmed_at,
    recovery_sent_at,
    last_sign_in_at,
    raw_app_meta_data,
    raw_user_meta_data,
    created_at,
    updated_at,
    confirmation_token,
    email_change,
    email_change_token_new,
    recovery_token
  ) VALUES (
    '00000000-0000-0000-0000-000000000000',
    gen_random_uuid(),
    'authenticated',
    'authenticated',
    username_input || '@internal.school',  -- Dummy email
    crypt(password_input, gen_salt('bf')),
    NOW(),
    NULL,
    NULL,
    '{"provider": "username", "providers": ["username"]}',
    json_build_object('username', username_input, 'full_name', full_name_input),
    NOW(),
    NOW(),
    '',
    '',
    '',
    ''
  ) RETURNING id INTO new_user_id;
  
  -- Create profile
  INSERT INTO public.profiles (
    user_id,
    username,
    password_hash,
    full_name,
    permission_id,
    must_change_password,
    created_by
  ) VALUES (
    new_user_id,
    username_input,
    crypt(password_input, gen_salt('bf')),
    full_name_input,
    permission_id_val,
    true,  -- Must change password on first login
    creator_user_id
  );
  
  RETURN json_build_object('success', true, 'user_id', new_user_id);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = '';

-- Create function to change password
CREATE OR REPLACE FUNCTION public.change_user_password(
  user_id_input UUID,
  old_password TEXT,
  new_password TEXT
)
RETURNS JSON AS $$
DECLARE
  current_hash TEXT;
BEGIN
  -- Verify old password
  SELECT password_hash INTO current_hash
  FROM public.profiles
  WHERE user_id = user_id_input;
  
  IF current_hash IS NULL OR current_hash != crypt(old_password, current_hash) THEN
    RETURN json_build_object('error', 'Falsches aktuelles Passwort');
  END IF;
  
  -- Update password and remove must_change_password flag
  UPDATE public.profiles
  SET 
    password_hash = crypt(new_password, gen_salt('bf')),
    must_change_password = false,
    updated_at = NOW()
  WHERE user_id = user_id_input;
  
  -- Also update auth.users table
  UPDATE auth.users
  SET 
    encrypted_password = crypt(new_password, gen_salt('bf')),
    updated_at = NOW()
  WHERE id = user_id_input;
  
  RETURN json_build_object('success', true);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = '';

-- Enable pgcrypto extension for password hashing
CREATE EXTENSION IF NOT EXISTS pgcrypto;