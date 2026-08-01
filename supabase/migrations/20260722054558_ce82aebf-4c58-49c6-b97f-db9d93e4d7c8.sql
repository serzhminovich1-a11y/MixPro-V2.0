
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS subscription_tier text NOT NULL DEFAULT 'free',
  ADD COLUMN IF NOT EXISTS subscription_until timestamptz;

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

CREATE OR REPLACE FUNCTION public.has_active_subscription(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = _user_id
      AND (
        subscription_tier = 'lifetime'
        OR (subscription_until IS NOT NULL AND subscription_until > now())
      )
  );
$$;
