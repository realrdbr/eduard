-- Create secure session-aware delete function for books to avoid connection pool GUC issues
CREATE OR REPLACE FUNCTION public.delete_book_session(b_id uuid, v_session_id text DEFAULT NULL::text)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Ensure session context is set within this transaction
  IF v_session_id IS NOT NULL AND v_session_id <> '' THEN
    PERFORM set_config('app.current_session_id', v_session_id, true);
  END IF;

  -- Permission check: Librarian (level 6+) required
  IF NOT current_user_has_permission_level(6::smallint) THEN
    RETURN json_build_object('success', false, 'error', 'Keine Berechtigung (Level 6 erforderlich)');
  END IF;

  DELETE FROM public.books WHERE id = b_id;

  IF NOT FOUND THEN
    RETURN json_build_object('success', false, 'error', 'Buch nicht gefunden');
  END IF;

  RETURN json_build_object('success', true);
END;
$$;