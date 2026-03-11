-- Add RLS policies for permissions table
ALTER TABLE public.permissions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Everyone can view permissions" 
ON public.permissions 
FOR SELECT 
USING (true);

-- Add RLS policies for schedule tables
ALTER TABLE public."Stundenplan_10b_A" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."Stundenplan_10c_A" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Everyone can view schedule 10b_A" 
ON public."Stundenplan_10b_A" 
FOR SELECT 
USING (true);

CREATE POLICY "Everyone can view schedule 10c_A" 
ON public."Stundenplan_10c_A" 
FOR SELECT 
USING (true);

-- Fix function search path issues
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql
SECURITY DEFINER SET search_path = '';

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (user_id, email, full_name, permission_id)
  VALUES (
    NEW.id, 
    NEW.email, 
    NEW.raw_user_meta_data ->> 'full_name',
    (SELECT id FROM public.permissions WHERE permission_lvl = 1 LIMIT 1)
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql
SECURITY DEFINER SET search_path = '';