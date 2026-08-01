
DROP POLICY IF EXISTS "lesson_assets_read" ON storage.objects;
DROP POLICY IF EXISTS "lesson_assets_write" ON storage.objects;

CREATE POLICY "lesson_assets_read" ON storage.objects
  FOR SELECT USING (bucket_id = 'lesson-assets');

CREATE POLICY "lesson_assets_write" ON storage.objects
  FOR ALL TO authenticated
  USING (bucket_id = 'lesson-assets' AND public.can_moderate(auth.uid()))
  WITH CHECK (bucket_id = 'lesson-assets' AND public.can_moderate(auth.uid()));
