-- Create a secure RPC function to list all Stundenplan tables
-- Uses pg_catalog.pg_tables which is robust and not subject to RLS
CREATE OR REPLACE FUNCTION public.list_schedule_tables()
RETURNS TABLE(table_name text)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT tablename::text
  FROM pg_catalog.pg_tables
  WHERE schemaname = 'public'
    AND tablename ~ '^Stundenplan_.+_A$'
  ORDER BY tablename;
$$;
