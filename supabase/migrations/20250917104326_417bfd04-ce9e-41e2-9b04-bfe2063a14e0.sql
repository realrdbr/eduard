-- Create books table
CREATE TABLE public.books (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  isbn VARCHAR(13) UNIQUE,
  title TEXT NOT NULL,
  author TEXT NOT NULL,
  publisher TEXT,
  publication_year INTEGER,
  genre TEXT,
  total_copies INTEGER NOT NULL DEFAULT 1,
  available_copies INTEGER NOT NULL DEFAULT 1,
  description TEXT,
  cover_image_url TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create loans table for tracking book loans
CREATE TABLE public.loans (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  book_id UUID NOT NULL REFERENCES public.books(id) ON DELETE CASCADE,
  user_id BIGINT NOT NULL REFERENCES public.permissions(id) ON DELETE CASCADE,
  keycard_number TEXT,
  loan_date TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  due_date TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT (now() + INTERVAL '14 days'),
  return_date TIMESTAMP WITH TIME ZONE,
  is_returned BOOLEAN NOT NULL DEFAULT false,
  librarian_id BIGINT REFERENCES public.permissions(id),
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS on both tables
ALTER TABLE public.books ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.loans ENABLE ROW LEVEL SECURITY;

-- RLS Policies for books table
CREATE POLICY "Everyone can view books" 
ON public.books 
FOR SELECT 
USING (true);

CREATE POLICY "Librarians can manage books" 
ON public.books 
FOR ALL 
USING (current_user_has_permission_level(6::smallint))
WITH CHECK (current_user_has_permission_level(6::smallint));

-- RLS Policies for loans table
CREATE POLICY "Users can view their own loans" 
ON public.loans 
FOR SELECT 
USING (
  user_id = get_current_user_from_session() OR 
  current_user_has_permission_level(6::smallint)
);

CREATE POLICY "Librarians can manage all loans" 
ON public.loans 
FOR ALL 
USING (current_user_has_permission_level(6::smallint))
WITH CHECK (current_user_has_permission_level(6::smallint));

-- Create triggers for updated_at columns
CREATE TRIGGER update_books_updated_at
BEFORE UPDATE ON public.books
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_loans_updated_at
BEFORE UPDATE ON public.loans
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Add some sample books
INSERT INTO public.books (isbn, title, author, publisher, publication_year, genre, total_copies, available_copies, description) VALUES
('9783446203019', 'Der kleine Prinz', 'Antoine de Saint-Exupéry', 'Hanser Verlag', 1943, 'Klassiker', 3, 3, 'Ein zeitloser Klassiker über Freundschaft und die wichtigen Dinge im Leben.'),
('9783423082174', 'Die Welle', 'Morton Rhue', 'dtv', 1981, 'Jugendbuch', 5, 5, 'Ein erschütternder Roman über Macht und Manipulation.'),
('9783551551672', 'Harry Potter und der Stein der Weisen', 'J.K. Rowling', 'Carlsen Verlag', 1997, 'Fantasy', 4, 4, 'Der erste Band der berühmten Harry Potter Serie.'),
('9783423713078', 'Tschick', 'Wolfgang Herrndorf', 'dtv', 2010, 'Jugendbuch', 3, 3, 'Eine unvergessliche Reise zweier Jugendlicher durch Deutschland.');

-- Add permission definitions for library functions
INSERT INTO public.permission_definitions (id, name, description, requires_level) VALUES
('library_view', 'Bibliothek anzeigen', 'Kann die Bibliothek-Seite aufrufen und Bücher suchen', 1),
('library_manage_books', 'Bücher verwalten', 'Kann Bücher hinzufügen, bearbeiten und löschen', 6),
('library_manage_loans', 'Ausleihen verwalten', 'Kann Buchausleihen und -rückgaben durchführen', 6),
('library_view_all_users', 'Alle Benutzer anzeigen', 'Kann alle Bibliotheksbenutzer und deren Ausleihen einsehen', 6);

-- Add default level permissions for library
INSERT INTO public.level_permissions (level, permission_id, allowed) VALUES
(1, 'library_view', true),
(2, 'library_view', true),  
(4, 'library_view', true),
(6, 'library_view', true),
(6, 'library_manage_books', true),
(6, 'library_manage_loans', true),
(6, 'library_view_all_users', true),
(10, 'library_view', true),
(10, 'library_manage_books', true),
(10, 'library_manage_loans', true),
(10, 'library_view_all_users', true);