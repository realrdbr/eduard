-- Add keycard fields to permissions table
ALTER TABLE public.permissions ADD COLUMN keycard_number text;
ALTER TABLE public.permissions ADD COLUMN keycard_active boolean DEFAULT true;

-- Create Vertretungsplan table to store substitutions
CREATE TABLE public.vertretungsplan (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  date date NOT NULL,
  class_name text NOT NULL,
  period smallint NOT NULL,
  original_subject text NOT NULL,
  original_teacher text NOT NULL,
  original_room text NOT NULL,
  substitute_teacher text,
  substitute_subject text,
  substitute_room text,
  note text,
  created_by uuid REFERENCES auth.users(id),
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now()
);

-- Enable RLS on vertretungsplan table
ALTER TABLE public.vertretungsplan ENABLE ROW LEVEL SECURITY;

-- Create policies for vertretungsplan
CREATE POLICY "Users can view all substitutions" 
ON public.vertretungsplan 
FOR SELECT 
USING (true);

CREATE POLICY "Teachers can create substitutions" 
ON public.vertretungsplan 
FOR INSERT 
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.profiles p 
    LEFT JOIN public.permissions perm ON p.permission_id = perm.id 
    WHERE p.user_id = auth.uid() AND perm.permission_lvl >= 5
  )
);

CREATE POLICY "Teachers can update their substitutions" 
ON public.vertretungsplan 
FOR UPDATE 
USING (
  EXISTS (
    SELECT 1 FROM public.profiles p 
    LEFT JOIN public.permissions perm ON p.permission_id = perm.id 
    WHERE p.user_id = auth.uid() AND perm.permission_lvl >= 5
  )
);

CREATE POLICY "Teachers can delete substitutions" 
ON public.vertretungsplan 
FOR DELETE 
USING (
  EXISTS (
    SELECT 1 FROM public.profiles p 
    LEFT JOIN public.permissions perm ON p.permission_id = perm.id 
    WHERE p.user_id = auth.uid() AND perm.permission_lvl >= 5
  )
);

-- Create trigger for automatic updated_at
CREATE TRIGGER update_vertretungsplan_updated_at
BEFORE UPDATE ON public.vertretungsplan
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Create announcements table for automatic announcements
CREATE TABLE public.announcements (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  title text NOT NULL,
  content text NOT NULL,
  author text NOT NULL,
  priority text DEFAULT 'normal' CHECK (priority IN ('low', 'normal', 'high', 'urgent')),
  target_class text,
  target_permission_level smallint,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  created_by uuid REFERENCES auth.users(id)
);

-- Enable RLS on announcements table
ALTER TABLE public.announcements ENABLE ROW LEVEL SECURITY;

-- Create policies for announcements
CREATE POLICY "Users can view all announcements" 
ON public.announcements 
FOR SELECT 
USING (true);

CREATE POLICY "Teachers can create announcements" 
ON public.announcements 
FOR INSERT 
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.profiles p 
    LEFT JOIN public.permissions perm ON p.permission_id = perm.id 
    WHERE p.user_id = auth.uid() AND perm.permission_lvl >= 5
  )
);

CREATE POLICY "Teachers can update their announcements" 
ON public.announcements 
FOR UPDATE 
USING (
  EXISTS (
    SELECT 1 FROM public.profiles p 
    LEFT JOIN public.permissions perm ON p.permission_id = perm.id 
    WHERE p.user_id = auth.uid() AND perm.permission_lvl >= 5
  )
);

CREATE POLICY "Teachers can delete announcements" 
ON public.announcements 
FOR DELETE 
USING (
  EXISTS (
    SELECT 1 FROM public.profiles p 
    LEFT JOIN public.permissions perm ON p.permission_id = perm.id 
    WHERE p.user_id = auth.uid() AND perm.permission_lvl >= 5
  )
);

-- Create trigger for automatic updated_at on announcements
CREATE TRIGGER update_announcements_updated_at
BEFORE UPDATE ON public.announcements
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();