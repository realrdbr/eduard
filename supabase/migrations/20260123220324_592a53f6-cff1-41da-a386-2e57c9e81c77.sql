-- Fix: Security Definer View issue
-- Recreate user_public_info_secure view with SECURITY INVOKER 
-- This ensures RLS policies are applied based on the querying user, not the view creator

DROP VIEW IF EXISTS public.user_public_info_secure;

CREATE VIEW public.user_public_info_secure 
WITH (security_invoker = true) 
AS
SELECT 
    id,
    username,
    name,
    permission_lvl,
    user_class,
    created_at
FROM public.permissions;

-- Grant select permissions to authenticated users
GRANT SELECT ON public.user_public_info_secure TO authenticated;
GRANT SELECT ON public.user_public_info_secure TO anon;

COMMENT ON VIEW public.user_public_info_secure IS 'Secure view exposing non-sensitive user information. Uses SECURITY INVOKER to enforce RLS policies of the querying user.';