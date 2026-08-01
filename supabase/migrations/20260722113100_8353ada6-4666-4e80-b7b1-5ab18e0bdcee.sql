DROP POLICY IF EXISTS "Lessons are publicly readable" ON public.lessons;
DROP POLICY IF EXISTS "Modules readable by all" ON public.course_modules;

-- Tighten lesson-assets storage: only allow reading assets of published lessons
DROP POLICY IF EXISTS "lesson_assets_read" ON storage.objects;
CREATE POLICY "lesson_assets_read_published" ON storage.objects
FOR SELECT
USING (
  bucket_id = 'lesson-assets'
  AND (
    public.can_moderate(auth.uid())
    OR EXISTS (
      SELECT 1 FROM public.lessons l
      WHERE l.is_published = true
        AND position(l.id::text in name) > 0
    )
  )
);