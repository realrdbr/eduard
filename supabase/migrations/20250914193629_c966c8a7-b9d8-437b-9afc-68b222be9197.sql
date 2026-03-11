-- Fix user_sessions constraint issue - add unique constraint on user_id for on_conflict
ALTER TABLE user_sessions 
ADD CONSTRAINT user_sessions_user_id_unique UNIQUE (user_id);