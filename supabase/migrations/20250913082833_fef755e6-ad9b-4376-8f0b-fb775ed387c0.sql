-- FIX CRITICAL RLS SECURITY ISSUES
-- 1. Fix infinite recursion in permissions table policies  
-- 2. Enable RLS on tables that have policies but RLS disabled

-- First, drop the problematic policies causing infinite recursion
DROP POLICY IF EXISTS "Users can view own profile data" ON public.permissions;
DROP POLICY IF EXISTS "Admins can view all user data" ON public.permissions;
DROP POLICY IF EXISTS "Login function credential access" ON public.permissions;

-- Create security definer functions to avoid infinite recursion
CREATE OR REPLACE FUNCTION public.get_current_user_id()
RETURNS BIGINT AS $$
BEGIN
  RETURN (
    SELECT p.id 
    FROM permissions p 
    WHERE p.username = ((current_setting('request.jwt.claims'::text, true))::json ->> 'sub'::text)
    LIMIT 1
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE SET search_path = public;

CREATE OR REPLACE FUNCTION public.is_current_user_admin_safe()
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 
    FROM permissions p 
    WHERE p.username = ((current_setting('request.jwt.claims'::text, true))::json ->> 'sub'::text)
    AND p.permission_lvl >= 10
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE SET search_path = public;

-- Create secure RLS policies using the functions (no infinite recursion)
CREATE POLICY "Users can view own profile data"
ON public.permissions
FOR SELECT
USING (id = public.get_current_user_id());

CREATE POLICY "Admins can view all user data"
ON public.permissions
FOR SELECT
USING (public.is_current_user_admin_safe());

-- Enable RLS on tables that have policies but RLS disabled
-- Note: Using correct table names from schema
ALTER TABLE public.audio_announcements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_themes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_permissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.level_permissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.announcements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vertretungsplan ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.teachers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."Klassen" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."Stundenplan_10b_A" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."Stundenplan_10c_A" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.document_analysis ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chat_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chat_conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.permission_definitions ENABLE ROW LEVEL SECURITY;