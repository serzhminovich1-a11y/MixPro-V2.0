-- 1) Custom status text on the profile ("поставить статус") — short,
-- self-set, shown next to the name. Not online/offline presence (no
-- realtime infra exists for that) — a status *message*, same idea as
-- bio/accent_color/display_font already are.
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS status_text text;

-- profiles has historically needed its own explicit column-level SELECT
-- grant per field for anon/authenticated (see banner_url/accent_color/
-- display_font in 20260820090000) despite the table-level GRANT SELECT —
-- matching that same defensive pattern here.
GRANT SELECT (status_text) ON public.profiles TO anon, authenticated;
GRANT UPDATE (status_text) ON public.profiles TO authenticated;

-- 2) Screenshots — a personal image gallery on the profile (first of the
-- Steam-reference sidebar sections). Self-service, same shape as the wall
-- (posts) — own rows only for insert/delete, publicly readable, with the
-- same is_hidden moderation column the rest of user content already has.
CREATE TABLE public.screenshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  author_id uuid NOT NULL,
  image_url text NOT NULL,
  caption text,
  is_hidden boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.screenshots TO anon;
GRANT SELECT, INSERT, DELETE ON public.screenshots TO authenticated;
GRANT ALL ON public.screenshots TO service_role;
ALTER TABLE public.screenshots ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Screenshots visible" ON public.screenshots FOR SELECT
  USING (is_hidden = false OR public.can_moderate(auth.uid()) OR author_id = auth.uid());
CREATE POLICY "Users add own screenshots" ON public.screenshots FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = author_id);
CREATE POLICY "Authors delete own screenshots" ON public.screenshots FOR DELETE TO authenticated
  USING (auth.uid() = author_id);
CREATE POLICY "Moderators hide screenshots" ON public.screenshots FOR UPDATE TO authenticated
  USING (public.can_moderate(auth.uid())) WITH CHECK (public.can_moderate(auth.uid()));

-- 3) Public visitors need to know whether a *profile owner* (not
-- themselves) has an active paid subscription, to gate the full-page
-- background perk on the public /u/:username view. has_active_subscription
-- already computes exactly this as a boolean with no sensitive fields
-- exposed — was only ever granted to `authenticated`; extending to `anon`
-- so logged-out visitors see the same gating instead of it silently
-- failing (getProfileByUsername runs under the anon key server-side too).
GRANT EXECUTE ON FUNCTION public.has_active_subscription(uuid) TO anon;
