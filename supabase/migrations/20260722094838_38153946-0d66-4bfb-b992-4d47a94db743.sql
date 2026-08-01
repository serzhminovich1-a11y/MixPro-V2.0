ALTER TABLE public.posts
  ADD COLUMN IF NOT EXISTS genre text,
  ADD COLUMN IF NOT EXISTS play_count integer NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS public.post_saves (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id uuid NOT NULL REFERENCES public.posts(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (post_id, user_id)
);

GRANT SELECT, INSERT, DELETE ON public.post_saves TO authenticated;
GRANT ALL ON public.post_saves TO service_role;

ALTER TABLE public.post_saves ENABLE ROW LEVEL SECURITY;

CREATE POLICY "post_saves_owner_read" ON public.post_saves
FOR SELECT TO authenticated
USING (auth.uid() = user_id);

CREATE POLICY "post_saves_owner_insert" ON public.post_saves
FOR INSERT TO authenticated
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "post_saves_owner_delete" ON public.post_saves
FOR DELETE TO authenticated
USING (auth.uid() = user_id);

CREATE OR REPLACE FUNCTION public.increment_post_play(_post_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  new_count integer;
BEGIN
  UPDATE public.posts
  SET play_count = COALESCE(play_count, 0) + 1
  WHERE id = _post_id
  RETURNING play_count INTO new_count;
  RETURN COALESCE(new_count, 0);
END;
$$;

GRANT EXECUTE ON FUNCTION public.increment_post_play(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.increment_post_play(uuid) TO anon;