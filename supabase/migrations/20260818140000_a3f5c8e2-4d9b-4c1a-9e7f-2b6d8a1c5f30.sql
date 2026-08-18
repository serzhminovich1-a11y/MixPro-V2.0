-- recordGlossaryQuiz (src/lib/glossary.functions.ts) awarded XP by writing
-- profiles.xp/level directly through the service-role client — the only
-- reason it needed that client at all, since 20260802120000 restricted
-- plain authenticated UPDATE on profiles to non-privileged columns. The
-- service-role key only exists inside Lovable Cloud's own hosting and
-- can't be exported, so this silently broke XP-on-quiz for any other
-- deployment (e.g. Vercel). Give it the same shape as
-- super_admin_self_boost: a SECURITY DEFINER RPC that only ever acts on
-- the caller's own row.
CREATE OR REPLACE FUNCTION public.award_glossary_xp(_actor uuid, _amount integer)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _next_xp integer;
BEGIN
  IF _actor <> auth.uid() THEN
    RAISE EXCEPTION 'Можно только на себя';
  END IF;
  SELECT GREATEST(xp + LEAST(GREATEST(_amount, 0), 50), 0) INTO _next_xp
    FROM public.profiles WHERE id = _actor;
  UPDATE public.profiles
     SET xp = _next_xp,
         level = 1 + floor(sqrt(_next_xp / 100.0))::int
   WHERE id = _actor;
END;
$$;
GRANT EXECUTE ON FUNCTION public.award_glossary_xp(uuid, integer) TO authenticated;
