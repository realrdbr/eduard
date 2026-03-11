-- Update loan duration from 14 days to 30 days
ALTER TABLE public.loans 
ALTER COLUMN due_date SET DEFAULT (now() + '30 days'::interval);