-- Video (last of the four Steam-reference sidebar sections). External
-- links (YouTube), not uploaded files — no video hosting/transcoding
-- infra exists, and there's no reason to build one when embedding does
-- the job. Same RLS shape as screenshots/guides/reviews.
CREATE TABLE public.videos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  author_id uuid NOT NULL,
  title text NOT NULL,
  url text NOT NULL,
  is_hidden boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.videos TO anon;
GRANT SELECT, INSERT, DELETE ON public.videos TO authenticated;
GRANT ALL ON public.videos TO service_role;
ALTER TABLE public.videos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Videos visible" ON public.videos FOR SELECT
  USING (is_hidden = false OR public.can_moderate(auth.uid()) OR author_id = auth.uid());
CREATE POLICY "Users add own videos" ON public.videos FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = author_id);
CREATE POLICY "Authors delete own videos" ON public.videos FOR DELETE TO authenticated
  USING (auth.uid() = author_id OR public.can_moderate(auth.uid()));
