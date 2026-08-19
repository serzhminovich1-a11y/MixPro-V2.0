-- log_admin_action (20260819110000) has a narrow forgery hole: the check
-- `_actor IS DISTINCT FROM auth.uid()` treats two NULLs as "not distinct",
-- so a fully anonymous caller (no session at all — auth.uid() is NULL)
-- passing _actor = NULL sails straight past the check. Confirmed live via
-- a direct anon-key REST probe right after this function shipped: it
-- reached the INSERT and only failed because admin_action_log.actor_id
-- happens to be NOT NULL — an accident of schema, not a real guarantee.
-- Reject a NULL actor outright so the anti-forgery property holds
-- regardless of that column ever changing.
--
-- Also: Postgres functions are executable by PUBLIC by default unless
-- revoked, so despite only ever `GRANT`ing to `authenticated`, an anon
-- (unauthenticated) caller could invoke this at all. Revoking PUBLIC access
-- first makes the existing "only `authenticated` can call this" assumption
-- (the thing Lovable's linter flagged as expected/safe) actually true.
CREATE OR REPLACE FUNCTION public.log_admin_action(_actor uuid, _action text, _target uuid, _meta jsonb DEFAULT '{}'::jsonb)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF _actor IS NULL OR _actor IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'Можно логировать только свои действия';
  END IF;
  INSERT INTO public.admin_action_log (actor_id, action, target_id, meta)
  VALUES (_actor, _action, _target, COALESCE(_meta, '{}'::jsonb));
END;
$$;
REVOKE ALL ON FUNCTION public.log_admin_action(uuid, text, uuid, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.log_admin_action(uuid, text, uuid, jsonb) TO authenticated;

-- Unrelated to the above, found while probing the live database directly:
-- award_glossary_xp (20260818140000) doesn't exist on the live DB at all —
-- that migration was apparently never actually relayed/applied. Not a
-- crash (recordGlossaryQuiz in glossary.functions.ts already treats the
-- XP award as best-effort, wrapped in try/catch, specifically anticipating
-- this), but it does mean the +5 XP reward for a correct glossary-quiz
-- answer has been silently doing nothing in production. Re-creating it
-- here, with the same NULL-safe actor check as the log_admin_action fix
-- above and an explicit PUBLIC revoke for consistency.
CREATE OR REPLACE FUNCTION public.award_glossary_xp(_actor uuid, _amount integer)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _next_xp integer;
BEGIN
  IF _actor IS NULL OR _actor IS DISTINCT FROM auth.uid() THEN
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
REVOKE ALL ON FUNCTION public.award_glossary_xp(uuid, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.award_glossary_xp(uuid, integer) TO authenticated;
