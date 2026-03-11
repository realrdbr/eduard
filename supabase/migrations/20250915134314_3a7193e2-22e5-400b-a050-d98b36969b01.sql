-- Create function to set session context
CREATE OR REPLACE FUNCTION public.set_session_context(session_id_param text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  PERFORM set_config('app.current_session_id', session_id_param, false);
END;
$$;