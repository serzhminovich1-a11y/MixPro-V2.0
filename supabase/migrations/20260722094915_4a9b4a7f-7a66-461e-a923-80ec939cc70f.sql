REVOKE ALL ON FUNCTION public.increment_post_play(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.increment_post_play(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.increment_post_play(uuid) TO authenticated;