
-- Table for global substitution settings
CREATE TABLE public.substitution_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  key text UNIQUE NOT NULL,
  value jsonb NOT NULL,
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE public.substitution_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Everyone can view substitution settings"
  ON public.substitution_settings FOR SELECT
  USING (true);

CREATE POLICY "Level 10+ can manage substitution settings"
  ON public.substitution_settings FOR ALL
  USING (current_user_has_permission_level((10)::smallint))
  WITH CHECK (current_user_has_permission_level((10)::smallint));

INSERT INTO public.substitution_settings (key, value)
VALUES ('weekly_limit', '26');

-- Table for per-teacher weekly limit overrides
CREATE TABLE public.teacher_weekly_limits (
  teacher_shortened text PRIMARY KEY REFERENCES public.teachers(shortened) ON DELETE CASCADE,
  weekly_limit int NOT NULL DEFAULT 26,
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE public.teacher_weekly_limits ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Everyone can view teacher weekly limits"
  ON public.teacher_weekly_limits FOR SELECT
  USING (true);

CREATE POLICY "Level 10+ can manage teacher weekly limits"
  ON public.teacher_weekly_limits FOR ALL
  USING (current_user_has_permission_level((10)::smallint))
  WITH CHECK (current_user_has_permission_level((10)::smallint));
