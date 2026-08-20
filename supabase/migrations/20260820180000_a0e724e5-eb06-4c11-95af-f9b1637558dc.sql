-- Reviews (second of the Steam-reference sidebar sections). Scoped to
-- presets specifically — the one piece of user-uploaded catalog content
-- that already has a public browsing page (/presets) and a download
-- count but no rating/feedback loop at all. One review per (user, preset)
-- — UNIQUE + upsert-on-conflict from the app, same "edit your own"
-- pattern as everywhere else rather than allowing duplicate spam reviews.
CREATE TABLE public.preset_reviews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  preset_id uuid NOT NULL REFERENCES public.presets(id) ON DELETE CASCADE,
  author_id uuid NOT NULL,
  rating smallint NOT NULL CHECK (rating BETWEEN 1 AND 5),
  content text,
  is_hidden boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (preset_id, author_id)
);

GRANT SELECT ON public.preset_reviews TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.preset_reviews TO authenticated;
GRANT ALL ON public.preset_reviews TO service_role;
ALTER TABLE public.preset_reviews ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Reviews visible" ON public.preset_reviews FOR SELECT
  USING (is_hidden = false OR public.can_moderate(auth.uid()) OR author_id = auth.uid());
CREATE POLICY "Users add own reviews" ON public.preset_reviews FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = author_id);
CREATE POLICY "Authors update own reviews" ON public.preset_reviews FOR UPDATE TO authenticated
  USING (auth.uid() = author_id OR public.can_moderate(auth.uid()))
  WITH CHECK (auth.uid() = author_id OR public.can_moderate(auth.uid()));
CREATE POLICY "Authors delete own reviews" ON public.preset_reviews FOR DELETE TO authenticated
  USING (auth.uid() = author_id OR public.can_moderate(auth.uid()));
