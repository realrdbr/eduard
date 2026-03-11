-- Make audio-announcements bucket public so files can be accessed for playback
UPDATE storage.buckets 
SET public = true 
WHERE id = 'audio-announcements';

-- Allow public read access to audio-announcements files
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage'
      AND tablename = 'objects'
      AND policyname = 'Public read audio-announcements'
  ) THEN
    CREATE POLICY "Public read audio-announcements"
    ON storage.objects
    FOR SELECT
    USING (bucket_id = 'audio-announcements');
  END IF;
END; $$;

-- Allow authenticated users and service role to upload to audio-announcements
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage'
      AND tablename = 'objects'
      AND policyname = 'Authenticated upload audio-announcements'
  ) THEN
    CREATE POLICY "Authenticated upload audio-announcements"
    ON storage.objects
    FOR INSERT
    WITH CHECK (
      bucket_id = 'audio-announcements'
      AND (auth.role() = 'authenticated' OR auth.role() = 'service_role')
    );
  END IF;
END; $$;

-- Allow authenticated users and service role to delete from audio-announcements
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage'
      AND tablename = 'objects'
      AND policyname = 'Authenticated delete audio-announcements'
  ) THEN
    CREATE POLICY "Authenticated delete audio-announcements"
    ON storage.objects
    FOR DELETE
    USING (
      bucket_id = 'audio-announcements'
      AND (auth.role() = 'authenticated' OR auth.role() = 'service_role')
    );
  END IF;
END; $$;