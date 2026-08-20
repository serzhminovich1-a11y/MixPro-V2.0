-- Guides (fourth of the Steam-reference sidebar sections — "Руководства").
-- Self-service long-form write-ups, same shape/RLS pattern as screenshots
-- and reviews. Plain text content (whitespace-pre-wrap on render, same
-- convention as bio/wall posts) rather than rich HTML — no new HTML-
-- sanitization surface to get wrong for public, self-authored content.
CREATE TABLE public.guides (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  author_id uuid NOT NULL,
  title text NOT NULL,
  content text NOT NULL,
  cover_image text,
  is_hidden boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.guides TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.guides TO authenticated;
GRANT ALL ON public.guides TO service_role;
ALTER TABLE public.guides ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Guides visible" ON public.guides FOR SELECT
  USING (is_hidden = false OR public.can_moderate(auth.uid()) OR author_id = auth.uid());
CREATE POLICY "Users add own guides" ON public.guides FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = author_id);
CREATE POLICY "Authors update own guides" ON public.guides FOR UPDATE TO authenticated
  USING (auth.uid() = author_id OR public.can_moderate(auth.uid()))
  WITH CHECK (auth.uid() = author_id OR public.can_moderate(auth.uid()));
CREATE POLICY "Authors delete own guides" ON public.guides FOR DELETE TO authenticated
  USING (auth.uid() = author_id OR public.can_moderate(auth.uid()));
