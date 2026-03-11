-- CRITICAL SECURITY FIXES - Simplified Approach
-- Phase 1: Fix Audio Announcements Access Control
-- Phase 2: Secure User Data Tables
-- Phase 3: Basic Password Hashing Setup

-- ==============================================
-- PHASE 1: CRITICAL - Fix Audio Announcements
-- ==============================================

-- Remove dangerous public access policies from audio_announcements
DROP POLICY IF EXISTS "Public can view audio announcements" ON audio_announcements;
DROP POLICY IF EXISTS "Public can insert audio announcements" ON audio_announcements;
DROP POLICY IF EXISTS "Public can update audio announcements" ON audio_announcements;
DROP POLICY IF EXISTS "Public can delete audio announcements" ON audio_announcements;

-- The secure admin-level policies (permission_lvl >= 10) are already in place

-- ==============================================
-- PHASE 2: CRITICAL - Secure User Data Tables
-- ==============================================

-- 1. SECURE USER_THEMES TABLE
DROP POLICY IF EXISTS "Allow theme operations" ON user_themes;

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
  EXISTS (
    SELECT 1 FROM permissions p 
    WHERE p.username = current_setting('request.jwt.claims', true)::json->>'sub' 
    AND p.permission_lvl >= 10
  )
);

CREATE POLICY "Users can manage their own themes"
ON user_themes
FOR INSERT, UPDATE, DELETE
USING (
  user_id = (
    SELECT p.id 
    FROM permissions p 
    WHERE p.username = current_setting('request.jwt.claims', true)::json->>'sub'
    LIMIT 1
  )
  OR
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
  EXISTS (
    SELECT 1 FROM permissions p 
    WHERE p.username = current_setting('request.jwt.claims', true)::json->>'sub' 
    AND p.permission_lvl >= 10
  )
);

-- 2. SECURE USER_PERMISSIONS TABLE
DROP POLICY IF EXISTS "Public read user perms" ON user_permissions;
DROP POLICY IF EXISTS "Admins manage user perms" ON user_permissions;

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
  EXISTS (
    SELECT 1 FROM permissions p 
    WHERE p.username = current_setting('request.jwt.claims', true)::json->>'sub' 
    AND p.permission_lvl >= 10
  )
);

-- 3. SECURE LEVEL_PERMISSIONS TABLE  
DROP POLICY IF EXISTS "Public read level perms" ON level_permissions;
DROP POLICY IF EXISTS "Admins manage level perms" ON level_permissions;

CREATE POLICY "Admins can manage level permissions"
ON level_permissions
FOR INSERT, UPDATE, DELETE
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
-- PHASE 3: PASSWORD HASHING PREPARATION
-- ==============================================

-- Add password_hash column for future migration to hashed passwords
ALTER TABLE permissions ADD COLUMN IF NOT EXISTS password_hash TEXT;

-- Create a simple password hashing function using md5 as temporary measure
-- Note: This is not ideal but better than plaintext, proper bcrypt can be added later
CREATE OR REPLACE FUNCTION public.hash_password_simple(password_text TEXT)
RETURNS TEXT
LANGUAGE SQL
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT md5(password_text || 'school_salt_2024');
$$;

-- Update verify_user_login to support both plaintext (current) and hashed (future)
CREATE OR REPLACE FUNCTION public.verify_user_login(username_input text, password_input text)
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
      -- Check hashed password if it exists
      (p.password_hash IS NOT NULL AND p.password_hash = public.hash_password_simple(password_input))
      OR
      -- Fallback to plaintext for existing users
      (p.password_hash IS NULL AND p.password = password_input)
    );
END;
$$;

-- Update change_user_password to use hashed passwords going forward
CREATE OR REPLACE FUNCTION public.change_user_password(user_id_input bigint, old_password text, new_password text)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE permissions
  SET 
    password_hash = public.hash_password_simple(new_password),
    password = NULL, -- Clear plaintext password
    must_change_password = false
  WHERE id = user_id_input;
  
  RETURN json_build_object('success', true);
END;
$$;

-- Update create_school_user to use hashed passwords
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
  SELECT permission_lvl INTO creator_permission
  FROM permissions
  WHERE id = creator_user_id;
  
  IF creator_permission IS NULL OR creator_permission < 10 THEN
    RETURN json_build_object('error', 'Keine Berechtigung zum Erstellen von Benutzern');
  END IF;
  
  IF EXISTS (SELECT 1 FROM permissions WHERE username = username_input) THEN
    RETURN json_build_object('error', 'Benutzername bereits vergeben');
  END IF;
  
  INSERT INTO permissions (
    username,
    password_hash,
    name,
    permission_lvl,
    must_change_password
  ) VALUES (
    username_input,
    public.hash_password_simple(password_input),
    full_name_input,
    permission_level_input,
    true
  ) RETURNING id INTO new_user_id;
  
  RETURN json_build_object('success', true, 'user_id', new_user_id);
END;
$$;