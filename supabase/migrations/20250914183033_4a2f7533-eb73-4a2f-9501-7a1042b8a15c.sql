-- Enable realtime for permissions table
ALTER TABLE public.permissions REPLICA IDENTITY FULL;

-- Add permissions table to realtime publication
ALTER PUBLICATION supabase_realtime ADD TABLE public.permissions;