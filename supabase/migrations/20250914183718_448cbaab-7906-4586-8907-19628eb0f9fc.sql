-- Enable Realtime for user_permissions and level_permissions tables
ALTER TABLE public.user_permissions REPLICA IDENTITY FULL;
ALTER TABLE public.level_permissions REPLICA IDENTITY FULL;

-- Add tables to supabase_realtime publication
ALTER PUBLICATION supabase_realtime ADD TABLE public.user_permissions;
ALTER PUBLICATION supabase_realtime ADD TABLE public.level_permissions;