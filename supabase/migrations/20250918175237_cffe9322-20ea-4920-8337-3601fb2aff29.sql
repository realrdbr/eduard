-- Fix book update function to correctly handle available_copies when total_copies changes

CREATE OR REPLACE FUNCTION public.update_book_session(b_id uuid, b_title text, b_author text, b_isbn text DEFAULT NULL::text, b_publisher text DEFAULT NULL::text, b_publication_year integer DEFAULT NULL::integer, b_genre text DEFAULT NULL::text, b_total_copies integer DEFAULT 1, b_description text DEFAULT NULL::text, v_session_id text DEFAULT NULL::text)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  old_total_copies INTEGER;
  old_available_copies INTEGER;
  copies_difference INTEGER;
  new_available_copies INTEGER;
BEGIN
  -- Ensure session context is set within this transaction
  IF v_session_id IS NOT NULL AND v_session_id <> '' THEN
    PERFORM set_config('app.current_session_id', v_session_id, true);
  END IF;

  -- Permission check: Librarian (level 6+) required
  IF NOT current_user_has_permission_level(6::smallint) THEN
    RETURN json_build_object('success', false, 'error', 'Keine Berechtigung (Level 6 erforderlich)');
  END IF;

  -- Get current total_copies and available_copies
  SELECT total_copies, available_copies 
  INTO old_total_copies, old_available_copies
  FROM public.books 
  WHERE id = b_id;

  IF NOT FOUND THEN
    RETURN json_build_object('success', false, 'error', 'Buch nicht gefunden');
  END IF;

  -- Calculate difference in total copies
  copies_difference := b_total_copies - old_total_copies;
  
  -- Calculate new available copies
  new_available_copies := old_available_copies + copies_difference;
  
  -- Ensure available copies don't go negative
  IF new_available_copies < 0 THEN
    new_available_copies := 0;
  END IF;

  -- Update the book with all fields including corrected available_copies
  UPDATE public.books 
  SET 
    isbn = b_isbn,
    title = b_title,
    author = b_author,
    publisher = b_publisher,
    publication_year = b_publication_year,
    genre = b_genre,
    total_copies = b_total_copies,
    available_copies = new_available_copies,
    description = b_description,
    updated_at = now()
  WHERE id = b_id;

  RETURN json_build_object('success', true, 'message', 
    CASE 
      WHEN copies_difference > 0 THEN 
        'Buch aktualisiert. ' || copies_difference || ' Exemplare hinzugefügt.'
      WHEN copies_difference < 0 THEN 
        'Buch aktualisiert. ' || ABS(copies_difference) || ' Exemplare entfernt.'
      ELSE 
        'Buch aktualisiert.'
    END
  );
END;
$function$;