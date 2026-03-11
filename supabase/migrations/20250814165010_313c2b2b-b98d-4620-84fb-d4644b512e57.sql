-- Add cron job to automatically delete old conversations (older than 7 days)
-- This will run every day at midnight
SELECT cron.schedule(
  'cleanup-old-chat-conversations',
  '0 0 * * *', -- every day at midnight
  $$
  SELECT public.cleanup_old_conversations();
  $$
);