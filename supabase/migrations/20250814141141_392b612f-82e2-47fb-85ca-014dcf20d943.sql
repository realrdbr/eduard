-- Add must_change_password column to permissions table
ALTER TABLE permissions ADD COLUMN IF NOT EXISTS must_change_password BOOLEAN DEFAULT true;