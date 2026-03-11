-- Ensure public bucket exists and is public
INSERT INTO storage.buckets (id, name, public)
VALUES ('audio-files', 'audio-files', true)
ON CONFLICT (id) DO UPDATE SET public = true;

-- Allow public read access to audio files
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage'
      AND tablename = 'objects'
      AND polname = 'Public read audio-files'
  ) THEN
    CREATE POLICY "Public read audio-files"
    ON storage.objects
    FOR SELECT
    USING (bucket_id = 'audio-files');
  END IF;
END; $$;

-- Allow authenticated users and service role to upload audio files
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage'
      AND tablename = 'objects'
      AND polname = 'Authenticated upload audio-files'
  ) THEN
    CREATE POLICY "Authenticated upload audio-files"
    ON storage.objects
    FOR INSERT
    WITH CHECK (
      bucket_id = 'audio-files'
      AND (auth.role() = 'authenticated' OR auth.role() = 'service_role')
    );
  END IF;
END; $$;

-- Allow authenticated users and service role to delete audio files (used by admin UI)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage'
      AND tablename = 'objects'
      AND polname = 'Authenticated delete audio-files'
  ) THEN
    CREATE POLICY "Authenticated delete audio-files"
    ON storage.objects
    FOR DELETE
    USING (
      bucket_id = 'audio-files'
      AND (auth.role() = 'authenticated' OR auth.role() = 'service_role')
    );
  END IF;
END; $$;