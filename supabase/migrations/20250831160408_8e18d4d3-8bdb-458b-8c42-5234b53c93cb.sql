-- Create user_themes table for storing custom themes per user
CREATE TABLE IF NOT EXISTS public.user_themes (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id BIGINT NOT NULL,
  name TEXT NOT NULL DEFAULT 'Custom',
  colors JSONB NOT NULL DEFAULT '{"background": "0 0% 100%", "foreground": "222.2 84% 4.9%", "primary": "222.2 47.4% 11.2%", "primary-foreground": "210 40% 98%", "secondary": "210 40% 96.1%", "secondary-foreground": "222.2 47.4% 11.2%", "accent": "210 40% 96.1%", "accent-foreground": "222.2 47.4% 11.2%", "muted": "210 40% 96.1%", "muted-foreground": "215.4 16.3% 46.9%", "border": "214.3 31.8% 91.4%", "card": "0 0% 100%", "card-foreground": "222.2 84% 4.9%"}',
  is_active BOOLEAN NOT NULL DEFAULT false,
  is_preset BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable Row Level Security
ALTER TABLE public.user_themes ENABLE ROW LEVEL SECURITY;

-- Create policies for user themes
CREATE POLICY "Users can view their own themes" 
ON public.user_themes 
FOR SELECT 
USING (user_id IN (SELECT id FROM permissions WHERE username = CURRENT_USER));

CREATE POLICY "Users can create their own themes" 
ON public.user_themes 
FOR INSERT 
WITH CHECK (user_id IN (SELECT id FROM permissions WHERE username = CURRENT_USER));

CREATE POLICY "Users can update their own themes" 
ON public.user_themes 
FOR UPDATE 
USING (user_id IN (SELECT id FROM permissions WHERE username = CURRENT_USER));

CREATE POLICY "Users can delete their own themes" 
ON public.user_themes 
FOR DELETE 
USING (user_id IN (SELECT id FROM permissions WHERE username = CURRENT_USER));

-- Create trigger for automatic timestamp updates
CREATE TRIGGER update_user_themes_updated_at
BEFORE UPDATE ON public.user_themes
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();