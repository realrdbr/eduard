-- First remove duplicate user_sessions entries, keeping only the most recent one per user
DELETE FROM user_sessions
WHERE id NOT IN (
  SELECT DISTINCT ON (user_id) id
  FROM user_sessions
  ORDER BY user_id, created_at DESC
);

-- Now add the unique constraint
ALTER TABLE user_sessions 
ADD CONSTRAINT user_sessions_user_id_unique UNIQUE (user_id);