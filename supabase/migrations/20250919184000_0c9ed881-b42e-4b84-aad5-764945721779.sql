-- Enable RLS on all remaining tables that don't have it enabled
ALTER TABLE public."Klassen" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."Stundenplan_10b_A" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."Stundenplan_10c_A" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.teachers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_contacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_themes ENABLE ROW LEVEL SECURITY;