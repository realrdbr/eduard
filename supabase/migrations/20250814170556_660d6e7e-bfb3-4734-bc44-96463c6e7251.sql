-- Create audio announcements table
CREATE TABLE public.audio_announcements (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT,
  audio_file_path TEXT,
  is_tts BOOLEAN NOT NULL DEFAULT false,
  tts_text TEXT,
  voice_id TEXT DEFAULT 'alloy',
  duration_seconds INTEGER,
  is_active BOOLEAN NOT NULL DEFAULT true,
  schedule_date TIMESTAMP WITH TIME ZONE,
  created_by UUID NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  played_at TIMESTAMP WITH TIME ZONE
);

-- Enable RLS
ALTER TABLE public.audio_announcements ENABLE ROW LEVEL SECURITY;

-- Create policies for audio announcements
CREATE POLICY "School administration can manage audio announcements"
ON public.audio_announcements
FOR ALL
TO authenticated
USING ((
  SELECT perm.permission_lvl >= 10
  FROM public.profiles p
  LEFT JOIN public.permissions perm ON p.permission_id = perm.id
  WHERE p.user_id = auth.uid()
))
WITH CHECK ((
  SELECT perm.permission_lvl >= 10
  FROM public.profiles p
  LEFT JOIN public.permissions perm ON p.permission_id = perm.id
  WHERE p.user_id = auth.uid()
));

-- Create storage bucket for audio announcements
INSERT INTO storage.buckets (id, name, public) VALUES ('audio-announcements', 'audio-announcements', false);

-- Create storage policies for audio announcements
CREATE POLICY "School administration can upload audio announcements"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'audio-announcements' AND
  (
    SELECT perm.permission_lvl >= 10
    FROM public.profiles p
    LEFT JOIN public.permissions perm ON p.permission_id = perm.id
    WHERE p.user_id = auth.uid()
  )
);

CREATE POLICY "School administration can view audio announcements"
ON storage.objects
FOR SELECT
TO authenticated
USING (
  bucket_id = 'audio-announcements' AND
  (
    SELECT perm.permission_lvl >= 10
    FROM public.profiles p
    LEFT JOIN public.permissions perm ON p.permission_id = perm.id
    WHERE p.user_id = auth.uid()
  )
);

CREATE POLICY "School administration can delete audio announcements"
ON storage.objects
FOR DELETE
TO authenticated
USING (
  bucket_id = 'audio-announcements' AND
  (
    SELECT perm.permission_lvl >= 10
    FROM public.profiles p
    LEFT JOIN public.permissions perm ON p.permission_id = perm.id
    WHERE p.user_id = auth.uid()
  )
);

-- Add trigger for updated_at
CREATE TRIGGER update_audio_announcements_updated_at
BEFORE UPDATE ON public.audio_announcements
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();