-- Update the library permission name to just "Bibliothek"
UPDATE permission_definitions 
SET name = 'Bibliothek' 
WHERE id = 'library_view';