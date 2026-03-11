
-- Allow Level 10+ admins to insert classes via session
CREATE POLICY "Level 10+ can insert classes"
ON public."Klassen"
FOR INSERT
WITH CHECK (current_user_has_permission_level((10)::smallint));

-- Allow Level 10+ admins to update classes via session
CREATE POLICY "Level 10+ can update classes"
ON public."Klassen"
FOR UPDATE
USING (current_user_has_permission_level((10)::smallint))
WITH CHECK (current_user_has_permission_level((10)::smallint));

-- Allow Level 10+ admins to delete classes via session
CREATE POLICY "Level 10+ can delete classes"
ON public."Klassen"
FOR DELETE
USING (current_user_has_permission_level((10)::smallint));
