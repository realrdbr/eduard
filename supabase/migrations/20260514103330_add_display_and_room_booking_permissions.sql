-- Ensure BERT display and room booking permissions exist for permission management
INSERT INTO public.permission_definitions (id, name, description, requires_level)
VALUES
  ('display_management', 'Display-Verwaltung', 'BERT E-Paper Displays verwalten', 8),
  ('room_booking', 'Raumbelegung & Buchung', 'Räume einsehen und spontan buchen', 5)
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  requires_level = EXCLUDED.requires_level;

-- Ensure level defaults exist for all levels (1-10)
WITH permission_defaults AS (
  SELECT *
  FROM (
    VALUES
      ('display_management'::text, 8::smallint),
      ('room_booking'::text, 5::smallint)
  ) AS v(permission_id, requires_level)
)
INSERT INTO public.level_permissions (level, permission_id, allowed)
SELECT
  levels.level::smallint,
  permission_defaults.permission_id,
  (levels.level >= permission_defaults.requires_level) AS allowed
FROM generate_series(1, 10) AS levels(level)
CROSS JOIN permission_defaults
ON CONFLICT (level, permission_id) DO UPDATE
SET
  allowed = EXCLUDED.allowed,
  updated_at = NOW();
