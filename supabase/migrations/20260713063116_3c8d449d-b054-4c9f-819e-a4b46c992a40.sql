-- Storage RLS: private buckets, readable by any authenticated user, writable by owner (folder = user id)
CREATE POLICY "Authenticated can read presets files" ON storage.objects
FOR SELECT TO authenticated USING (bucket_id = 'presets');
CREATE POLICY "Users upload own preset files" ON storage.objects
FOR INSERT TO authenticated WITH CHECK (bucket_id = 'presets' AND (storage.foldername(name))[1] = auth.uid()::text);
CREATE POLICY "Users delete own preset files" ON storage.objects
FOR DELETE TO authenticated USING (bucket_id = 'presets' AND (storage.foldername(name))[1] = auth.uid()::text);

CREATE POLICY "Authenticated can read avatar files" ON storage.objects
FOR SELECT TO authenticated USING (bucket_id = 'avatars');
CREATE POLICY "Users upload own avatar" ON storage.objects
FOR INSERT TO authenticated WITH CHECK (bucket_id = 'avatars' AND (storage.foldername(name))[1] = auth.uid()::text);
CREATE POLICY "Users update own avatar" ON storage.objects
FOR UPDATE TO authenticated USING (bucket_id = 'avatars' AND (storage.foldername(name))[1] = auth.uid()::text);
CREATE POLICY "Users delete own avatar" ON storage.objects
FOR DELETE TO authenticated USING (bucket_id = 'avatars' AND (storage.foldername(name))[1] = auth.uid()::text);