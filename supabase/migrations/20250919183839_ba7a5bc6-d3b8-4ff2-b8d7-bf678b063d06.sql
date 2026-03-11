-- Add permissive read access to permissions table for authenticated users to see basic user info
CREATE POLICY "Authenticated users can view basic user info" 
ON public.permissions 
FOR SELECT 
USING ((get_current_user_id() IS NOT NULL OR is_custom_user_authenticated()));

-- Enable RLS on missing tables that have policies but no RLS enabled
ALTER TABLE public.Klassen ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.Stundenplan_10b_A ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.Stundenplan_10c_A ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.announcements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audio_announcements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.books ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.private_conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.private_messages ENABLE ROW LEVEL SECURITY;