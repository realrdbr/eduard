-- Create secure session-aware functions for book operations
CREATE OR REPLACE FUNCTION public.add_book_session(
  b_isbn text DEFAULT NULL,
  b_title text,
  b_author text,
  b_publisher text DEFAULT NULL,
  b_publication_year integer DEFAULT NULL,
  b_genre text DEFAULT NULL,
  b_total_copies integer DEFAULT 1,
  b_description text DEFAULT NULL,
  v_session_id text DEFAULT NULL::text
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  new_book_id uuid;
BEGIN
  -- Ensure session context is set within this transaction
  IF v_session_id IS NOT NULL AND v_session_id <> '' THEN
    PERFORM set_config('app.current_session_id', v_session_id, true);
  END IF;

  -- Permission check: Librarian (level 6+) required
  IF NOT current_user_has_permission_level(6::smallint) THEN
    RETURN json_build_object('success', false, 'error', 'Keine Berechtigung (Level 6 erforderlich)');
  END IF;

  INSERT INTO public.books (
    isbn, title, author, publisher, publication_year, genre, 
    total_copies, available_copies, description
  ) VALUES (
    b_isbn, b_title, b_author, b_publisher, b_publication_year, b_genre,
    b_total_copies, b_total_copies, b_description
  ) RETURNING id INTO new_book_id;

  RETURN json_build_object('success', true, 'id', new_book_id);
END;
$$;

CREATE OR REPLACE FUNCTION public.update_book_session(
  b_id uuid,
  b_isbn text DEFAULT NULL,
  b_title text,
  b_author text,
  b_publisher text DEFAULT NULL,
  b_publication_year integer DEFAULT NULL,
  b_genre text DEFAULT NULL,
  b_total_copies integer DEFAULT 1,
  b_description text DEFAULT NULL,
  v_session_id text DEFAULT NULL::text
)
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

  UPDATE public.books 
  SET 
    isbn = b_isbn,
    title = b_title,
    author = b_author,
    publisher = b_publisher,
    publication_year = b_publication_year,
    genre = b_genre,
    total_copies = b_total_copies,
    description = b_description,
    updated_at = now()
  WHERE id = b_id;

  IF NOT FOUND THEN
    RETURN json_build_object('success', false, 'error', 'Buch nicht gefunden');
  END IF;

  RETURN json_build_object('success', true);
END;
$$;