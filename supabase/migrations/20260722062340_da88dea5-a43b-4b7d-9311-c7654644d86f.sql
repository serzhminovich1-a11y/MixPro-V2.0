
-- 1. Verified flag on profiles
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS verified boolean NOT NULL DEFAULT false;

-- 2. Timecode comments on tracks (SoundCloud-style)
CREATE TABLE IF NOT EXISTS public.track_comments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id uuid NOT NULL REFERENCES public.posts(id) ON DELETE CASCADE,
  track_index integer NOT NULL DEFAULT 0,
  author_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  parent_id uuid REFERENCES public.track_comments(id) ON DELETE CASCADE,
  timestamp_ms integer,
  content text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.track_comments TO authenticated;
GRANT SELECT ON public.track_comments TO anon;
GRANT ALL ON public.track_comments TO service_role;

ALTER TABLE public.track_comments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "track_comments_read_all" ON public.track_comments
  FOR SELECT USING (true);

CREATE POLICY "track_comments_insert_own" ON public.track_comments
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = author_id);

CREATE POLICY "track_comments_update_own" ON public.track_comments
  FOR UPDATE TO authenticated
  USING (auth.uid() = author_id)
  WITH CHECK (auth.uid() = author_id);

CREATE POLICY "track_comments_delete_own_or_mod" ON public.track_comments
  FOR DELETE TO authenticated
  USING (
    auth.uid() = author_id
    OR public.can_moderate(auth.uid())
  );

CREATE INDEX IF NOT EXISTS track_comments_post_idx ON public.track_comments(post_id, track_index, created_at);
CREATE INDEX IF NOT EXISTS track_comments_parent_idx ON public.track_comments(parent_id);

CREATE TRIGGER track_comments_set_updated
  BEFORE UPDATE ON public.track_comments
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 3. Super-admin self-boost (XP + verified only; roles/bans/subscription still blocked)
CREATE OR REPLACE FUNCTION public.super_admin_self_boost(
  _actor uuid,
  _delta_xp integer,
  _verified boolean
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_super_admin(_actor) THEN
    RAISE EXCEPTION 'Только для супер-админа';
  END IF;
  IF _actor <> auth.uid() THEN
    RAISE EXCEPTION 'Можно только на себя';
  END IF;
  UPDATE public.profiles
     SET xp = GREATEST(xp + COALESCE(_delta_xp, 0), 0),
         level = 1 + floor(sqrt(GREATEST(xp + COALESCE(_delta_xp, 0), 0) / 100.0))::int,
         verified = COALESCE(_verified, verified)
   WHERE id = _actor;
END;
$$;

GRANT EXECUTE ON FUNCTION public.super_admin_self_boost(uuid, integer, boolean) TO authenticated;
