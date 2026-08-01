
ALTER TABLE public.posts ADD COLUMN IF NOT EXISTS tracks jsonb NOT NULL DEFAULT '[]'::jsonb;

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='post_comments' AND policyname='Moderators can delete any comment') THEN
    DROP POLICY "Moderators can delete any comment" ON public.post_comments;
  END IF;
END $$;

CREATE POLICY "Moderators can delete any comment"
  ON public.post_comments
  FOR DELETE
  TO authenticated
  USING (public.can_moderate(auth.uid()));
