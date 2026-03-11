-- Create RLS policies for audio_announcements table
ALTER TABLE public.audio_announcements ENABLE ROW LEVEL SECURITY;

-- Policy to allow users with permission level 10+ to view all announcements
CREATE POLICY "Level 10+ users can view audio announcements" 
ON public.audio_announcements 
FOR SELECT 
USING (
  EXISTS (
    SELECT 1 FROM public.permissions p 
    WHERE p.username = current_setting('request.jwt.claims', true)::json->>'sub' 
    AND p.permission_lvl >= 10
  )
);

-- Policy to allow users with permission level 10+ to insert announcements
CREATE POLICY "Level 10+ users can create audio announcements" 
ON public.audio_announcements 
FOR INSERT 
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.permissions p 
    WHERE p.username = current_setting('request.jwt.claims', true)::json->>'sub' 
    AND p.permission_lvl >= 10
  )
);

-- Policy to allow users with permission level 10+ to update announcements
CREATE POLICY "Level 10+ users can update audio announcements" 
ON public.audio_announcements 
FOR UPDATE 
USING (
  EXISTS (
    SELECT 1 FROM public.permissions p 
    WHERE p.username = current_setting('request.jwt.claims', true)::json->>'sub' 
    AND p.permission_lvl >= 10
  )
);

-- Policy to allow users with permission level 10+ to delete announcements
CREATE POLICY "Level 10+ users can delete audio announcements" 
ON public.audio_announcements 
FOR DELETE 
USING (
  EXISTS (
    SELECT 1 FROM public.permissions p 
    WHERE p.username = current_setting('request.jwt.claims', true)::json->>'sub' 
    AND p.permission_lvl >= 10
  )
);

-- Create audio-files storage bucket for consistency with native-tts function
INSERT INTO storage.buckets (id, name, public) 
VALUES ('audio-files', 'audio-files', false)
ON CONFLICT (id) DO NOTHING;

-- Create storage policies for audio-files bucket
CREATE POLICY "Level 10+ users can upload audio files" 
ON storage.objects 
FOR INSERT 
WITH CHECK (
  bucket_id = 'audio-files' AND
  EXISTS (
    SELECT 1 FROM public.permissions p 
    WHERE p.username = current_setting('request.jwt.claims', true)::json->>'sub' 
    AND p.permission_lvl >= 10
  )
);

CREATE POLICY "Level 10+ users can view audio files" 
ON storage.objects 
FOR SELECT 
USING (
  bucket_id = 'audio-files' AND
  EXISTS (
    SELECT 1 FROM public.permissions p 
    WHERE p.username = current_setting('request.jwt.claims', true)::json->>'sub' 
    AND p.permission_lvl >= 10
  )
);

-- Also make the created_by field nullable since we're not using Supabase auth
ALTER TABLE public.audio_announcements 
ALTER COLUMN created_by DROP NOT NULL;