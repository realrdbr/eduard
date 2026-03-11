-- Make audio-files bucket public and add permissive storage policies for uploads/playback
update storage.buckets set public = true where id = 'audio-files';

-- Allow public read/upload/update/delete for audio-files bucket
create policy "Public can read audio-files"
  on storage.objects for select
  using (bucket_id = 'audio-files');

create policy "Public can upload to audio-files"
  on storage.objects for insert
  with check (bucket_id = 'audio-files');

create policy "Public can update audio-files"
  on storage.objects for update
  using (bucket_id = 'audio-files');

create policy "Public can delete audio-files"
  on storage.objects for delete
  using (bucket_id = 'audio-files');

-- Relax RLS on audio_announcements to allow client-side inserts without Supabase Auth
create policy "Public can view audio announcements"
  on public.audio_announcements for select
  using (true);

create policy "Public can insert audio announcements"
  on public.audio_announcements for insert
  with check (true);

create policy "Public can update audio announcements"
  on public.audio_announcements for update
  using (true);

create policy "Public can delete audio announcements"
  on public.audio_announcements for delete
  using (true);