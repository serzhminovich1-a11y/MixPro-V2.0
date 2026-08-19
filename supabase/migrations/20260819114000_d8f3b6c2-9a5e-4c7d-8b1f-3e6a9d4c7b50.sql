-- SECURITY FIX — can_act_on(_actor, _target) has, since it was created
-- (20260721193626), only ever compared the RANK of the two given UUIDs.
-- It never verified `_actor` actually IS the real caller. Every RLS
-- policy that uses it passes `auth.uid()` directly as `_actor`, so those
-- were always safe — but four SECURITY DEFINER functions
-- (admin_set_verified, admin_set_subscription, admin_extend_subscription,
-- admin_adjust_xp) take `_actor` as a plain client-supplied parameter and
-- pass THAT straight into can_act_on, unchecked against auth.uid().
--
-- Concretely: any signed-in account — not an admin, just any registered
-- user — could call e.g. admin_set_subscription with
-- _actor = <any real admin's user id> (not meaningfully secret: visible
-- on public profile pages, forum posts, etc.) and _target = themselves,
-- and grant themselves a free Lifetime subscription, a verified badge, or
-- unlimited XP. Confirmed these four functions are NOT anonymously
-- reachable (properly restricted to `authenticated`), but "any logged-in
-- account" is still a trivial bar — self-registration is open.
--
-- One fix at the root closes all four at once, with zero changes needed
-- anywhere can_act_on is already called correctly (every RLS policy
-- already passes auth.uid() as _actor, so this is strictly narrowing,
-- never breaking anything that was legitimately working).
CREATE OR REPLACE FUNCTION public.can_act_on(_actor uuid, _target uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT
    _actor IS NOT NULL
    AND _actor = auth.uid()
    AND _actor <> _target
    AND public.role_rank(COALESCE(public.max_role(_actor), 'user'::public.app_role))
        > public.role_rank(COALESCE(public.max_role(_target), 'user'::public.app_role))
    AND public.role_rank(COALESCE(public.max_role(_actor), 'user'::public.app_role)) >= 2;
$$;

-- Same missing-identity-check pattern in claim_super_admin (20260802120000)
-- — never verified _actor = auth.uid(), so anyone could technically hand
-- super_admin to an arbitrary uuid, not even themselves. Currently inert in
-- practice (a super_admin already exists, so the "already claimed" check
-- always fires first and the function is a permanent no-op) — fixing for
-- correctness/defense-in-depth, not because it's live-exploitable today.
CREATE OR REPLACE FUNCTION public.claim_super_admin(_actor uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF _actor IS NULL OR _actor IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'Можно только на себя';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtext('mixpro.claim_super_admin'));
  IF EXISTS (SELECT 1 FROM public.user_roles WHERE role = 'super_admin') THEN
    RAISE EXCEPTION 'Супер-админ уже назначен';
  END IF;
  INSERT INTO public.user_roles (user_id, role) VALUES (_actor, 'super_admin');
END;
$$;
