-- Add class assignment column to permissions table
ALTER TABLE public.permissions 
ADD COLUMN user_class text CHECK (user_class IN ('10b', '10c') OR user_class IS NULL);

-- Add comment for clarity
COMMENT ON COLUMN public.permissions.user_class IS 'Assigned class for users, only 10b and 10c available';