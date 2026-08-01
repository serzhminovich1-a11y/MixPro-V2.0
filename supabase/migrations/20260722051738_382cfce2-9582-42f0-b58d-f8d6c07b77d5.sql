
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS full_name text;

ALTER TABLE public.posts ADD COLUMN IF NOT EXISTS title text;
ALTER TABLE public.posts ADD COLUMN IF NOT EXISTS media_urls text[] NOT NULL DEFAULT '{}';

CREATE TABLE IF NOT EXISTS public.post_reactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id uuid NOT NULL REFERENCES public.posts(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  emoji text NOT NULL CHECK (char_length(emoji) BETWEEN 1 AND 8),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (post_id, user_id, emoji)
);
GRANT SELECT, INSERT, DELETE ON public.post_reactions TO authenticated;
GRANT SELECT ON public.post_reactions TO anon;
GRANT ALL ON public.post_reactions TO service_role;
ALTER TABLE public.post_reactions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "reactions readable" ON public.post_reactions FOR SELECT USING (true);
CREATE POLICY "reactions insert own" ON public.post_reactions FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "reactions delete own" ON public.post_reactions FOR DELETE TO authenticated USING (auth.uid() = user_id);

-- Storage policies: avatars & wall (private buckets, owner-based folder = userId)
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='storage' AND tablename='objects' AND policyname='avatars read auth') THEN
    CREATE POLICY "avatars read auth" ON storage.objects FOR SELECT TO authenticated USING (bucket_id = 'avatars');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='storage' AND tablename='objects' AND policyname='avatars insert own') THEN
    CREATE POLICY "avatars insert own" ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id='avatars' AND (storage.foldername(name))[1] = auth.uid()::text);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='storage' AND tablename='objects' AND policyname='avatars update own') THEN
    CREATE POLICY "avatars update own" ON storage.objects FOR UPDATE TO authenticated USING (bucket_id='avatars' AND (storage.foldername(name))[1] = auth.uid()::text);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='storage' AND tablename='objects' AND policyname='avatars delete own') THEN
    CREATE POLICY "avatars delete own" ON storage.objects FOR DELETE TO authenticated USING (bucket_id='avatars' AND (storage.foldername(name))[1] = auth.uid()::text);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='storage' AND tablename='objects' AND policyname='wall read auth') THEN
    CREATE POLICY "wall read auth" ON storage.objects FOR SELECT TO authenticated USING (bucket_id = 'wall');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='storage' AND tablename='objects' AND policyname='wall insert own') THEN
    CREATE POLICY "wall insert own" ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id='wall' AND (storage.foldername(name))[1] = auth.uid()::text);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='storage' AND tablename='objects' AND policyname='wall delete own') THEN
    CREATE POLICY "wall delete own" ON storage.objects FOR DELETE TO authenticated USING (bucket_id='wall' AND (storage.foldername(name))[1] = auth.uid()::text);
  END IF;
END $$;
