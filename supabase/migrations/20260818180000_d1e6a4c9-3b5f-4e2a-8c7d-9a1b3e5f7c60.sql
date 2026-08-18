-- "permission denied for function super_admin_self_boost" when using the
-- super-admin panel (XP/level/verified/subscription grants).
--
-- Two separate causes found:
--
-- 1) admin_set_subscription / admin_extend_subscription (20260722054558)
--    were never given a GRANT EXECUTE at all — a genuine gap in that
--    migration, not a relay/application issue. Supabase revokes EXECUTE
--    from PUBLIC on newly created functions by default (unlike the
--    Postgres default of granting it), so without an explicit grant these
--    have been permission-denied for every caller since the day they were
--    written, superadmin or not.
--
-- 2) super_admin_self_boost / admin_set_verified / claim_super_admin
--    (20260802120000) DO have GRANT EXECUTE right there in the file, but
--    that migration bundles several unrelated statements (a REVOKE, an
--    ALTER TABLE ADD CONSTRAINT, function bodies) ahead of them relayed
--    by hand through Lovable's chat rather than run as one script — if
--    anything earlier in that batch didn't apply cleanly, everything
--    after it, including these grants, would silently never have landed.
--
-- Re-asserting is idempotent either way: CREATE OR REPLACE + GRANT are
-- both safe to run against a target that's already correct.

GRANT EXECUTE ON FUNCTION public.admin_adjust_xp(uuid, uuid, int) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_set_verified(uuid, uuid, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.claim_super_admin(uuid) TO authenticated;

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

CREATE OR REPLACE FUNCTION public.admin_set_subscription(
  _actor uuid,
  _target uuid,
  _tier text,
  _until timestamptz
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.can_act_on(_actor, _target) THEN
    RAISE EXCEPTION 'Недостаточно прав';
  END IF;
  IF _tier NOT IN ('free','trial','pro','lifetime') THEN
    RAISE EXCEPTION 'Неверный тариф';
  END IF;
  UPDATE public.profiles
    SET subscription_tier = _tier,
        subscription_until = _until
    WHERE id = _target;
END;
$$;
GRANT EXECUTE ON FUNCTION public.admin_set_subscription(uuid, uuid, text, timestamptz) TO authenticated;

CREATE OR REPLACE FUNCTION public.admin_extend_subscription(
  _actor uuid,
  _target uuid,
  _days integer,
  _tier text DEFAULT 'pro'
) RETURNS timestamptz
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _base timestamptz;
  _new timestamptz;
BEGIN
  IF NOT public.can_act_on(_actor, _target) THEN
    RAISE EXCEPTION 'Недостаточно прав';
  END IF;
  IF _tier NOT IN ('free','trial','pro','lifetime') THEN
    RAISE EXCEPTION 'Неверный тариф';
  END IF;
  SELECT COALESCE(GREATEST(subscription_until, now()), now()) INTO _base
    FROM public.profiles WHERE id = _target;
  _new := _base + make_interval(days => _days);
  UPDATE public.profiles
    SET subscription_tier = _tier,
        subscription_until = _new
    WHERE id = _target;
  RETURN _new;
END;
$$;
GRANT EXECUTE ON FUNCTION public.admin_extend_subscription(uuid, uuid, integer, text) TO authenticated;

-- Not called yet (no RLS policy or client code references it), but it's
-- clearly meant to gate premium content down the line — grant it now so
-- wiring it up later doesn't reproduce this exact bug report again.
GRANT EXECUTE ON FUNCTION public.has_active_subscription(uuid) TO authenticated;
