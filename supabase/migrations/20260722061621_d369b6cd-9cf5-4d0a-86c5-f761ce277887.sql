ALTER TABLE public.lessons ADD COLUMN IF NOT EXISTS is_premium boolean NOT NULL DEFAULT false;
ALTER TABLE public.presets ADD COLUMN IF NOT EXISTS is_premium boolean NOT NULL DEFAULT false;
ALTER TABLE public.course_modules ADD COLUMN IF NOT EXISTS is_premium boolean NOT NULL DEFAULT false;