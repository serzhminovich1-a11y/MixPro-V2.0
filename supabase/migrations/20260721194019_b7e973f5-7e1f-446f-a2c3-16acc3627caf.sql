
-- 1. Extend lessons and modules with editor-friendly fields
ALTER TABLE public.lessons
  ADD COLUMN IF NOT EXISTS content_blocks JSONB NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS is_published BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now();

ALTER TABLE public.course_modules
  ADD COLUMN IF NOT EXISTS is_published BOOLEAN NOT NULL DEFAULT true;

-- 2. Updated_at trigger for lessons
DROP TRIGGER IF EXISTS trg_lessons_updated_at ON public.lessons;
CREATE TRIGGER trg_lessons_updated_at
  BEFORE UPDATE ON public.lessons
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 3. RLS: admins/moderators can manage; public reads only published
-- Lessons
DROP POLICY IF EXISTS "lessons_public_read" ON public.lessons;
DROP POLICY IF EXISTS "Lessons are viewable by everyone" ON public.lessons;
DROP POLICY IF EXISTS "lessons_read_published" ON public.lessons;
DROP POLICY IF EXISTS "lessons_read_moderators" ON public.lessons;
DROP POLICY IF EXISTS "lessons_write_moderators" ON public.lessons;

CREATE POLICY "lessons_read_published" ON public.lessons
  FOR SELECT USING (is_published = true);
CREATE POLICY "lessons_read_moderators" ON public.lessons
  FOR SELECT TO authenticated USING (public.can_moderate(auth.uid()));
CREATE POLICY "lessons_write_moderators" ON public.lessons
  FOR ALL TO authenticated
  USING (public.can_moderate(auth.uid()))
  WITH CHECK (public.can_moderate(auth.uid()));

-- Course modules
DROP POLICY IF EXISTS "modules_public_read" ON public.course_modules;
DROP POLICY IF EXISTS "Modules are viewable by everyone" ON public.course_modules;
DROP POLICY IF EXISTS "modules_read_published" ON public.course_modules;
DROP POLICY IF EXISTS "modules_read_moderators" ON public.course_modules;
DROP POLICY IF EXISTS "modules_write_moderators" ON public.course_modules;

CREATE POLICY "modules_read_published" ON public.course_modules
  FOR SELECT USING (is_published = true);
CREATE POLICY "modules_read_moderators" ON public.course_modules
  FOR SELECT TO authenticated USING (public.can_moderate(auth.uid()));
CREATE POLICY "modules_write_moderators" ON public.course_modules
  FOR ALL TO authenticated
  USING (public.can_moderate(auth.uid()))
  WITH CHECK (public.can_moderate(auth.uid()));
