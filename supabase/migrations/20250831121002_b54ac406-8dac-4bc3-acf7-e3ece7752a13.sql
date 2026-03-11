-- Create user_themes table for individual color settings
CREATE TABLE public.user_themes (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id BIGINT NOT NULL,
  name TEXT NOT NULL DEFAULT 'Custom',
  is_preset BOOLEAN NOT NULL DEFAULT false,
  colors JSONB NOT NULL DEFAULT '{
    "background": "0 0% 100%",
    "foreground": "222.2 84% 4.9%",
    "primary": "222.2 47.4% 11.2%",
    "primary-foreground": "210 40% 98%",
    "secondary": "210 40% 96.1%",
    "secondary-foreground": "222.2 47.4% 11.2%",
    "accent": "210 40% 96.1%",
    "accent-foreground": "222.2 47.4% 11.2%",
    "muted": "210 40% 96.1%",
    "muted-foreground": "215.4 16.3% 46.9%",
    "border": "214.3 31.8% 91.4%",
    "card": "0 0% 100%",
    "card-foreground": "222.2 84% 4.9%"
  }',
  is_active BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  FOREIGN KEY (user_id) REFERENCES permissions(id) ON DELETE CASCADE
);

-- Enable RLS
ALTER TABLE public.user_themes ENABLE ROW LEVEL SECURITY;

-- RLS policies
CREATE POLICY "Users can view their own themes" 
ON public.user_themes 
FOR SELECT 
USING (user_id IN (SELECT id FROM permissions WHERE username = current_user));

CREATE POLICY "Users can create their own themes" 
ON public.user_themes 
FOR INSERT 
WITH CHECK (user_id IN (SELECT id FROM permissions WHERE username = current_user));

CREATE POLICY "Users can update their own themes" 
ON public.user_themes 
FOR UPDATE 
USING (user_id IN (SELECT id FROM permissions WHERE username = current_user));

CREATE POLICY "Users can delete their own themes" 
ON public.user_themes 
FOR DELETE 
USING (user_id IN (SELECT id FROM permissions WHERE username = current_user));

-- Create trigger for updating timestamps
CREATE TRIGGER update_user_themes_updated_at
BEFORE UPDATE ON public.user_themes
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();