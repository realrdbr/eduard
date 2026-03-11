-- COMPREHENSIVE SECURITY FIXES
-- Phase 1: Critical Issues - Audio Announcements & Password Hashing
-- Phase 2: High Priority - User Data Tables Access Control

-- ==============================================
-- PHASE 1: CRITICAL SECURITY FIXES
-- ==============================================

-- 1. FIX AUDIO ANNOUNCEMENTS - Remove dangerous public access policies
DROP POLICY IF EXISTS "Public can view audio announcements" ON audio_announcements;
DROP POLICY IF EXISTS "Public can insert audio announcements" ON audio_announcements;
DROP POLICY IF EXISTS "Public can update audio announcements" ON audio_announcements;
DROP POLICY IF EXISTS "Public can delete audio announcements" ON audio_announcements;

-- Keep only the secure admin-level policies (permission_lvl >= 10)
-- These are already correctly implemented

-- 2. IMPLEMENT PASSWORD HASHING
-- Enable pgcrypto extension for password hashing
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Add a new column for hashed passwords (we'll migrate gradually)
ALTER TABLE permissions ADD COLUMN IF NOT EXISTS password_hash TEXT;

-- Create secure password hashing function
CREATE OR REPLACE FUNCTION public.hash_password(password_text TEXT)
RETURNS TEXT
LANGUAGE SQL
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT crypt(password_text, gen_salt('bf', 10));
$$;

-- Create password verification function
CREATE OR REPLACE FUNCTION public.verify_password(password_text TEXT, password_hash_text TEXT)
RETURNS BOOLEAN
LANGUAGE SQL
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT crypt(password_text, password_hash_text) = password_hash_text;
$$;

-- Update verify_user_login function to use hashed passwords
CREATE OR REPLACE FUNCTION public.verify_user_login(username_input text, password_input text)
RETURNS TABLE(user_id bigint, profile_id bigint, permission_level smallint, must_change_password boolean, full_name text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Check against hashed password first, fallback to plaintext for migration
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
      -- Check hashed password if it exists
      (p.password_hash IS NOT NULL AND public.verify_password(password_input, p.password_hash))
      OR
      -- Fallback to plaintext for migration period
      (p.password_hash IS NULL AND p.password = password_input)
    );
END;
$$;

-- Update change_user_password function to use hashed passwords
CREATE OR REPLACE FUNCTION public.change_user_password(user_id_input bigint, old_password text, new_password text)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE permissions
  SET 
    password_hash = public.hash_password(new_password),
    password = NULL, -- Clear plaintext password
    must_change_password = false
  WHERE id = user_id_input;
  
  RETURN json_build_object('success', true);
END;
$$;

-- Update create_school_user function to use hashed passwords
CREATE OR REPLACE FUNCTION public.create_school_user(username_input text, password_input text, full_name_input text, permission_level_input smallint, creator_user_id bigint)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  new_user_id BIGINT;
  creator_permission SMALLINT;
BEGIN
  -- Check if creator has permission level 10 (Schulleitung)
  SELECT permission_lvl INTO creator_permission
  FROM permissions
  WHERE id = creator_user_id;
  
  IF creator_permission IS NULL OR creator_permission < 10 THEN
    RETURN json_build_object('error', 'Keine Berechtigung zum Erstellen von Benutzern');
  END IF;
  
  -- Check if username already exists
  IF EXISTS (SELECT 1 FROM permissions WHERE username = username_input) THEN
    RETURN json_build_object('error', 'Benutzername bereits vergeben');
  END IF;
  
  -- Create user with hashed password
  INSERT INTO permissions (
    username,
    password_hash,
    name,
    permission_lvl,
    must_change_password
  ) VALUES (
    username_input,
    public.hash_password(password_input),
    full_name_input,
    permission_level_input,
    true
  ) RETURNING id INTO new_user_id;
  
  RETURN json_build_object('success', true, 'user_id', new_user_id);
END;
$$;

-- Migrate existing plaintext passwords to hashed passwords
UPDATE permissions 
SET 
  password_hash = public.hash_password(password),
  password = NULL
WHERE password_hash IS NULL AND password IS NOT NULL;

-- ==============================================
-- PHASE 2: HIGH PRIORITY - USER DATA TABLES
-- ==============================================

-- 3. SECURE USER_THEMES TABLE - Users should only see their own themes
DROP POLICY IF EXISTS "Allow theme operations" ON user_themes;

-- Create secure policies for user_themes
CREATE POLICY "Users can view their own themes"
ON user_themes
FOR SELECT
USING (
  user_id = (
    SELECT p.id 
    FROM permissions p 
    WHERE p.username = current_setting('request.jwt.claims', true)::json->>'sub'
    LIMIT 1
  )
  OR
  -- Admins can view all themes
  EXISTS (
    SELECT 1 FROM permissions p 
    WHERE p.username = current_setting('request.jwt.claims', true)::json->>'sub' 
    AND p.permission_lvl >= 10
  )
);

CREATE POLICY "Users can manage their own themes"
ON user_themes
FOR ALL
USING (
  user_id = (
    SELECT p.id 
    FROM permissions p 
    WHERE p.username = current_setting('request.jwt.claims', true)::json->>'sub'
    LIMIT 1
  )
  OR
  -- Admins can manage all themes
  EXISTS (
    SELECT 1 FROM permissions p 
    WHERE p.username = current_setting('request.jwt.claims', true)::json->>'sub' 
    AND p.permission_lvl >= 10
  )
)
WITH CHECK (
  user_id = (
    SELECT p.id 
    FROM permissions p 
    WHERE p.username = current_setting('request.jwt.claims', true)::json->>'sub'
    LIMIT 1
  )
  OR
  -- Admins can manage all themes
  EXISTS (
    SELECT 1 FROM permissions p 
    WHERE p.username = current_setting('request.jwt.claims', true)::json->>'sub' 
    AND p.permission_lvl >= 10
  )
);

-- 4. SECURE USER_PERMISSIONS TABLE - Limit access to admins and affected users
DROP POLICY IF EXISTS "Public read user perms" ON user_permissions;
DROP POLICY IF EXISTS "Admins manage user perms" ON user_permissions;

-- Only admins can manage user permissions
CREATE POLICY "Admins can manage user permissions"
ON user_permissions
FOR ALL
USING (
  EXISTS (
    SELECT 1 FROM permissions p 
    WHERE p.username = current_setting('request.jwt.claims', true)::json->>'sub' 
    AND p.permission_lvl >= 10
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM permissions p 
    WHERE p.username = current_setting('request.jwt.claims', true)::json->>'sub' 
    AND p.permission_lvl >= 10
  )
);

-- Users can only see their own permission overrides
CREATE POLICY "Users can view their own permission overrides"
ON user_permissions
FOR SELECT
USING (
  user_id = (
    SELECT p.id 
    FROM permissions p 
    WHERE p.username = current_setting('request.jwt.claims', true)::json->>'sub'
    LIMIT 1
  )
  OR
  -- Admins can view all
  EXISTS (
    SELECT 1 FROM permissions p 
    WHERE p.username = current_setting('request.jwt.claims', true)::json->>'sub' 
    AND p.permission_lvl >= 10
  )
);

-- 5. SECURE LEVEL_PERMISSIONS TABLE - Limit management to admins only
DROP POLICY IF EXISTS "Public read level perms" ON level_permissions;
DROP POLICY IF EXISTS "Admins manage level perms" ON level_permissions;

-- Only admins can manage level permissions
CREATE POLICY "Admins can manage level permissions"
ON level_permissions
FOR ALL
USING (
  EXISTS (
    SELECT 1 FROM permissions p 
    WHERE p.username = current_setting('request.jwt.claims', true)::json->>'sub' 
    AND p.permission_lvl >= 10
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM permissions p 
    WHERE p.username = current_setting('request.jwt.claims', true)::json->>'sub' 
    AND p.permission_lvl >= 10
  )
);

-- Everyone can read level permissions (needed for permission checking)
CREATE POLICY "Users can view level permissions"
ON level_permissions
FOR SELECT
USING (true);

-- ==============================================
-- PHASE 3: DATABASE FUNCTION SECURITY HARDENING
-- ==============================================

-- Update existing functions to include search_path for security
CREATE OR REPLACE FUNCTION public.check_user_permission(user_id_param bigint, permission_id_param text)
RETURNS boolean
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  user_level INTEGER;
  user_specific_permission BOOLEAN;
  level_permission BOOLEAN;
BEGIN
  -- Get user's permission level
  SELECT permission_lvl INTO user_level
  FROM permissions 
  WHERE id = user_id_param;
  
  IF user_level IS NULL THEN
    RETURN FALSE;
  END IF;
  
  -- Check for user-specific permission override first
  SELECT allowed INTO user_specific_permission
  FROM user_permissions 
  WHERE user_id = user_id_param AND permission_id = permission_id_param;
  
  -- If user has specific permission set, use that
  IF user_specific_permission IS NOT NULL THEN
    RETURN user_specific_permission;
  END IF;
  
  -- Otherwise check level-based permission
  SELECT allowed INTO level_permission
  FROM level_permissions 
  WHERE level = user_level AND permission_id = permission_id_param;
  
  RETURN COALESCE(level_permission, FALSE);
END;
$$;

CREATE OR REPLACE FUNCTION public.get_current_user_permission_level()
RETURNS smallint
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN (
    SELECT perm.permission_lvl
    FROM profiles p
    LEFT JOIN permissions perm ON p.permission_id = perm.id
    WHERE p.user_id = auth.uid()
    LIMIT 1
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.is_current_user_admin()
RETURNS boolean
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN COALESCE(public.get_current_user_permission_level() >= 10, false);
END;
$$;