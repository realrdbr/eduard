-- Temporäre Entsperrung für Berechtigungs-Tabellen, um Zugriffsprobleme zu beheben
ALTER TABLE public.user_permissions DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.level_permissions DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.permission_definitions DISABLE ROW LEVEL SECURITY;