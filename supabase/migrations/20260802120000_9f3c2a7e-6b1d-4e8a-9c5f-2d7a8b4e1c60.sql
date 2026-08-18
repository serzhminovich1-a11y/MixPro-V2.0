-- Security fixes found in a full app audit (2026-08-02).
--
-- 1) `profiles` had a blanket `GRANT UPDATE` (from the very first migration)
--    combined with a row-only RLS policy (`auth.uid() = id`). Because Postgres
--    grants and RLS are independent layers, ANY authenticated user could
--    update ANY column on their own row via the client SDK directly —
--    including xp, level, subscription_tier and verified — completely
--    bypassing the admin-gated RPCs below. Restrict self-service updates to
--    genuinely user-owned profile fields; privileged fields are only
--    reachable through SECURITY DEFINER RPCs from here on.
REVOKE UPDATE ON public.profiles FROM authenticated;
GRANT UPDATE (username, avatar_url, bio, full_name, socials) ON public.profiles TO authenticated;

-- 2) `game_scores.score` was inserted straight from the client with no
--    server-side bound, and `award_xp()` added it to profile XP with no cap —
--    any authenticated user could insert one row with an arbitrary score and
--    instantly top the leaderboard / gain unlimited XP. Cap it generously
--    above the highest legitimate single-session score we found in the code
--    (frequency.tsx: 8 rounds x (100 + 300 perfection bonus) = 3200).
--    NOT VALID so this doesn't fail if a row already violates it — new/changed
--    rows are bound immediately either way.
ALTER TABLE public.game_scores
  ADD CONSTRAINT game_scores_score_range CHECK (score >= 0 AND score <= 5000) NOT VALID;

CREATE OR REPLACE FUNCTION public.award_xp()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _awarded integer := LEAST(GREATEST(NEW.score, 0), 5000);
BEGIN
  UPDATE public.profiles
  SET xp = xp + _awarded,
      level = 1 + floor(sqrt((xp + _awarded) / 100.0))::int
  WHERE id = NEW.user_id;
  RETURN NEW;
END;
$$;

-- 3) `setRole` (src/lib/admin.functions.ts) relies on the hierarchical RLS
--    policies below (already present since 20260721193626), but the base
--    table grant was never widened past SELECT — so every promote/demote
--    call has been failing at the grant layer before RLS even runs, for
--    every admin including legitimate ones. Not a vulnerability, but broken.
GRANT INSERT, DELETE ON public.user_roles TO authenticated;

-- 4) `toggleVerified` (src/routes/_authenticated/admin.options.tsx) wrote
--    directly to `profiles.verified` for an arbitrary target user via the
--    plain client — which only ever worked for editing your OWN row (see #1),
--    so verifying a different user has been silently failing via RLS. Give
--    it a proper hierarchical RPC, mirroring admin_set_subscription.
CREATE OR REPLACE FUNCTION public.admin_set_verified(_actor uuid, _target uuid, _verified boolean)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.can_act_on(_actor, _target) THEN
    RAISE EXCEPTION 'Недостаточно прав';
  END IF;
  UPDATE public.profiles SET verified = _verified WHERE id = _target;
END;
$$;
GRANT EXECUTE ON FUNCTION public.admin_set_verified(uuid, uuid, boolean) TO authenticated;

-- 5) The self-boost panel also lets a super-admin set their own `level`
--    directly (not just via an xp delta). super_admin_self_boost didn't
--    support that, so the UI was bypassing it and writing to the table raw
--    (same class of bug as #4, just on your own row instead of a target's).
--    Extend it with an optional explicit level override.
DROP FUNCTION IF EXISTS public.super_admin_self_boost(uuid, integer, boolean);
CREATE OR REPLACE FUNCTION public.super_admin_self_boost(
  _actor uuid,
  _delta_xp integer,
  _verified boolean,
  _level integer DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _next_xp integer;
BEGIN
  IF NOT public.is_super_admin(_actor) THEN
    RAISE EXCEPTION 'Только для супер-админа';
  END IF;
  IF _actor <> auth.uid() THEN
    RAISE EXCEPTION 'Можно только на себя';
  END IF;
  SELECT GREATEST(xp + COALESCE(_delta_xp, 0), 0) INTO _next_xp FROM public.profiles WHERE id = _actor;
  UPDATE public.profiles
     SET xp = _next_xp,
         level = GREATEST(1, LEAST(999, COALESCE(_level, 1 + floor(sqrt(_next_xp / 100.0))::int))),
         verified = COALESCE(_verified, verified)
   WHERE id = _actor;
END;
$$;
GRANT EXECUTE ON FUNCTION public.super_admin_self_boost(uuid, integer, boolean, integer) TO authenticated;

-- 6) claimSuperAdmin (src/lib/admin.functions.ts) did a check-then-insert
--    across two separate service-role calls from application code — two
--    concurrent callers could both pass the "no super_admin yet" check
--    before either insert commits. Move the check-and-insert into one
--    SECURITY DEFINER function serialized with an advisory lock, so the
--    race is closed at the database level regardless of caller.
CREATE OR REPLACE FUNCTION public.claim_super_admin(_actor uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext('mixpro.claim_super_admin'));
  IF EXISTS (SELECT 1 FROM public.user_roles WHERE role = 'super_admin') THEN
    RAISE EXCEPTION 'Супер-админ уже назначен';
  END IF;
  INSERT INTO public.user_roles (user_id, role) VALUES (_actor, 'super_admin');
END;
$$;
GRANT EXECUTE ON FUNCTION public.claim_super_admin(uuid) TO authenticated;

-- 7) recordGlossaryQuiz awarded +5 XP on every call with correct:true, with
--    no bound — the app already sends the full glossary (answers included)
--    to the client, so this can't be made fully tamper-proof without
--    reworking the quiz to be server-generated; the practical fix is capping
--    the reward so repeat-answering the same term can't farm XP.
--    Nothing to do here at the SQL level — see glossary.functions.ts.
